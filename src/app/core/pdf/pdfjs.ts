import type { PDFDocumentProxy } from 'pdfjs-dist';
import { AppError } from '../errors';

/** Matches the limit PdfLoaderService has always enforced, and `error.pdf_too_large`. */
export const MAX_PDF_BYTES = 100 * 1024 * 1024;

let pdfjs: typeof import('pdfjs-dist') | null = null;

/**
 * Loads pdf.js and points it at the self-hosted worker. Memoized — three tools
 * now open PDFs and none of them should re-run this.
 *
 * The `workerSrc` rule is the fragile part, and it is why this lives in one
 * place instead of in each service. It must be resolved against
 * `document.baseURI`, NOT relatively: routes are `/pt/…` and `/en/…`, so a
 * relative path asks for `/pt/pdfjs/pdf.worker.min.mjs`, hits the SPA fallback,
 * comes back as index.html, and the browser rejects it on MIME type. pdf.js then
 * quietly falls back to a "fake worker" and every PDF fails as if it were
 * corrupt. `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)` fails
 * the same way — `new URL` does not resolve bare specifiers.
 */
export async function getPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (pdfjs) return pdfjs;

  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).toString();

  pdfjs = lib;
  return lib;
}

/**
 * Validates and opens a PDF, mapping pdf.js's failures onto AppError codes.
 *
 * The buffer is COPIED before it is handed over. pdf.js transfers ownership of
 * the ArrayBuffer to its worker, which detaches the original — and both the
 * merge and compress tools read the same File again afterwards to hand its bytes
 * to pdf-lib. Without the copy that second read comes back empty.
 */
export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new AppError('pdf_unsupported');
  }
  if (file.size > MAX_PDF_BYTES) throw new AppError('pdf_too_large');

  const { getDocument } = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  try {
    return await getDocument({ data }).promise;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes('password')) throw new AppError('pdf_encrypted', err);
    throw new AppError('pdf_unsupported', err);
  }
}

/**
 * Renders one page to an offscreen canvas. Used for display, for thumbnails and
 * as the input to both Tesseract and the compressor's JPEG re-encode.
 */
export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageIndex: number,
  scale = 1.5,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageIndex);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AppError('encode_failed');

  await page.render({ canvasContext: ctx, canvas, viewport }).promise;

  return canvas;
}

/**
 * Releases a document and the worker behind it.
 *
 * `PDFDocumentProxy` has no `destroy()` — teardown lives on its loading task,
 * and pdf.js spins up a worker per task unless you hand it one. A tool that
 * opens twenty PDFs to build thumbnails and never calls this leaves twenty
 * workers, each holding its own copy of a document, alive for the whole session.
 *
 * Never throws: this is always cleanup, usually in a `finally`, and a failure
 * here must not mask the error that sent us there.
 */
export async function closePdf(doc: PDFDocumentProxy): Promise<void> {
  try {
    await doc.loadingTask.destroy();
  } catch {
    // Already gone, or the worker died first. Nothing left to release.
  }
}

/**
 * Drops a canvas's backing store immediately instead of waiting for GC.
 *
 * The compressor holds a full-page raster at 200 DPI — an A4 is ~14 MP, ~55 MB
 * of RGBA — and the loop is sequential precisely so only one exists at a time.
 * Letting the finished one linger until the collector runs defeats that.
 */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
