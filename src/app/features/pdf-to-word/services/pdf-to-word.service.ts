import { Injectable, inject } from '@angular/core';
import {
  buildDocx,
  joinRunLines,
  parseInlineMarkup,
  type DocParagraph,
  type DocRun,
} from '../../../core/docx/docx-builder';
import { AppError } from '../../../core/errors';
import { closePdf, releaseCanvas } from '../../../core/pdf/pdfjs';
import type { OcrBlock } from '../../pdf/services/ocr.service';
import { OcrService } from '../../pdf/services/ocr.service';
import { mergeNativeParagraphs, type MergedParagraphBlock } from '../../pdf/services/paragraph-merger';
import { PdfLoaderService } from '../../pdf/services/pdf-loader.service';

/**
 * Mesma escala do editor, e pelo mesmo motivo registrado lá: a 1× o Tesseract
 * recebe um A4 a 72 DPI, bem abaixo dos ~150 de que precisa, e um Tesseract
 * subalimentado devolve GEOMETRIA ruim — não só caracteres ruins. Como o corpo
 * da fonte aqui é derivado da altura da caixa, uma caixa inflada vira um
 * parágrafo com fonte três vezes maior no Word.
 */
const OCR_RENDER_SCALE = 3;

export type PdfToWordOcrLang = 'por' | 'eng' | 'por+eng';

export interface PdfToWordOptions {
  file: File;
  password?: string;
  /** Rodar OCR nas páginas sem camada de texto nativa. */
  useOcr: boolean;
  ocrLang: PdfToWordOcrLang;
  /** Manter as quebras de linha do PDF em vez de deixar o Word refluir. */
  preserveLineBreaks: boolean;
  onProgress?: (percent: number) => void;
}

export interface PdfToWordResult {
  blob: Blob;
  filename: string;
  pageCount: number;
  /** Páginas sem texto nativo (que exigiram OCR, ou foram puladas sem ele). */
  scannedPages: number;
  /** Páginas escaneadas que ficaram de fora por o OCR estar desligado. */
  skippedPages: number;
  paragraphCount: number;
}

/**
 * Converte um PDF em .docx inteiramente no navegador.
 *
 * São dois caminhos de extração, escolhidos por página e não pelo documento —
 * um PDF de processo costuma misturar petição digital com anexo escaneado:
 *
 *   • página digital  → `mergeNativeParagraphs` sobre os blocos do pdf.js.
 *     Traz corpo de fonte exato em pt, negrito/itálico por trecho, cor e
 *     família. É o caminho fiel.
 *   • página escaneada → render a 3× e `OcrService.recognise`, que já devolve
 *     blocos em nível de parágrafo. Sem cor nem itálico, porque o OCR não os
 *     recupera; o corpo da fonte é estimado pela altura da caixa.
 *
 * Nada disso reimplementa agrupamento: as duas heurísticas já existem e estão
 * calibradas contra documentos reais (o histórico acadêmico e o edital citados
 * nos comentários de `paragraph-merger.ts`). Este serviço só as adapta para o
 * formato do construtor de .docx.
 */
@Injectable({ providedIn: 'root' })
export class PdfToWordService {
  private readonly loader = inject(PdfLoaderService);
  private readonly ocr = inject(OcrService);

  async convert(options: PdfToWordOptions): Promise<PdfToWordResult> {
    const { file, password, useOcr, ocrLang, preserveLineBreaks, onProgress } = options;

    const loaded = await this.loader.load(file, password);
    const paragraphs: DocParagraph[] = [];
    let scannedPages = 0;
    let skippedPages = 0;

    try {
      const pageSize = {
        widthPt: loaded.pages[0]?.width ?? 595,
        heightPt: loaded.pages[0]?.height ?? 842,
      };

      for (const page of loaded.pages) {
        const before = paragraphs.length;

        if (page.type === 'digital') {
          const merged = inReadingOrder(mergeNativeParagraphs(page.nativeBlocks));
          const minX = minLeftEdge(merged.map((b) => b.x));
          for (const block of merged) {
            paragraphs.push(nativeToDoc(block, page.width, minX, preserveLineBreaks));
          }
        } else {
          scannedPages++;
          if (useOcr) {
            const blocks = inReadingOrder(await this.ocrPage(loaded.doc, page.index, ocrLang));
            const minX = minLeftEdge(blocks.map((b) => b.x));
            const median = medianFontSizePt(blocks, page.height);
            for (const block of blocks) {
              paragraphs.push(
                ocrToDoc(block, page.width, page.height, minX, median, preserveLineBreaks),
              );
            }
          } else {
            skippedPages++;
          }
        }

        // Quebra de página no ÚLTIMO parágrafo da página, nunca num parágrafo
        // fixo no fim: uma página que não produziu texto (escaneada e pulada)
        // não deve gerar uma folha em branco no meio do documento.
        const isLastPage = page.index === loaded.pageCount;
        if (!isLastPage && paragraphs.length > before) {
          paragraphs[paragraphs.length - 1].pageBreakAfter = true;
        }

        onProgress?.(Math.round((page.index / loaded.pageCount) * 100));
      }

      if (paragraphs.length === 0) {
        throw new AppError('pdf_no_text');
      }

      const blob = await buildDocx(paragraphs, { pageSize });

      return {
        blob,
        filename: `${baseName(file.name)}.docx`,
        pageCount: loaded.pageCount,
        scannedPages,
        skippedPages,
        paragraphCount: paragraphs.length,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('pdf_export_failed', err);
    } finally {
      await closePdf(loaded.doc);
    }
  }

  private async ocrPage(
    doc: Awaited<ReturnType<PdfLoaderService['load']>>['doc'],
    pageIndex: number,
    lang: PdfToWordOcrLang,
  ): Promise<OcrBlock[]> {
    const canvas = await this.loader.renderPageToCanvas(doc, pageIndex, OCR_RENDER_SCALE);
    try {
      const result = await this.ocr.recognise(canvas, lang);
      return result.blocks;
    } finally {
      // Um A4 a 3× ocupa ~40 MB de memória de vídeo. Num documento de 40
      // páginas, segurar todos até o fim do laço estoura o limite do navegador
      // — que não lança erro, apenas devolve canvas em branco a partir daí.
      releaseCanvas(canvas);
    }
  }
}

// ─── Adaptadores ────────────────────────────────────────────────────────────

/**
 * Reordena os blocos de uma página em ordem de leitura: de cima para baixo,
 * e da esquerda para a direita no desempate.
 *
 * Os dois agrupadores devolvem os blocos na ordem em que os GRUPOS foram
 * criados, não na ordem em que se lê a página — e para os dois consumidores que
 * já existiam isso nunca importou, porque o editor posiciona cada bloco em
 * coordenada absoluta e o exportador desenha cada um no seu x/y. Um .docx é
 * linear: a ordem do array É a ordem do texto.
 *
 * Sem isto, um scan de quatro linhas saiu com "digitalizado de teste camada de
 * texto Documento pagina nao possui Esta …" — todas as palavras presentes, em
 * ordem errada, que é um modo de falha pior do que faltar texto porque parece
 * um problema de OCR e não de ordenação.
 *
 * O agrupamento em faixas não é firula: a primeira versão disto era um
 * comparador que testava `Math.abs(a.y - b.y) <= tolerância` e caía por x, e
 * errava por dois motivos. Blocos da mesma linha com alturas diferentes têm
 * TOPOS diferentes — "Esta pagina nao possui" começa mais alto que "camada de
 * texto" por causa da maiúscula — e a diferença furava a tolerância. E um
 * comparador com tolerância não é transitivo (a≈b, b≈c, mas a≢c), então
 * `Array.sort` pode devolver qualquer permutação para o mesmo conjunto.
 *
 * Agrupar primeiro e ordenar depois é transitivo por construção: a faixa é
 * decidida por SOBREPOSIÇÃO vertical, que independe da altura de cada caixa.
 */
export function inReadingOrder<T extends { x: number; y: number; h: number }>(blocks: T[]): T[] {
  const porTopo = [...blocks].sort((a, b) => a.y - b.y);
  const faixas: T[][] = [];

  for (const bloco of porTopo) {
    const faixa = faixas[faixas.length - 1];
    if (faixa) {
      const ref = faixa[0];
      const sobreposicao =
        Math.min(ref.y + ref.h, bloco.y + bloco.h) - Math.max(ref.y, bloco.y);
      if (sobreposicao > Math.min(ref.h, bloco.h) * 0.5) {
        faixa.push(bloco);
        continue;
      }
    }
    faixas.push([bloco]);
  }

  return faixas.flatMap((faixa) => faixa.sort((a, b) => a.x - b.x));
}

/**
 * Menor x entre os parágrafos da página, usado como origem dos recuos.
 *
 * O recuo é relativo à margem do CONTEÚDO, não à borda do papel: um documento
 * cuja massa de texto começa a 3 cm da borda não deve sair no Word com 3 cm de
 * recuo em todo parágrafo somados à margem da seção.
 */
function minLeftEdge(xs: readonly number[]): number {
  return xs.length > 0 ? Math.min(...xs) : 0;
}

function nativeToDoc(
  block: MergedParagraphBlock,
  pageWidthPt: number,
  minX: number,
  preserveLineBreaks: boolean,
): DocParagraph {
  const runs: DocRun[] = block.formattedText
    ? parseInlineMarkup(block.formattedText, block.bold, block.italic)
    : [{ text: block.text, bold: block.bold, italic: block.italic }];

  return {
    runs: joinRunLines(runs, preserveLineBreaks),
    fontSizePt: block.fontSizePt,
    align: block.textAlign,
    color: block.textColor,
    fontFamily: block.fontFamily,
    indentPt: Math.max(0, (block.x - minX) * pageWidthPt),
  };
}

/** Piso e teto absolutos do corpo de fonte vindo do OCR, em pontos. */
export const OCR_MIN_FONT_PT = 6;
export const OCR_MAX_FONT_PT = 36;

/** Mediana dos corpos de fonte estimados pelo OCR numa página, em pontos. */
export function medianFontSizePt(
  blocks: readonly Pick<OcrBlock, 'fontSize'>[],
  pageHeightPt: number,
): number {
  const sizes = blocks
    .map((b) => b.fontSize)
    .filter((f): f is number => typeof f === 'number' && f > 0)
    .map((f) => f * pageHeightPt)
    .sort((a, b) => a - b);
  return sizes.length > 0 ? sizes[sizes.length >> 1] : 0;
}

/**
 * Prende o corpo de fonte estimado pelo OCR a uma faixa plausível.
 *
 * O `OcrService` já defende a geometria duas vezes (`clampOutlierHeights` e o
 * teto de 1.8× da mediana em `assignFontSizes`), e ainda assim uma página
 * rasterizada de histórico acadêmico produziu corpos de 1 pt a 42,5 pt aqui —
 * contra 5–12 pt na leitura NATIVA do mesmo documento. Os clamps de lá são
 * calibrados para o editor, onde uma fonte errada aparece na tela e se corrige
 * com um clique. Um .docx sai da máquina: 1 pt é texto invisível para quem
 * abrir, e ninguém vai suspeitar de OCR ao ver uma linha em branco.
 *
 * A faixa é relativa à mediana da PÁGINA (títulos legitimamente chegam ao dobro
 * do corpo) e depois absoluta, porque uma página inteira de lixo pode ter uma
 * mediana ruim e a faixa relativa sozinha a acompanharia.
 */
export function clampOcrFontSizePt(raw: number | undefined, medianPt: number): number | undefined {
  if (raw === undefined) return undefined;
  if (medianPt <= 0) return Math.min(OCR_MAX_FONT_PT, Math.max(OCR_MIN_FONT_PT, raw));

  // O piso RELATIVO também passa pelo teto absoluto, e essa ordem é o ponto:
  // sem isso, uma página com mediana de 100pt produz piso 60 e teto 36, o piso
  // ganha, e todo bloco da página é fixado em 60pt — o teto absoluto deixa de
  // existir exatamente no caso em que ele é necessário.
  const lower = Math.min(OCR_MAX_FONT_PT, Math.max(OCR_MIN_FONT_PT, medianPt * 0.6));
  const upper = Math.max(lower, Math.min(OCR_MAX_FONT_PT, medianPt * 2.2));
  return Math.min(upper, Math.max(lower, raw));
}

function ocrToDoc(
  block: OcrBlock,
  pageWidthPt: number,
  pageHeightPt: number,
  minX: number,
  medianPt: number,
  preserveLineBreaks: boolean,
): DocParagraph {
  // OcrBlock.fontSize é fração da ALTURA da página (ver estimateLineFontSize em
  // ocr.service.ts); o Word quer pontos.
  const raw = block.fontSize ? block.fontSize * pageHeightPt : undefined;

  return {
    runs: joinRunLines([{ text: block.text, bold: block.bold }], preserveLineBreaks),
    fontSizePt: clampOcrFontSizePt(raw, medianPt),
    align: block.textAlign,
    indentPt: Math.max(0, (block.x - minX) * pageWidthPt),
  };
}

function baseName(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}
