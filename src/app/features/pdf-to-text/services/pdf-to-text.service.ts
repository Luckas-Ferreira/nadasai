import { Injectable, inject } from '@angular/core';
import { AppError } from '../../../core/errors';
import { closePdf, releaseCanvas } from '../../../core/pdf/pdfjs';
import { OcrService } from '../../pdf/services/ocr.service';
import { inReadingOrder } from '../../pdf-to-word/services/pdf-to-word.service';
import { mergeNativeParagraphs } from '../../pdf/services/paragraph-merger';
import { PdfLoaderService } from '../../pdf/services/pdf-loader.service';

/** Mesma escala do editor e do pdf-to-word — ver o comentário lá. */
const OCR_RENDER_SCALE = 3;

export type TextOcrLang = 'por' | 'eng' | 'por+eng';
export type TextOutputFormat = 'txt' | 'md';

export interface PdfToTextOptions {
  readonly file: File;
  readonly password?: string;
  readonly useOcr: boolean;
  readonly ocrLang: TextOcrLang;
  readonly format: TextOutputFormat;
  /** Separar as páginas com um marcador no texto. */
  readonly pageMarkers: boolean;
  readonly onProgress?: (percent: number) => void;
}

export interface PdfToTextResult {
  readonly blob: Blob;
  readonly text: string;
  readonly ext: string;
  readonly pageCount: number;
  readonly scannedPages: number;
  readonly skippedPages: number;
  readonly characters: number;
  readonly words: number;
}

/**
 * PDF para texto puro ou Markdown.
 *
 * A extração é EXATAMENTE a do `pdf-to-word` — `PdfLoaderService` mais
 * `mergeNativeParagraphs` na página digital, `OcrService.recognise` a 3× na
 * escaneada, e `inReadingOrder` em cima dos dois. Nada disso é reimplementado:
 * as heurísticas estão calibradas contra documentos reais e escrever um segundo
 * agrupador seria a forma mais fácil de as duas ferramentas discordarem sobre
 * onde um parágrafo começa.
 *
 * O que muda é só o ESCRITOR, e é aí que estão as decisões desta ferramenta:
 *
 *   * **O Markdown é inferido, não fabricado.** Um PDF não tem estrutura de
 *     título; tem texto com corpo de fonte. Um parágrafo curto, sem ponto final
 *     e num corpo bem acima da mediana da página é quase sempre um cabeçalho, e
 *     vira `##`. Um que não passa nos três testes vira parágrafo comum. Chutar
 *     mais que isso produziria um documento cheio de títulos falsos, que é pior
 *     do que um texto plano correto.
 *   * **O negrito por trecho sobrevive em Markdown e não em texto puro.** O
 *     `formattedText` do agrupador traz `<b>`; em `.md` isso vira `**`, e em
 *     `.txt` é descartado, porque texto puro não tem como representá-lo e
 *     deixar a tag literal seria pior que perdê-la.
 *   * **O marcador de página é opcional e fica fora do texto por padrão.** Quem
 *     joga o resultado num modelo de linguagem quase nunca quer `--- Página 3
 *     ---` no meio da prosa; quem confere contra o original sempre quer.
 */
@Injectable({ providedIn: 'root' })
export class PdfToTextService {
  private readonly loader = inject(PdfLoaderService);
  private readonly ocr = inject(OcrService);

  async convert(options: PdfToTextOptions): Promise<PdfToTextResult> {
    const { file, password, useOcr, ocrLang, format, pageMarkers, onProgress } = options;

    const loaded = await this.loader.load(file, password);

    const parts: string[] = [];
    let scannedPages = 0;
    let skippedPages = 0;

    try {
      for (const page of loaded.pages) {
        const before = parts.length;

        if (page.type === 'digital') {
          const merged = inReadingOrder(mergeNativeParagraphs(page.nativeBlocks));
          const median = medianFontSize(merged);

          for (const block of merged) {
            const text = format === 'md' ? inlineToMarkdown(block.formattedText ?? block.text) : block.text;
            parts.push(render(text.trim(), block.fontSizePt ?? median, median, format));
          }
        } else {
          scannedPages++;

          if (useOcr) {
            const blocks = inReadingOrder(await this.ocrPage(loaded.doc, page.index, ocrLang));
            for (const block of blocks) {
              // O OCR não recupera negrito nem itálico, então em Markdown a
              // página escaneada sai como parágrafo comum — inventar ênfase
              // aqui seria fabricar estrutura a partir de nada.
              const text = block.text.trim();
              if (text) parts.push(text);
            }
          } else {
            skippedPages++;
          }
        }

        const produced = parts.length > before;
        const isLast = page.index === loaded.pageCount;

        if (pageMarkers && produced && !isLast) {
          parts.push(format === 'md' ? '---' : `--- ${page.index} ---`);
        }

        onProgress?.(Math.round((page.index / loaded.pageCount) * 100));
      }

      const text = parts.filter(Boolean).join('\n\n').trim();
      if (!text) throw new AppError('pdf_no_text');

      const ext = format === 'md' ? 'md' : 'txt';
      const mime = format === 'md' ? 'text/markdown' : 'text/plain';

      return {
        blob: new Blob([text], { type: `${mime};charset=utf-8` }),
        text,
        ext,
        pageCount: loaded.pageCount,
        scannedPages,
        skippedPages,
        characters: text.length,
        words: text.split(/\s+/).filter(Boolean).length,
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
    lang: TextOcrLang,
  ) {
    const canvas = await this.loader.renderPageToCanvas(doc, pageIndex, OCR_RENDER_SCALE);
    try {
      return (await this.ocr.recognise(canvas, lang)).blocks;
    } finally {
      // Um A4 a 3× ocupa ~40 MB de memória de vídeo, e o navegador não lança
      // erro ao estourar: passa a devolver canvas em branco.
      releaseCanvas(canvas);
    }
  }
}

/**
 * Mediana do corpo de fonte da página. É a referência para decidir o que é
 * cabeçalho — comparar contra um valor fixo em pontos não funciona, porque um
 * edital em 10pt e um cartaz em 30pt teriam a mesma régua.
 */
function medianFontSize(blocks: readonly { fontSizePt?: number }[]): number {
  const sizes = blocks.map((b) => b.fontSizePt ?? 0).filter((s) => s > 0).sort((a, b) => a - b);
  if (sizes.length === 0) return 0;
  return sizes[Math.floor(sizes.length / 2)];
}

/** Quantas palavras ainda contam como "curto o bastante para ser título". */
const HEADING_MAX_WORDS = 14;

/** O corpo precisa estar este tanto acima da mediana da página. */
const HEADING_SIZE_RATIO = 1.15;

/**
 * Um bloco vira cabeçalho quando passa nos TRÊS testes: corpo acima da mediana,
 * curto, e sem pontuação final. Qualquer um deles sozinho produz falso
 * positivo — a primeira linha de um parágrafo em destaque é grande, um item de
 * lista é curto, e uma legenda não tem ponto.
 */
function render(text: string, fontSizePt: number, median: number, format: TextOutputFormat): string {
  if (!text) return '';
  if (format !== 'md' || median <= 0) return text;

  const words = text.split(/\s+/).filter(Boolean).length;
  const ratio = fontSizePt / median;

  if (ratio >= HEADING_SIZE_RATIO && words <= HEADING_MAX_WORDS && !/[.;:,]$/.test(text)) {
    // Dois níveis, e só dois. O corpo da fonte distingue "muito maior" de
    // "um pouco maior" com confiança; distinguir seis níveis a partir de
    // pontos seria inventar hierarquia que o PDF não declara.
    return ratio >= HEADING_SIZE_RATIO * 1.4 ? `# ${text}` : `## ${text}`;
  }

  return text;
}

/**
 * `<b>` e `<i>` do agrupador viram `**` e `*`. Qualquer outra tag é removida:
 * deixá-la literal poluiria o Markdown com HTML que ninguém pediu.
 */
function inlineToMarkdown(formatted: string): string {
  return formatted
    .replace(/<b>(.*?)<\/b>/gs, '**$1**')
    .replace(/<i>(.*?)<\/i>/gs, '*$1*')
    .replace(/<[^>]+>/g, '');
}
