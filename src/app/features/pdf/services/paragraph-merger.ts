import { PdfNativeBlock } from './pdf-loader.service';

export interface MergedParagraphBlock {
  text: string;
  /** Textos individuais de cada linha, antes de serem unidos. */
  lineTexts: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  fontSizePt?: number;
  bold?: boolean;
  italic?: boolean;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  lineCount: number;
  /** Cor de texto extraída do PDF (proveniente do bloco dominante do parágrafo). */
  textColor?: string;
  /** Família de fonte do bloco dominante. */
  fontFamily?: 'Helvetica' | 'TimesRoman' | 'Courier' | 'Symbol';
}

// ─── Detecção de estilo ────────────────────────────────────────────────────

/**
 * Retorna true se o nome da fonte indica negrito.
 * Usado como fallback quando a entrada não possui isBold pré-calculado.
 */
function isBoldFont(fontName?: string): boolean {
  if (!fontName) return false;
  return /bold|black|heavy|semibold|demi|strong|[\-_,\.]b$|[\-_,\.]bd$|[\-_,\.]b[\-_,\.]|w[6-9]|[7-9]00/i.test(fontName);
}

/**
 * Retorna true se o nome da fonte indica itálico/oblíquo.
 * Usado como fallback quando a entrada não possui isItalic pré-calculado.
 */
function isItalicFont(fontName?: string): boolean {
  if (!fontName) return false;
  return /italic|oblique/i.test(fontName);
}

// ─── Junção de linhas em parágrafo ─────────────────────────────────────────

/**
 * Une as linhas de um grupo em um único texto contínuo, deixando que o CSS 
 * (word-wrap) faça a quebra de linha visual de acordo com a largura da caixa
 * delimitadora (Option B).
 *
 * Regras:
 *   • Linha hifenizada (termina com '-'): remove o hífen e une a próxima sem
 *     espaço (hifenização tipográfica).
 *   • Linha comum: insere ' ' (espaço) para unir o fluxo do parágrafo,
 *     removendo as quebras rígidas que atrapalhariam a edição de texto livre.
 */
export function joinParagraphLines(lines: { text: string }[]): string {
  let result = '';
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].text.trim();
    if (!raw) continue;
    if (result.length > 0) {
      if (result.endsWith('-')) {
        // Hifenização: remove o hífen e une sem espaço.
        result = result.slice(0, -1) + raw;
      } else {
        // Linha comum: une com espaço, permitindo fluxo contínuo (CSS word-wrap).
        result += ' ' + raw;
      }
    } else {
      result = raw;
    }
  }
  return result;
}

// ─── Mesclagem principal ───────────────────────────────────────────────────

/**
 * Mescla os itens de texto brutos do PDF.js (extraídos frase a frase ou linha
 * a linha) em blocos de parágrafo unificados, como o Adobe Acrobat faz na
 * edição de PDF.
 *
 * Agora usa os campos `isBold` e `isItalic` pré-calculados pelo PdfLoaderService
 * (derivados do nome da fonte e da matriz de transformação), em vez de
 * re-inferir pelos padrões de nome.
 *
 * Também propaga `textColor` e `fontFamily` do bloco mais frequente (modo)
 * para o parágrafo inteiro, de forma que o editor inicialize com a cor e
 * família corretas.
 */
export function mergeNativeParagraphs(rawBlocks: PdfNativeBlock[]): MergedParagraphBlock[] {
  if (!rawBlocks || rawBlocks.length === 0) return [];

  const valid = rawBlocks.filter((b) => b.text && b.text.trim().length > 0);
  if (valid.length === 0) return [];

  // Ordena por Y (topo para baixo), depois X (esquerda para direita).
  const sorted = [...valid].sort((a, b) => a.y - b.y || a.x - b.x);

  // ── Passo 1: Agrupa itens em linhas horizontais ──────────────────────────
  const lines: PdfNativeBlock[][] = [];

  for (const block of sorted) {
    let placed = false;
    for (const line of lines) {
      const lineY = line.reduce((sum, b) => sum + b.y, 0) / line.length;
      const lineH = line.reduce((max, b) => Math.max(max, b.h), 0);
      const blockMid = block.y + block.h / 2;
      const lineMid = lineY + lineH / 2;

      if (Math.abs(blockMid - lineMid) < Math.max(lineH, block.h) * 0.85) {
        line.push(block);
        placed = true;
        break;
      }
    }
    if (!placed) {
      lines.push([block]);
    }
  }

  // Ordena cada linha da esquerda para a direita.
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
  }

  // ── Passo 2: Calcula sumários por linha ──────────────────────────────────
  interface LineSummary {
    items: PdfNativeBlock[];
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    fontSizePt?: number;
    bold: boolean;
    italic: boolean;
    textColor?: string;
    fontFamily?: 'Helvetica' | 'TimesRoman' | 'Courier' | 'Symbol';
  }

  const lineSummaries: LineSummary[] = lines
    .map((items) => {
      const minX = Math.min(...items.map((i) => i.x));
      const minY = Math.min(...items.map((i) => i.y));
      const maxX = Math.max(...items.map((i) => i.x + i.w));
      const maxY = Math.max(...items.map((i) => i.y + i.h));

      const text = items.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim();

      const fontSizes = items
        .map((i) => i.fontSizePt)
        .filter((fs): fs is number => fs !== undefined);
      const avgFontSizePt =
        fontSizes.length > 0
          ? fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length
          : undefined;

      // Usa os campos pré-calculados pelo PdfLoaderService; cai no nome como fallback.
      const boldCount = items.filter((i) => i.isBold ?? isBoldFont(i.fontName)).length;
      const italicCount = items.filter((i) => i.isItalic ?? isItalicFont(i.fontName)).length;

      // Cor e família do bloco dominante (mais largo = mais texto) da linha.
      const dominantItem = [...items].sort((a, b) => b.w - a.w)[0];

      const isTitlePattern = /^\d+(\.\d+)*\s+[A-Z\s]{2,}/.test(text);
      const isBoldLine = (boldCount > items.length / 2) || (isTitlePattern && boldCount > 0);

      return {
        items,
        text,
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
        fontSizePt: avgFontSizePt,
        bold: isBoldLine,
        italic: italicCount > items.length / 2,
        textColor: dominantItem?.textColor,
        fontFamily: dominantItem?.fontFamily,
      };
    })
    .filter((l) => l.text.length > 0);

  lineSummaries.sort((a, b) => a.y - b.y);
  if (lineSummaries.length === 0) return [];

  // Métricas de coluna para detectar linhas curtas (fim de parágrafo).
  const maxLineWidth = Math.max(...lineSummaries.map((l) => l.w), 0.1);
  const columnRight = Math.max(...lineSummaries.map((l) => l.x + l.w));

  // ── Passo 3: Agrupa linhas em parágrafos ────────────────────────────────
  const paragraphGroups: LineSummary[][] = [];

  for (const line of lineSummaries) {
    let placed = false;

    if (paragraphGroups.length > 0) {
      const currentPara = paragraphGroups[paragraphGroups.length - 1];
      const lastLine = currentPara[currentPara.length - 1];

      const baselineDist = line.y - lastLine.y;
      const avgH = (line.h + lastLine.h) / 2;
      const gap = line.y - (lastLine.y + lastLine.h);

      const xOverlap = Math.max(
        0,
        Math.min(line.x + line.w, lastLine.x + lastLine.w) - Math.max(line.x, lastLine.x),
      );
      const leftDiff = Math.abs(line.x - lastLine.x);

      // Tamanho de fonte: diferença > 1.8pt ou razão > 1.2 → parágrafo diferente.
      const fsA = lastLine.fontSizePt;
      const fsB = line.fontSizePt;
      const fsMismatch =
        fsA !== undefined &&
        fsB !== undefined &&
        (Math.abs(fsA - fsB) > 1.8 || fsA / fsB > 1.2 || fsB / fsA > 1.2);

      // Negrito diferente (ex: título em negrito seguido de corpo normal).
      const boldMismatch = lastLine.bold !== line.bold;

      // Linha anterior curta indica fim de parágrafo.
      const lastLineRightEdge = lastLine.x + lastLine.w;
      const isLastLineShort =
        lastLine.w < maxLineWidth * 0.75 && lastLineRightEdge < columnRight - 0.08;

      const isNormalSpacing = baselineDist <= avgH * 2.2 || gap <= avgH * 1.5;
      const isAligned = xOverlap > 0 || leftDiff < 0.08;

      if (isNormalSpacing && !fsMismatch && !boldMismatch && !isLastLineShort && isAligned) {
        currentPara.push(line);
        placed = true;
      }
    }

    if (!placed) {
      paragraphGroups.push([line]);
    }
  }

  // ── Passo 4: Produz os blocos de parágrafo finais ────────────────────────
  return paragraphGroups.map((group) => {
    const minX = Math.min(...group.map((l) => l.x));
    const minY = Math.min(...group.map((l) => l.y));
    const maxX = Math.max(...group.map((l) => l.x + l.w));
    const maxY = Math.max(...group.map((l) => l.y + l.h));

    // Textos individuais de cada linha (preservados para fins de diagnóstico
    // e para o editor calcular fitFontSizeToWidth pela linha mais longa).
    const lineTexts = group.map((l) => l.text);

    // Texto unido com '\n' entre linhas (Option A: preserva quebras reais).
    const text = joinParagraphLines(group);

    const fontSizes = group
      .map((l) => l.fontSizePt)
      .filter((fs): fs is number => fs !== undefined);
    const avgFontSizePt =
      fontSizes.length > 0 ? fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length : undefined;

    const boldCount = group.filter((l) => l.bold).length;
    const italicCount = group.filter((l) => l.italic).length;
    const isAnyLineBold = group.some((l) => l.bold);
    const dominantLine = [...group].sort((a, b) => b.w - a.w)[0];

    // Centralização: exige que as margens esquerda e direita sejam simétricas (< 0.05)
    // E que a largura do bloco seja menor que 0.68 da página.
    const blockW = maxX - minX;
    const leftMargin = minX;
    const rightMargin = 1 - maxX;
    const isSymmetric = Math.abs(leftMargin - rightMargin) < 0.05 && blockW < 0.68;

    // Para blocos multilinha (2+ linhas), verifica se os centros X de cada linha coincidem no meio da página.
    const lineCenters = group.map((l) => l.x + l.w / 2);
    const avgCenter = lineCenters.reduce((a, b) => a + b, 0) / lineCenters.length;
    const isMultiLineCenter = group.length >= 2 && Math.abs(avgCenter - 0.5) < 0.08 && lineCenters.every((c) => Math.abs(c - avgCenter) < 0.04);

    const isCentered = isSymmetric && (group.length === 1 || isMultiLineCenter);

    // Justificação: Bloco multilinha (2+ linhas) que não seja centralizado e ocupe margem a margem (> 0.68).
    const isJustified = !isCentered && group.length >= 2 && blockW > 0.68;

    // Negrito: se a maioria for negrito, se a linha dominante for negrito, ou se for título (fontSize >= 11) com negrito.
    const isBoldGroup = (boldCount > group.length / 2) || (dominantLine?.bold ?? false) || (isAnyLineBold && (avgFontSizePt ?? 0) >= 11);

    return {
      text,
      lineTexts,
      x: minX,
      y: minY,
      w: blockW,
      h: maxY - minY,
      fontSizePt: avgFontSizePt,
      bold: isBoldGroup,
      italic: italicCount > group.length / 2,
      textAlign: isCentered ? 'center' : (isJustified ? 'justify' : 'left'),
      lineCount: group.length,
      textColor: dominantLine?.textColor,
      fontFamily: dominantLine?.fontFamily,
    };
  });
}
