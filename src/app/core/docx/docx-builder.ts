/**
 * Construção de um .docx a partir de parágrafos já extraídos de um PDF.
 *
 * Este módulo é PURO no sentido do resto de `core/`: não conhece pdf.js, não
 * conhece Tesseract e não importa nada de `features/`. Quem extrai os
 * parágrafos (o serviço da ferramenta) adapta o formato de origem —
 * `MergedParagraphBlock` no caminho digital, `OcrBlock` no escaneado — para o
 * `DocParagraph` daqui. A dependência aponta só numa direção, que é o que
 * permite testar o mapeamento sem carregar um PDF.
 *
 * `docx` é importado dinamicamente pelo mesmo motivo que `jspdf` e `pdf-lib`:
 * são ~4,6 MB desempacotados que ninguém que veio cortar uma imagem deve pagar.
 */

/** Um trecho contínuo de texto com formatação uniforme dentro do parágrafo. */
export interface DocRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type DocAlign = 'left' | 'center' | 'right' | 'justify';

/** Famílias que o pdf-lib reconhece, que é o que o extrator de PDF devolve. */
export type DocFontFamily = 'Helvetica' | 'TimesRoman' | 'Courier' | 'Symbol';

export interface DocParagraph {
  runs: DocRun[];
  /** Corpo da fonte em pontos do PDF. Ausente cai em DEFAULT_FONT_SIZE_PT. */
  fontSizePt?: number;
  align?: DocAlign;
  /** '#rrggbb'. O Word quer sem o '#', a conversão acontece aqui. */
  color?: string;
  fontFamily?: DocFontFamily;
  /** Recuo à esquerda em pontos, medido em relação à margem do documento. */
  indentPt?: number;
  /** Quebra de página DEPOIS deste parágrafo (fim de página do PDF). */
  pageBreakAfter?: boolean;
}

export interface DocxPageSize {
  widthPt: number;
  heightPt: number;
}

export interface BuildDocxOptions {
  /** Tamanho da página, normalmente o da primeira página do PDF. */
  pageSize?: DocxPageSize;
  /** Margens em pontos. Ausente usa MARGIN_PT. */
  marginPt?: number;
}

/** Corpo usado quando o PDF não informa tamanho de fonte (raro, mas acontece). */
export const DEFAULT_FONT_SIZE_PT = 11;

/** Margem padrão: 2 cm ≈ 56.7 pt, o mesmo do Word em pt-BR. */
export const MARGIN_PT = 56.7;

/** 1 pt = 20 twips. Toda medida de layout do OOXML é em twips. */
const TWIPS_PER_PT = 20;

/**
 * Nome da fonte no Word para cada família do pdf-lib.
 *
 * Helvetica não existe no Windows e o Word substitui por conta própria quando
 * não encontra — mas a substituição dele varia por máquina e por versão. Mapear
 * explicitamente para Arial (métricas equivalentes) faz o documento abrir igual
 * em qualquer lugar em vez de depender do fallback local.
 */
const FONT_NAMES: Record<DocFontFamily, string> = {
  Helvetica: 'Arial',
  TimesRoman: 'Times New Roman',
  Courier: 'Courier New',
  Symbol: 'Symbol',
};

export function docFontName(family?: DocFontFamily): string {
  return family ? FONT_NAMES[family] : FONT_NAMES.Helvetica;
}

/**
 * Converte '#rrggbb' para o 'RRGGBB' que o OOXML espera.
 *
 * Devolve undefined para preto: o preto já é o padrão do estilo, e gravar
 * a cor explicitamente em todo run incha o XML sem mudar nada na tela.
 */
export function docColor(hex?: string): string | undefined {
  if (!hex) return undefined;
  const clean = hex.replace('#', '').trim().toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(clean)) return undefined;
  return clean === '000000' ? undefined : clean;
}

/**
 * Interpreta as tags inline que `mergeNativeParagraphs` emite no `formattedText`
 * — `<b>`, `<i>` e o aninhado `<b><i>…</i></b>` — devolvendo os runs.
 *
 * Só essas quatro sequências exatas contam como tag; qualquer outro '<' é texto
 * literal. Isso importa porque o gerador do lado do PDF não escapa nada, então
 * um documento que contenha "a < b" chegaria aqui com um '<' solto — tratá-lo
 * como início de tag comeria o resto do parágrafo.
 *
 * `bold`/`italic` entram como estado inicial: é o negrito do parágrafo inteiro,
 * que as tags então sobrepõem trecho a trecho.
 */
export function parseInlineMarkup(formatted: string, bold = false, italic = false): DocRun[] {
  const runs: DocRun[] = [];
  let boldDepth = bold ? 1 : 0;
  let italicDepth = italic ? 1 : 0;
  let buffer = '';
  let i = 0;

  const flush = (): void => {
    if (buffer.length === 0) return;
    runs.push({ text: buffer, bold: boldDepth > 0, italic: italicDepth > 0 });
    buffer = '';
  };

  while (i < formatted.length) {
    if (formatted.startsWith('<b>', i)) {
      flush();
      boldDepth++;
      i += 3;
    } else if (formatted.startsWith('</b>', i)) {
      flush();
      if (boldDepth > 0) boldDepth--;
      i += 4;
    } else if (formatted.startsWith('<i>', i)) {
      flush();
      italicDepth++;
      i += 3;
    } else if (formatted.startsWith('</i>', i)) {
      flush();
      if (italicDepth > 0) italicDepth--;
      i += 4;
    } else {
      buffer += formatted[i];
      i++;
    }
  }
  flush();

  return runs.filter((r) => r.text.length > 0);
}

/**
 * Junta as linhas de um parágrafo num texto que o Word possa refluir.
 *
 * O extrator preserva as quebras do PDF com '\n' porque o editor precisa
 * desenhar o bloco exatamente onde ele está na página. Aqui a necessidade é a
 * oposta: quem converte para Word converte para EDITAR, e um parágrafo em que
 * toda linha termina em quebra rígida não reflui — inserir uma palavra no meio
 * empurra o texto para fora da margem em vez de reajustar. Por isso o padrão é
 * juntar com espaço, e manter as quebras é opção explícita de quem prefere
 * fidelidade de layout a texto editável.
 */
export function joinRunLines(runs: DocRun[], preserveLineBreaks: boolean): DocRun[] {
  if (preserveLineBreaks) return runs;
  return runs
    .map((r) => ({ ...r, text: r.text.replace(/\n+/g, ' ').replace(/[ \t]{2,}/g, ' ') }))
    .filter((r) => r.text.length > 0);
}

const ptToTwip = (pt: number): number => Math.round(pt * TWIPS_PER_PT);

/**
 * Monta o .docx e devolve o Blob pronto para download.
 *
 * O documento usa UMA seção com o tamanho da primeira página e quebras de
 * página explícitas entre as páginas do PDF. Uma seção por página também
 * funcionaria e cobriria PDFs com páginas de tamanhos diferentes, mas custa um
 * bloco de propriedades por página num arquivo que já tende a ser longo, e o
 * caso misto é raro o bastante para não pagar isso por padrão.
 */
export async function buildDocx(
  paragraphs: readonly DocParagraph[],
  options: BuildDocxOptions = {},
): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, PageBreak, AlignmentType } = await import('docx');

  const alignmentOf = (align?: DocAlign) => {
    switch (align) {
      case 'center':
        return AlignmentType.CENTER;
      case 'right':
        return AlignmentType.RIGHT;
      case 'justify':
        return AlignmentType.JUSTIFIED;
      default:
        return AlignmentType.LEFT;
    }
  };

  const children: InstanceType<typeof Paragraph>[] = [];

  for (const para of paragraphs) {
    const sizePt = para.fontSizePt ?? DEFAULT_FONT_SIZE_PT;
    const font = docFontName(para.fontFamily);
    const color = docColor(para.color);

    const textRuns = para.runs.map((run) => {
      // O OOXML mede corpo de fonte em MEIO-pontos, não em pontos.
      const parts = run.text.split('\n');
      return parts.map(
        (part, idx) =>
          new TextRun({
            text: part,
            bold: run.bold,
            italics: run.italic,
            size: Math.max(2, Math.round(sizePt * 2)),
            font,
            ...(color ? { color } : {}),
            // break: 1 no início dos pedaços seguintes reproduz o '\n' como
            // quebra suave dentro do mesmo parágrafo (Shift+Enter no Word).
            ...(idx > 0 ? { break: 1 } : {}),
          }),
      );
    });

    children.push(
      new Paragraph({
        children: textRuns.flat(),
        alignment: alignmentOf(para.align),
        ...(para.indentPt && para.indentPt > 1
          ? { indent: { left: ptToTwip(para.indentPt) } }
          : {}),
        spacing: { after: ptToTwip(sizePt * 0.35) },
      }),
    );

    if (para.pageBreakAfter) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  // Um .docx sem nenhum parágrafo abre com aviso de arquivo corrompido em
  // algumas versões do Word; um parágrafo vazio evita isso.
  if (children.length === 0) {
    children.push(new Paragraph({ children: [] }));
  }

  const margin = options.marginPt ?? MARGIN_PT;
  const page = options.pageSize;

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            ...(page
              ? { size: { width: ptToTwip(page.widthPt), height: ptToTwip(page.heightPt) } }
              : {}),
            margin: {
              top: ptToTwip(margin),
              bottom: ptToTwip(margin),
              left: ptToTwip(margin),
              right: ptToTwip(margin),
            },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
