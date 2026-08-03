import { Injectable } from '@angular/core';
import { AppError } from '../../../../core/errors';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../../../core/pdf/pdfjs';
import { canvasToBlob } from '../../../../core/image/image-file.util';
import { type Region, regionsOnPage } from '../../../../core/geometry/region';
import { burnRegions } from '../../../../core/image/redact';

const POINTS_PER_INCH = 72;

export interface RedactPdfOptions {
  readonly file: File;
  readonly password?: string;
  readonly regions: readonly Region[];
  readonly dpi?: number;
  readonly quality?: number;
  readonly onProgress?: (done: number, total: number) => void;
}

export interface RedactPdfResult {
  readonly blob: Blob;
  readonly filename: string;
  readonly pagesRasterized: number;
}

/**
 * Redaction that actually redacts.
 *
 * Every page is rasterised, the covered regions are burned into the pixels, and
 * the PDF is rebuilt from those rasters — so the text objects underneath do not
 * survive in any form. Copy-paste finds nothing, `getTextContent()` returns
 * nothing, and neither does `strings`. A black rectangle DRAWN OVER a text
 * layer, which is what most "redaction" features do, leaves the text sitting
 * right there in the file.
 *
 * `drawInvisibleText` from compress-pdf must never be borrowed here: re-drawing
 * the text layer to keep the document searchable is precisely the leak this
 * tool exists to close.
 *
 * The cost is real and the panel says so: the whole document becomes images, so
 * it is no longer searchable or accessible to a screen reader. Surgical
 * redaction — dropping only the covered glyphs and leaving the rest vector — is
 * not expressible in pdf-lib.
 *
 * No jspdf: pdf-lib's embedJpg does everything needed here, so this follows the
 * dynamic-import rule with no deviation. protect-pdf only reaches for jspdf
 * because pdf-lib cannot ENCRYPT, which redaction does not need.
 */
@Injectable({ providedIn: 'root' })
export class PdfRedactorService {
  async redact(options: RedactPdfOptions): Promise<RedactPdfResult> {
    const { file, password, regions, dpi = 150, quality = 0.85, onProgress } = options;
    if (regions.length === 0) throw new AppError('pdf_no_regions');

    const { PDFDocument } = await import('pdf-lib');
    const source = await openPdf(file, password);

    try {
      if (source.numPages === 0) throw new AppError('pdf_no_pages');

      const out = await PDFDocument.create();
      const scale = dpi / POINTS_PER_INCH;

      // Sequential: at 150 DPI an A4 page is ~8 MP of RGBA, so mapping this
      // through Promise.all would hold every page's raster at once.
      for (let i = 1; i <= source.numPages; i++) {
        const page = await source.getPage(i);
        const { width, height } = page.getViewport({ scale: 1 });

        const canvas = await renderPageToCanvas(source, i, scale);
        burnRegions(canvas, regionsOnPage(regions, i));
        const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality);
        releaseCanvas(canvas);

        const embedded = await out.embedJpg(await jpeg.arrayBuffer());
        const outPage = out.addPage([width, height]);
        outPage.drawImage(embedded, { x: 0, y: 0, width, height });

        onProgress?.(i, source.numPages);
      }

      let bytes: Uint8Array;
      try {
        bytes = await out.save({ useObjectStreams: true });
      } catch (err) {
        throw new AppError('pdf_export_failed', err);
      }

      return {
        blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
        filename: file.name.replace(/\.pdf$/i, '') + '-redacted.pdf',
        pagesRasterized: source.numPages,
      };
    } finally {
      await closePdf(source);
    }
  }
}
