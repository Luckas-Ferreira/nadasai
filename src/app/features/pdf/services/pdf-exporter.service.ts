import { Injectable } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { TextEdit } from '../pdf.component';
import { baseFontSize } from './font-metrics';

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
    const baseFonts = {
      Helvetica: {
        normal: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
        italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
        boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
      },
      Arial: {
        normal: await pdfDoc.embedFont(StandardFonts.Helvetica),
        bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
        italic: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
        boldItalic: await pdfDoc.embedFont(StandardFonts.HelveticaBoldOblique),
      },
      TimesRoman: {
        normal: await pdfDoc.embedFont(StandardFonts.TimesRoman),
        bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
        italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
        boldItalic: await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic),
      },
      Courier: {
        normal: await pdfDoc.embedFont(StandardFonts.Courier),
        bold: await pdfDoc.embedFont(StandardFonts.CourierBold),
        italic: await pdfDoc.embedFont(StandardFonts.CourierOblique),
        boldItalic: await pdfDoc.embedFont(StandardFonts.CourierBoldOblique),
      }
    };

    for (const [pageIdx, pageEdits] of edits.entries()) {
      const page = pages[pageIdx - 1];
      if (!page) continue;

      const { width, height } = page.getSize();

      for (const edit of pageEdits) {
        let bgColorStr = edit.bgColor;
        if (!bgColorStr && (edit.deleted || edit.newText !== null)) {
          bgColorStr = '#ffffff'; // Default to white for edits
        }

        if (bgColorStr && bgColorStr !== 'transparent') {
          let hex = bgColorStr.replace('#', '');
          if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
          const bgR = parseInt(hex.substring(0, 2), 16) / 255;
          const bgG = parseInt(hex.substring(2, 4), 16) / 255;
          const bgB = parseInt(hex.substring(4, 6), 16) / 255;

          page.drawRectangle({
            x: edit.x * width,
            y: height - (edit.y + edit.h) * height,
            width: edit.w * width,
            height: edit.h * height,
            color: rgb(bgR, bgG, bgB),
            borderWidth: 0,
          });
        }

        if (edit.newText) {
          // Mesma função que a tela usa, de propósito: o que foi editado precisa
          // sair do export do tamanho em que estava sendo editado.
          const fontSize = Math.max(6, Math.round(baseFontSize(edit, height) * (edit.fontScale || 1.0)));

          // Select correct font
          const fontConfig = baseFonts[edit.fontFamily || 'Helvetica'];
          let pdfFont = fontConfig.normal;
          if (edit.bold && edit.italic) pdfFont = fontConfig.boldItalic;
          else if (edit.bold) pdfFont = fontConfig.bold;
          else if (edit.italic) pdfFont = fontConfig.italic;

          // Parse hex color (default black)
          let hex = (edit.color || '#000000').replace('#', '');
          if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;
          const scaledH = edit.h * (edit.fontScale || 1.0);
          page.drawText(edit.newText, {
            x: edit.x * width,
            y: height - (edit.y + scaledH) * height + (scaledH * height * 0.25),
            size: fontSize,
            font: pdfFont,
            color: rgb(r, g, b),
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
          font: baseFonts.Helvetica.normal,
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
