import { Injectable } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextEdit } from '../pdf.component';

/**
 * Rebuilds the edited PDF using pdf-lib.
 *
 * Strategy (same as Smallpdf / ILovePDF):
 *   1. Load the original PDF bytes.
 *   2. For each page that has edits:
 *      a. Cover the original content area with a white rectangle (whiteout).
 *      b. Write the new text using Helvetica (always available in pdf-lib).
 *   3. For scanned pages that went through OCR, embed an invisible text layer
 *      so the exported PDF is searchable.
 *   4. Save and return as a Blob.
 *
 * Limitation: font metrics will not match the original exactly. For edits
 * to digital PDFs this is unavoidable without embedding the source font.
 * The result is always readable and correct; the visual match may vary.
 */
@Injectable({ providedIn: 'root' })
export class PdfExporterService {
  async export(
    doc: PDFDocumentProxy,
    edits: Map<number, TextEdit[]>, // key = 1-based page index
    ocrLayers: Map<number, { text: string; x: number; y: number; w: number; h: number }[]>,
  ): Promise<Blob> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    // Re-read the original bytes from the PDF.js doc.
    const originalBytes = await doc.getData();
    const pdfDoc = await PDFDocument.load(originalBytes);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const [pageIdx, pageEdits] of edits.entries()) {
      const page = pages[pageIdx - 1];
      if (!page) continue;

      const { width, height } = page.getSize();

      for (const edit of pageEdits) {
        if (edit.deleted) {
          // Whiteout the original area.
          page.drawRectangle({
            x: edit.x * width,
            y: height - (edit.y + edit.h) * height,
            width: edit.w * width,
            height: edit.h * height,
            color: rgb(1, 1, 1),
            borderWidth: 0,
          });
        }

        if (edit.newText) {
          // Calculate approximate font size from block height.
          const fontSize = Math.max(6, Math.round(edit.h * height * 0.75));

          page.drawText(edit.newText, {
            x: edit.x * width,
            y: height - (edit.y + edit.h) * height + 2,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
            maxWidth: edit.w * width,
          });
        }
      }
    }

    // Embed invisible OCR text layers for scanned pages.
    for (const [pageIdx, ocrBlocks] of ocrLayers.entries()) {
      const page = pages[pageIdx - 1];
      if (!page) continue;

      const { width, height } = page.getSize();

      for (const block of ocrBlocks) {
        const fontSize = Math.max(4, Math.round(block.h * height * 0.75));
        page.drawText(block.text, {
          x: block.x * width,
          y: height - (block.y + block.h) * height,
          size: fontSize,
          font,
          // Invisible text: opacity 0 — makes the PDF searchable
          // without visually altering the scanned image.
          opacity: 0,
        });
      }
    }

    const bytes = await pdfDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  }
}
