import { Injectable } from '@angular/core';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

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
 * PDF.js is loaded lazily so it doesn't bloat the initial bundle.
 *
 * O worker é servido de `pdfjs/` (copiado do node_modules em angular.json,
 * mesmo padrão do `ort/`). Ele NÃO pode ser resolvido via
 * `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)`: `new URL` não
 * resolve bare specifier, então isso vira caminho relativo ao chunk e em produção
 * pede /pdfjs-dist/... — que não existe, o SPA fallback devolve index.html e o
 * browser recusa por MIME type. O pdf.js então cai para "fake worker" e todo PDF
 * falha como se fosse inválido. Copiar do node_modules mantém worker e API na
 * mesma versão automaticamente.
 */
@Injectable({ providedIn: 'root' })
export class PdfLoaderService {
  private pdfjsLoaded = false;

  private async ensurePdfjs(): Promise<void> {
    if (this.pdfjsLoaded) return;

    const pdfjs = await import('pdfjs-dist');
    // Absoluto a partir do <base href>, não relativo à rota: em /pt ou /en um
    // caminho relativo pediria /pt/pdfjs/... e cairia no fallback do SPA.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs/pdf.worker.min.mjs',
      document.baseURI,
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
