/**
 * Mapeia nomes de fonte do PDF para as 4 famílias disponíveis no pdf-lib
 * (Helvetica, TimesRoman, Courier, Symbol).
 *
 * Nomes de fonte em PDFs reais costumam vir:
 *   • Com prefixo de subset:   "ABCDEF+FontName"
 *   • Com sufixo de estilo:    "Arial-Bold", "TimesNewRoman,Bold"
 *   • Com encoding embutido:   "HelveticaNeue-CondensedBold"
 *   • Completamente genérico:  "F1", "TT1" (fontes não embarcadas)
 *
 * A função normaliza o nome, extrai negrito/itálico pelo padrão
 * e então tenta corresponder a uma família pelo conteúdo do nome.
 * Se nenhuma correspondência for encontrada, retorna Helvetica como padrão
 * (a fonte sans-serif mais comum em PDFs).
 */

export type PdfLibFontFamily = 'Helvetica' | 'TimesRoman' | 'Courier' | 'Symbol';

interface FontPatternEntry {
  pattern: RegExp;
  family: PdfLibFontFamily;
}

/**
 * Ordenados do mais específico ao mais genérico.
 * Symbol e Courier são verificados antes de Helvetica porque nomes como
 * "CourierNewPS-BoldMT" contêm "New" que poderia confundir padrões mais amplos.
 */
const FONT_PATTERNS: FontPatternEntry[] = [
  // Fontes de símbolos
  { pattern: /symbol|zapfdingbat|wingding|webding/i, family: 'Symbol' },
  // Fontes monoespacadas
  {
    pattern:
      /courier|cour|lucidaconsole|consolasmt|inconsolata|dejavusansmono|droidsansmono|notomono|sourcecodepro/i,
    family: 'Courier',
  },
  // Fontes com serifa
  {
    pattern:
      /times|georgia|garamond|palatino|bookman|schoolbook|minion|utopia|charter|berling|centurion|caslon|baskerville/i,
    family: 'TimesRoman',
  },
  // Sans-serif — padrão mais amplo vem por último
  {
    pattern:
      /helvetica|arial|calibri|verdana|tahoma|trebuchet|gill|futura|myriad|roboto|noto(?!serif)|opensans|lato|inter|ubuntu|fira|source sans/i,
    family: 'Helvetica',
  },
];

/**
 * Resolve o nome bruto de uma fonte PDF para a família disponível em pdf-lib,
 * retornando também se a fonte é negrito e/ou itálico com base no nome.
 *
 * @param rawFontName  Valor de `fontName` retornado pelo PDF.js (pode ser undefined)
 * @param skewX        Valor de `transform[2]` da matriz de texto (oblíquo sintético)
 */
export function resolveFontInfo(
  rawFontName: string | undefined,
  skewX = 0,
): {
  isBold: boolean;
  isItalic: boolean;
  family: PdfLibFontFamily;
} {
  if (!rawFontName) {
    return { isBold: false, isItalic: false, family: 'Helvetica' };
  }

  // Remove prefixo de subset (ex: "ABCDEF+FontName" → "FontName").
  const name = rawFontName.replace(/^[A-Z]{6}\+/, '');

  // Negrito: detectado pelo nome da fonte (incluindo sufixos B, Bd, Heavy, Black, 700-900, W6-W9).
  const isBold = /bold|black|heavy|semibold|demi|strong|[\-_,\.]b$|[\-_,\.]bd$|[\-_,\.]b[\-_,\.]|w[6-9]|[7-9]00/i.test(name);

  // Itálico: pode ser declarado no nome OU ser oblíquo sintético (skewX != 0).
  // O limiar de 0.05 exclui pequenas imprecisões de floating-point, mas detecta
  // o oblíquo padrão de ~12° (tangente ≈ 0.21).
  const isItalic = /italic|oblique/i.test(name) || Math.abs(skewX) > 0.05;

  for (const entry of FONT_PATTERNS) {
    if (entry.pattern.test(name)) {
      return { isBold, isItalic, family: entry.family };
    }
  }

  // Padrão: Helvetica (sans-serif genérica — mais comum em PDFs modernos).
  return { isBold, isItalic, family: 'Helvetica' };
}
