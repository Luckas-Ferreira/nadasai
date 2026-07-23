// Polyfill for Promise.try required by pdfjs-dist when handling encrypted PDF messages
if (typeof (Promise as any).try !== 'function') {
  (Promise as any).try = function <T>(fn: () => T | PromiseLike<T>): Promise<T> {
    return new Promise((resolve) => resolve(fn()));
  };
}

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

  pdfjs = lib;
  return lib;
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
    return await getDocument({ data, password }).promise;
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
