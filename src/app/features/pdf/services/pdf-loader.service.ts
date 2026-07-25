import { Injectable } from '@angular/core';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { openPdf, getPdfjs, renderPageToCanvas } from '../../../core/pdf/pdfjs';
import { resolveFontInfo, type PdfLibFontFamily } from './font-resolver';

export type PdfPageType = 'digital' | 'scanned' | 'unknown';

export interface PdfNativeBlock {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corpo real da fonte em pts do PDF (|transform[3]|), sem conversão de viewport. */
  fontSizePt?: number;
  /** Nome bruto da fonte conforme registrado no PDF (pode ter prefixo de subset). */
  fontName?: string;
  /**
   * Componente de oblíquo/inclinação da matriz de texto (transform[2]).
   * Valor diferente de zero indica itálico/oblíquo sintético, mesmo que o
   * nome da fonte não contenha "italic" ou "oblique".
   */
  skewX?: number;
  /** Negrito detectado pelo nome da fonte (não há como inferir pela matriz). */
  isBold: boolean;
  /** Itálico detectado pelo nome da fonte ou pelo skewX ≠ 0 (oblíquo sintético). */
  isItalic: boolean;
  /** Família de fonte mapeada para as disponíveis no pdf-lib. */
  fontFamily?: PdfLibFontFamily;
  /**
   * Cor de preenchimento do texto no momento do draw, extraída via getOperatorList().
   * Formato: '#rrggbb'. Undefined significa preto (#000000) — cor padrão do PDF.
   */
  textColor?: string;
}

export interface PdfPageInfo {
  index: number;      // 1-based
  type: PdfPageType;
  width: number;
  height: number;
  nativeText: string; // empty string when scanned
  nativeBlocks: PdfNativeBlock[];
}

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  pageCount: number;
  pages: PdfPageInfo[];
  overallType: 'digital' | 'scanned' | 'mixed';
}

// ─── Extração de cor de texto via operadores PDF ────────────────────────────

/**
 * Converte um valor CMYK (0-1) para RGB 0-255.
 * Fórmula padrão para CMYK → sRGB sem perfil de cor.
 */
function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  return [
    Math.round(255 * (1 - c) * (1 - k)),
    Math.round(255 * (1 - m) * (1 - k)),
    Math.round(255 * (1 - y) * (1 - k)),
  ];
}

/** Formata [r, g, b] (0-255 cada) como '#rrggbb'. */
function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Retorna true se a cor é clara demais para ser cor de texto legível.
 *
 * Cores muito próximas do branco (luminância > 220/255) são descartadas porque
 * geralmente são artefatos do estado gráfico do PDF — por exemplo, quando uma
 * imagem vetorial (logo) define o fill como branco para seu fundo interno, e em
 * seguida o primeiro bloco de texto da página herda esse estado antes de o PDF
 * redefinir a cor. Armazenar #ffffff como textColor faz o texto sumir quando o
 * bloco é selecionado (texto branco sobre fundo branco).
 *
 * PDFs com texto genuinamente branco sobre fundo escuro ainda serão detectados
 * corretamente: quando o usuário clicar no bloco, o InpaintingService vai amostrar
 * a cor certa a partir do canvas renderizado.
 */
function parseHexColor(hex?: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6) return null;
  const num = parseInt(clean, 16);
  if (isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Retorna true se a cor for muito clara (luminância > 150) ou inválida.
 * Garante que textos em fundos brancos nunca fiquem brancos/invisíveis.
 */
export function isLightColor(hex?: string): boolean {
  const rgb = parseHexColor(hex);
  if (!rgb) return true; // Se for nulo ou inválido, trata como claro para forçar o fallback #000000.
  return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b > 150;
}

/**
 * Caminha pelo operator list de uma página PDF e rastreia a cor de preenchimento
 * ativa no momento de cada operação de exibição de texto (Tj, TJ, ', ").
 *
 * Retorna um array com uma entrada por operação de texto encontrada, na mesma
 * ordem em que o PDF.js as encontra — o que é a mesma ordem dos TextItems
 * retornados por getTextContent().
 *
 * Tratamento de estado gráfico:
 *   • save/restore (q/Q): empilha/desempilha a cor corrente.
 *   • setTextRenderingMode: modo 3 = texto invisível, ignorado.
 *   • Cores suportadas: RGB (rg), cinza (g), CMYK (k), genérico (sc/scn).
 *
 * @param opList  Resultado de page.getOperatorList()
 * @param OPS     Enum pdfjs.OPS (passado explicitamente para evitar re-importação)
 */
function buildTextColorMap(opList: { fnArray: number[]; argsArray: unknown[][] }, OPS: Record<string, number>): string[] {
  // Estado inicial: preto puro (valor padrão de todo PDF).
  let r = 0, g = 0, b = 0;
  let textRenderMode = 0; // 0 = fill (visível); 3 = invisible
  const colors: string[] = [];

  // Stack para save (q) / restore (Q) do estado gráfico.
  const stack: Array<{ r: number; g: number; b: number; mode: number }> = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i] as number[];

    switch (fn) {
      // ── Estado gráfico ──────────────────────────────────────────────────
      case OPS['save']:
        stack.push({ r, g, b, mode: textRenderMode });
        break;

      case OPS['restore']:
        if (stack.length > 0) {
          const s = stack.pop()!;
          r = s.r; g = s.g; b = s.b;
          textRenderMode = s.mode;
        }
        break;

      case OPS['setTextRenderingMode']:
        textRenderMode = args[0] ?? 0;
        break;

      // ── Operadores de cor de preenchimento ──────────────────────────────
      case OPS['setFillRGBColor']:
        // rg: r g b (0-1 cada)
        r = Math.round(args[0] * 255);
        g = Math.round(args[1] * 255);
        b = Math.round(args[2] * 255);
        break;

      case OPS['setFillGray']:
        // g: gray (0=preto, 1=branco)
        r = g = b = Math.round(args[0] * 255);
        break;

      case OPS['setFillCMYKColor']:
        // k: c m y k (0-1 cada)
        [r, g, b] = cmykToRgb(args[0], args[1], args[2], args[3]);
        break;

      case OPS['setFillColor']:
      case OPS['setFillColorN']:
        // sc / scn: depende do espaço de cor corrente.
        // Heurística: 3 args → RGB, 1 arg → cinza, 4 args → CMYK.
        if (args.length >= 4) {
          [r, g, b] = cmykToRgb(args[0], args[1], args[2], args[3]);
        } else if (args.length === 3) {
          r = Math.round(args[0] * 255);
          g = Math.round(args[1] * 255);
          b = Math.round(args[2] * 255);
        } else if (args.length === 1) {
          r = g = b = Math.round(args[0] * 255);
        }
        break;

      // ── Operações de exibição de texto ──────────────────────────────────
      case OPS['showText']:
      case OPS['showSpacedText']:
      case OPS['nextLineShowText']:
      case OPS['nextLineSetSpacingShowText']:
        // Modo 3 = texto invisível (camada de OCR em PDFs escaneados).
        // Nesse caso, não registra a cor — e essa entrada também não
        // aparecerá no getTextContent() do PDF.js.
        if (textRenderMode !== 3) {
          colors.push(toHex(r, g, b));
        }
        break;
    }
  }

  return colors;
}

// ─── Serviço ────────────────────────────────────────────────────────────────

/**
 * Carrega um PDF via PDF.js e detecta se cada página é digital
 * (com camada de texto nativa) ou escaneada (só imagem, precisa de OCR).
 *
 * Agora também extrai, para cada bloco de texto nativo:
 *   • isBold / isItalic — do nome da fonte e/ou da matriz de transformação
 *   • fontFamily         — nome normalizado para as famílias do pdf-lib
 *   • textColor          — cor real do texto via getOperatorList()
 */
@Injectable({ providedIn: 'root' })
export class PdfLoaderService {
  async load(file: File, password?: string): Promise<LoadedPdf> {
    const doc = await openPdf(file, password);
    // OPS precisa ser obtido do mesmo pdfjs instanciado (é memoized).
    const pdfjs = await getPdfjs();
    const OPS = pdfjs.OPS as unknown as Record<string, number>;

    const pages: PdfPageInfo[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page: PDFPageProxy = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });

      // Busca conteúdo de texto e lista de operadores em paralelo.
      const [textContent, opList] = await Promise.all([
        page.getTextContent(),
        (page as unknown as { getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }> }).getOperatorList(),
      ]);

      // Cores de preenchimento na ordem de aparição dos operadores de texto.
      const textColors = buildTextColorMap(opList, OPS);

      const nativeBlocks: PdfNativeBlock[] = [];
      const nativeTextArr: string[] = [];
      let textColorIdx = 0;

      for (const item of textContent.items) {
        if (!('str' in item)) continue;

        const color = textColors[textColorIdx++];

        if (!item.str.trim()) continue;

        nativeTextArr.push(item.str);

        const transform = item.transform; // [scaleX, skewY, skewX, scaleY, tx, ty]
        const px = transform[4];
        const py = transform[5];
        const skewX = transform[2] as number;

        // Corpo real da fonte: |scaleY| da matriz de texto (em pts do PDF).
        const fontSizePt = Math.abs(transform[3] as number);

        // Mapeia para o espaço de viewport (px de CSS).
        const vx = viewport.transform[0] * px + viewport.transform[2] * py + viewport.transform[4];
        const vy = viewport.transform[1] * px + viewport.transform[3] * py + viewport.transform[5];

        const wRaw = ((item as { width?: number }).width ?? 0) * Math.abs(viewport.transform[0]);
        const fontHeight = ((item as {height?: number}).height || fontSizePt) * Math.abs(viewport.transform[3]);

        // vy = baseline em px CSS. Ascendente ≈ 0.8 × fontHeight.
        const topPx = vy - fontHeight * 0.8;

        const x = vx / viewport.width;
        const y = topPx / viewport.height;
        const w = wRaw / viewport.width;
        const h = fontHeight / viewport.height;

        const rawFontName = 'fontName' in item ? (item.fontName as string) : undefined;
        const { isBold, isItalic, family } = resolveFontInfo(rawFontName, skewX);

        // Cor: se for branca/clara ou o PDF usar default preta, gravamos #000000
        // explicitly to avoid UI issues where text becomes invisible against the canvas.
        const textColor = color && color !== '#000000' && !isLightColor(color) ? color : '#000000';

        nativeBlocks.push({
          text: item.str,
          x, y, w, h,
          fontSizePt,
          fontName: rawFontName,
          skewX,
          isBold,
          isItalic,
          fontFamily: family,
          textColor,
        });
      }

      const nativeText = nativeTextArr.join(' ').trim();
      // Heurística: menos de 20 caracteres de texto nativo → trata como escaneada.
      const type: PdfPageType = nativeText.length >= 20 ? 'digital' : 'scanned';

      pages.push({
        index: i,
        type,
        width: viewport.width,
        height: viewport.height,
        nativeText,
        nativeBlocks,
      });
    }

    const digitalCount = pages.filter((p) => p.type === 'digital').length;
    const scannedCount = pages.filter((p) => p.type === 'scanned').length;

    let overallType: LoadedPdf['overallType'];
    if (scannedCount === 0) overallType = 'digital';
    else if (digitalCount === 0) overallType = 'scanned';
    else overallType = 'mixed';

    return { doc, pageCount: doc.numPages, pages, overallType };
  }

  /**
   * Renderiza uma página do PDF em um canvas offscreen na escala informada.
   * Usado tanto para exibição quanto como entrada para o Tesseract.
   */
  renderPageToCanvas(
    doc: PDFDocumentProxy,
    pageIndex: number,
    scale = 1.5,
  ): Promise<HTMLCanvasElement> {
    return renderPageToCanvas(doc, pageIndex, scale);
  }
}
