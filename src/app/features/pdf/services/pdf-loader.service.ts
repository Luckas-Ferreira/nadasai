import { Injectable } from '@angular/core';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export type PdfPageType = 'digital' | 'scanned' | 'unknown';

export interface PdfPageInfo {
  index: number;      // 1-based
  type: PdfPageType;
  width: number;
  height: number;
  nativeText: string; // empty string when scanned
}

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  pageCount: number;
  pages: PdfPageInfo[];
  overallType: 'digital' | 'scanned' | 'mixed';
}

/**
 * Loads a PDF via PDF.js and detects whether each page is digital
 * (has a native text layer) or scanned (image-only, needs OCR).
 *
 * PDF.js is loaded lazily so it doesn't bloat the initial bundle.
 * The worker is pointed at pdfjs-dist's own copy to avoid a separate fetch.
 */
@Injectable({ providedIn: 'root' })
export class PdfLoaderService {
  private pdfjsLoaded = false;

  private async ensurePdfjs(): Promise<void> {
    if (this.pdfjsLoaded) return;

    const pdfjs = await import('pdfjs-dist');
    // Point the worker at the bundled version so no extra network request is needed.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url,
    ).toString();

    this.pdfjsLoaded = true;
  }

  async load(file: File): Promise<LoadedPdf> {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      throw new Error('pdf_unsupported');
    }
    if (file.size > 100 * 1024 * 1024) {
      throw new Error('pdf_too_large');
    }

    await this.ensurePdfjs();
    const { getDocument } = await import('pdfjs-dist');

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = getDocument({ data: arrayBuffer });
    let doc: PDFDocumentProxy;

    try {
      doc = await loadingTask.promise;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('password')) throw new Error('pdf_encrypted');
      throw new Error('pdf_unsupported');
    }

    const pages: PdfPageInfo[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page: PDFPageProxy = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      const nativeText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim();

      // Heuristic: fewer than 20 chars of native text → treat as scanned.
      const type: PdfPageType = nativeText.length >= 20 ? 'digital' : 'scanned';

      pages.push({
        index: i,
        type,
        width: viewport.width,
        height: viewport.height,
        nativeText,
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
   * Renders a single PDF page to an offscreen canvas at the given scale.
   * Used both for display and as the input to Tesseract.
   */
  async renderPageToCanvas(
    doc: PDFDocumentProxy,
    pageIndex: number,
    scale = 1.5,
  ): Promise<HTMLCanvasElement> {
    const page = await doc.getPage(pageIndex);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;

    return canvas;
  }
}
