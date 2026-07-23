import { Injectable } from '@angular/core';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { openPdf, renderPageToCanvas } from '../../../core/pdf/pdfjs';

export type PdfPageType = 'digital' | 'scanned' | 'unknown';

export interface PdfNativeBlock {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
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

/**
 * Loads a PDF via PDF.js and detects whether each page is digital
 * (has a native text layer) or scanned (image-only, needs OCR).
 *
 * Opening and rendering now live in `core/pdf/pdfjs.ts`, shared with the merge
 * and compress tools — that module owns the worker-path rule, which is the part
 * that breaks silently if it is duplicated. What stays here is the only thing
 * specific to the editor: the per-page digital/scanned classification.
 */
@Injectable({ providedIn: 'root' })
export class PdfLoaderService {
  async load(file: File, password?: string): Promise<LoadedPdf> {
    const doc = await openPdf(file, password);

    const pages: PdfPageInfo[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page: PDFPageProxy = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      const nativeBlocks: PdfNativeBlock[] = [];
      const nativeTextArr: string[] = [];

      for (const item of textContent.items) {
        if ('str' in item && item.str.trim()) {
          nativeTextArr.push(item.str);
          const transform = item.transform; // [scaleX, skewY, skewX, scaleY, translateX, translateY]
          const px = transform[4];
          const py = transform[5];

          // Map from PDF space to viewport (CSS pixel) space
          const vx = viewport.transform[0] * px + viewport.transform[2] * py + viewport.transform[4];
          const vy = viewport.transform[1] * px + viewport.transform[3] * py + viewport.transform[5];

          // item.width and item.height are in PDF space. Convert to viewport space.
          // Note: item.height is sometimes 0, fallback to scaleY (transform[3]).
          const wRaw = item.width * Math.abs(viewport.transform[0]);
          const fontHeight = (item.height || Math.abs(transform[3])) * Math.abs(viewport.transform[3]);
          
          // vy is the baseline in CSS pixels.
          // PDF text is drawn upwards from the baseline.
          // A standard approximation is ascent ≈ 0.8 * fontHeight.
          const topPx = vy - (fontHeight * 0.8);

          const x = vx / viewport.width;
          const y = topPx / viewport.height;
          const w = wRaw / viewport.width;
          const h = fontHeight / viewport.height;
          
          nativeBlocks.push({ text: item.str, x, y, w, h });
        }
      }

      const nativeText = nativeTextArr.join(' ').trim();

      // Heuristic: fewer than 20 chars of native text → treat as scanned.
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
   * Renders a single PDF page to an offscreen canvas at the given scale.
   * Used both for display and as the input to Tesseract.
   */
  renderPageToCanvas(
    doc: PDFDocumentProxy,
    pageIndex: number,
    scale = 1.5,
  ): Promise<HTMLCanvasElement> {
    return renderPageToCanvas(doc, pageIndex, scale);
  }
}
