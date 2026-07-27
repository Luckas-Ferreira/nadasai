// Promise.try — removido pelo zone.js e exigido pelo pdf.js em toda troca de
// mensagem com o worker. Importado aqui além de main.ts para quem carregar este
// módulo fora do bootstrap do app (testes unitários).
import './promise-try';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AppError } from '../errors';

/** Matches the limit PdfLoaderService has always enforced, and `error.pdf_too_large`. */
export const MAX_PDF_BYTES = 100 * 1024 * 1024;

let pdfjs: typeof import('pdfjs-dist') | null = null;

/**
 * Loads pdf.js and points it at the self-hosted worker. Memoized — three tools
 * now open PDFs and none of them should re-run this.
 */
export async function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (pdfjs) return pdfjs;

  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).toString();
  try {
    if ('VerbosityLevel' in lib && (lib as any).VerbosityLevel) {
      (lib as any).verbosity = (lib as any).VerbosityLevel.ERRORS;
    }
  } catch {
    // ESM module exports are frozen objects in modern browsers.
  }

  pdfjs = lib;
  return lib;
}

/**
 * Diretórios de recursos que o pdf.js busca em runtime, todos auto-hospedados.
 *
 * Sem eles o pdf.js **não falha** — ele avisa no console e segue em frente, o que
 * é pior: a página renderiza com pedaços faltando e nada no app indica o porquê.
 * Foi assim que os logos de um histórico acadêmico sumiram do editor, com um
 * `getOperatorList - ignoring XObject: "UnknownErrorException: undefined is not
 * iterable"` por imagem — o decodificador que faltava era o `openjpeg.wasm`.
 *
 *   • wasm/            — decodificadores JPEG2000 (openjpeg), JBIG2 e qcms.
 *                        A partir do pdf.js 6 eles saíram do bundle e viraram
 *                        WASM buscado em runtime.
 *   • iccs/            — perfil de cor para imagens com ICC embarcado.
 *   • standard_fonts/  — as 14 fontes padrão, para PDFs que as referenciam sem
 *                        embarcar (comum em documentos gerados por servidor).
 *   • cmaps/           — tabelas de codificação; sem elas, texto com encoding
 *                        não-trivial é extraído embaralhado.
 *
 * Resolvido a partir de `document.baseURI`, nunca relativo: as rotas são
 * `/pt/…` e `/en/…`, e um caminho relativo cairia no fallback da SPA e voltaria
 * como `index.html`. A barra final é obrigatória — o pdf.js valida e lança
 * "Invalid factory url" sem ela.
 */
function pdfAssetUrls(): Record<string, string> {
  const base = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).toString();
  return {
    wasmUrl: base('wasm'),
    iccUrl: base('iccs'),
    standardFontDataUrl: base('standard_fonts'),
    cMapUrl: base('cmaps'),
  };
}

/**
 * Validates and opens a PDF, supporting password protection and mapping pdf.js failures onto AppError codes.
 */
export async function openPdf(file: File, password?: string): Promise<PDFDocumentProxy> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new AppError('pdf_unsupported');
  }
  if (file.size > MAX_PDF_BYTES) throw new AppError('pdf_too_large');

  const { getDocument } = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  try {
    return await getDocument({ data, password, ...pdfAssetUrls() }).promise;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const errName = (err as any)?.name;

    if (
      message.toLowerCase().includes('password') ||
      errName === 'PasswordException' ||
      errName === 'IncorrectPasswordException'
    ) {
      throw new AppError('pdf_encrypted', err);
    }
    throw new AppError('pdf_unsupported', err);
  }
}

/**
 * Renders one page to an offscreen canvas.
 */
export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageIndex: number,
  scale = 1.5,
): Promise<HTMLCanvasElement> {
  return renderPageIntoCanvas(doc, pageIndex, scale, document.createElement('canvas'));
}

/**
 * Renders one page directly into a canvas that already exists — tipicamente o
 * `<canvas>` que já está no DOM.
 *
 * Existe porque desenhar numa tela offscreen e depois copiar para a do DOM
 * mantém as duas alocadas ao mesmo tempo: 2× memória de vídeo por página. Numa
 * A4 a 3.2× isso é ~40 MB por página, e o navegador não lança erro quando o
 * limite estoura — ele devolve um canvas em branco. Era esse o "sumiram os
 * logos e as tabelas" no editor de PDF de documentos com várias páginas.
 */
export async function renderPageIntoCanvas(
  doc: PDFDocumentProxy,
  pageIndex: number,
  scale: number,
  canvas: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageIndex);
  const viewport = page.getViewport({ scale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AppError('encode_failed');

  await page.render({ canvasContext: ctx, canvas, viewport }).promise;

  return canvas;
}

/** Amostras por pixel de dispositivo. 2× é o ponto em que o texto para de serrilhar. */
const SUPERSAMPLE = 2;
/** Piso: abaixo disto o raster fica visivelmente mole mesmo sem zoom. */
const MIN_SCALE = 2.5;
/** Teto: acima disto o ganho é imperceptível e o custo de memória, não. */
const MAX_SCALE = 4;
/** ~256 MB de backing store somando todas as páginas. Só morde com zoom alto. */
const BUDGET_PX = 64_000_000;

/**
 * Escala de rasterização de uma página, derivada do zoom em que ela vai ser
 * **exibida**.
 *
 * Uma escala fixa erra dos dois lados. No zoom padrão ela desperdiça memória
 * rasterizando muito acima do que a tela mostra; e assim que o usuário amplia
 * além do fator de supersampling, o navegador passa a esticar o raster — o
 * texto do canvas fica mole enquanto o texto HTML de um bloco selecionado
 * continua vetorial e nítido, e a diferença entre os dois salta aos olhos.
 *
 * O orçamento total continua como teto, mas generoso e proporcional ao que a
 * tela pede, em vez de dividir uma cota fixa pelo número de páginas — o que
 * fazia um edital de 20 páginas rasterizar a 1.5× e parecer um fax.
 */
export function pageRenderScale(opts: {
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  displayScale: number;
  devicePixelRatio?: number;
  budgetPx?: number;
}): number {
  const dpr = opts.devicePixelRatio ?? 1;
  const wanted = Math.min(MAX_SCALE, Math.max(MIN_SCALE, opts.displayScale * dpr * SUPERSAMPLE));

  const areaAt1x = Math.max(1, opts.pageWidth * opts.pageHeight) * Math.max(1, opts.pageCount);
  const maxByBudget = Math.sqrt((opts.budgetPx ?? BUDGET_PX) / areaAt1x);

  // Sem piso: o orçamento manda. Um piso qualquer anula o teto assim que o
  // documento é longo o bastante (300 páginas a 1.5× já pedem ~1.3 GB), e a
  // memória de canvas estourada não lança erro — devolve página em branco.
  //
  // Limitação conhecida: o componente rasteriza TODAS as páginas de uma vez, e é
  // isso que torna o orçamento necessário. A correção de verdade para
  // documentos muito longos é rasterizar sob demanda, conforme a página entra na
  // viewport, e liberar as que saem — aí a escala pode ser sempre a que a tela
  // pede. Enquanto isso não existe, acima de ~50 páginas o raster amolece.
  return Math.min(wanted, maxByBudget);
}

/**
 * Releases a document and the worker behind it.
 */
export async function closePdf(doc: PDFDocumentProxy): Promise<void> {
  try {
    await doc.loadingTask.destroy();
  } catch {
    // Already gone, or the worker died first. Nothing left to release.
  }
}

/**
 * Drops a canvas's backing store immediately.
 */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
