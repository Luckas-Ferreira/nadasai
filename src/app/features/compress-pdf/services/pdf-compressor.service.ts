import { Injectable } from '@angular/core';
import type { PDFFont, PDFPage } from 'pdf-lib';
import { canvasToBlob } from '../../../core/image/image-file.util';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../../core/pdf/pdfjs';

export type CompressLevel = 'light' | 'balanced' | 'strong' | 'lossless';

export const COMPRESS_LEVELS: readonly CompressLevel[] = ['light', 'balanced', 'strong', 'lossless'];

/** DPI and JPEG quality per level. `lossless` never rasterizes, so it has none. */
const RASTER: Record<Exclude<CompressLevel, 'lossless'>, { dpi: number; quality: number }> = {
  light: { dpi: 200, quality: 0.85 },
  balanced: { dpi: 150, quality: 0.72 },
  strong: { dpi: 110, quality: 0.6 },
};

/** A PDF point is 1/72 inch, which is what makes this the scale for a DPI. */
const POINTS_PER_INCH = 72;

export interface CompressResult {
  readonly blob: Blob;
  /**
   * True when compressing would have produced a BIGGER file and the original
   * bytes were handed back instead.
   */
  readonly keptOriginal: boolean;
}

/**
 * Shrinks a PDF entirely in the browser.
 *
 * Two strategies, and the difference matters to the user, which is why the UI
 * names them rather than hiding them behind one slider:
 *
 * - `lossless` re-saves the document through pdf-lib with object streams on.
 *   Nothing is degraded, but the saving is whatever the original writer left on
 *   the table — often single digits, sometimes nothing.
 * - Everything else renders each page through pdf.js and rebuilds the document
 *   from JPEGs. That is where the real saving lives (a photographed form drops
 *   by 90%), and the cost is that vector text stops being vector text.
 *
 * The text is not simply thrown away, though: whatever text layer the page had
 * is re-drawn invisibly over the raster, so Ctrl+F still finds it. That is the
 * same trick `PdfExporterService` uses to make OCR'd scans searchable.
 */
@Injectable({ providedIn: 'root' })
export class PdfCompressorService {
  async compress(
    file: File,
    level: CompressLevel,
    onProgress?: (done: number, total: number) => void,
  ): Promise<CompressResult> {
    const blob = level === 'lossless'
      ? await this.rewrite(file, onProgress)
      : await this.rasterize(file, RASTER[level], onProgress);

    /**
     * A compressor that hands back a bigger file is the one failure nobody
     * forgives, and it is the NORMAL outcome on an already-optimised digital
     * PDF: a page of crisp vector text becomes a photograph of itself. Better to
     * say so and keep the original than to "succeed" into a worse file.
     */
    if (blob.size >= file.size) {
      return { blob: file.slice(0, file.size, 'application/pdf'), keptOriginal: true };
    }

    return { blob, keptOriginal: false };
  }

  /** Structural only: same content, tighter container. */
  private async rewrite(file: File, onProgress?: (done: number, total: number) => void): Promise<Blob> {
    const { PDFDocument } = await import('pdf-lib');

    onProgress?.(0, 1);
    const doc = await PDFDocument.load(await file.arrayBuffer());
    const bytes = await doc.save({ useObjectStreams: true });
    onProgress?.(1, 1);

    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
  }

  private async rasterize(
    file: File,
    { dpi, quality }: { dpi: number; quality: number },
    onProgress?: (done: number, total: number) => void,
  ): Promise<Blob> {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');

    const source = await openPdf(file);

    try {
      const out = await PDFDocument.create();
      const helvetica = await out.embedFont(StandardFonts.Helvetica);
      const scale = dpi / POINTS_PER_INCH;

      /**
       * SEQUENTIAL, like `encodePdfFromImages`. At 200 DPI an A4 page is a
       * ~14 MP canvas — roughly 55 MB of RGBA — so mapping this through
       * Promise.all would hold every page's raster at once and kill the tab on
       * any real document. One at a time, the peak is one canvas.
       */
      for (let i = 1; i <= source.numPages; i++) {
        const page = await source.getPage(i);
        // Scale 1 = the page's true size in PDF points, which is what the output
        // page must measure regardless of the DPI we sampled it at.
        const { width, height } = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();

        const canvas = await renderPageToCanvas(source, i, scale);
        const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
        releaseCanvas(canvas);

        const embedded = await out.embedJpg(await jpeg.arrayBuffer());
        const outPage = out.addPage([width, height]);
        outPage.drawImage(embedded, { x: 0, y: 0, width, height });

        this.drawInvisibleText(outPage, textContent.items, height, helvetica);

        onProgress?.(i, source.numPages);
      }

      const bytes = await out.save({ useObjectStreams: true });
      return new Blob([bytes as BlobPart], { type: 'application/pdf' });
    } finally {
      await closePdf(source);
    }
  }

  /**
   * Re-draws the page's own text at `opacity: 0` over the raster, so the
   * compressed PDF is still searchable and selectable.
   *
   * pdf.js hands back each item's transform in PDF space, which is already the
   * space pdf-lib draws in — same origin (bottom-left), same units — so the
   * position needs no conversion. `transform[5]` is the baseline, which is
   * exactly what `drawText`'s `y` means.
   */
  private drawInvisibleText(
    page: PDFPage,
    items: readonly unknown[],
    pageHeight: number,
    font: PDFFont,
  ): void {
    for (const item of items) {
      const entry = item as { str?: string; transform?: number[]; height?: number };
      const text = entry.str;
      const transform = entry.transform;
      if (!text?.trim() || !transform) continue;

      const clean = sanitizeWinAnsi(text);
      if (!clean) continue;

      const size = Math.max(1, Math.abs(entry.height || transform[3] || 8));
      const y = transform[5];
      // Text that landed off-page (pdf.js reports clipped items too) would be
      // invisible anyway; skipping it keeps the file smaller.
      if (y < -size || y > pageHeight + size) continue;

      /**
       * Guarded per item, on purpose. `StandardFonts.Helvetica` can only encode
       * WinAnsi, and pdf-lib THROWS on anything outside it — sanitizeWinAnsi
       * handles the characters it can name, but one exotic glyph must not cost
       * the user the whole compression. The invisible layer is a bonus; the
       * smaller file is the job.
       */
      try {
        page.drawText(clean, { x: transform[4], y, size, font, opacity: 0 });
      } catch {
        // Skip this run and keep going.
      }
    }
  }
}

/**
 * Maps text onto what WinAnsi (cp1252) can actually encode.
 *
 * The common offenders in real documents are the typographic punctuation Word
 * and InDesign insert — curly quotes, dashes, ellipsis — which have WinAnsi
 * equivalents and are worth keeping legible in a search. Anything else outside
 * Latin-1 becomes a space, which preserves word boundaries for Ctrl+F rather
 * than gluing tokens together.
 */
function sanitizeWinAnsi(text: string): string {
  const folded = text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ');

  let out = '';
  for (const char of folded) {
    const code = char.codePointAt(0) ?? 0;
    // Printable Latin-1 plus tab; everything else would either throw on encode
    // or render as a control character.
    out += (code >= 0x20 && code <= 0xff) || code === 0x09 ? char : ' ';
  }

  return out.trim();
}
