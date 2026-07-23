import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';

export interface WatermarkPdfOptions {
  file: File;
  password?: string;
  text: string;
  opacity: number; // 0.1 to 1.0
  fontSize: number; // e.g. 48
  rotationDegrees: number; // e.g. 45
  colorHex: string; // e.g. "#ef4444"
  onProgress?: (percent: number) => void;
}

@Injectable({ providedIn: 'root' })
export class PdfWatermarkService {
  async applyWatermark(options: WatermarkPdfOptions): Promise<Blob> {
    const { file, password, text, opacity, fontSize, rotationDegrees, colorHex, onProgress } = options;

    if (!text.trim()) throw new AppError('pdf_export_failed');

    const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();

    // Convert hex color to rgb
    const cleanHex = colorHex.replace('#', '');
    const r = (parseInt(cleanHex.slice(0, 2), 16) || 200) / 255;
    const g = (parseInt(cleanHex.slice(2, 4), 16) || 30) / 255;
    const b = (parseInt(cleanHex.slice(4, 6), 16) || 30) / 255;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = font.heightAtSize(fontSize);

      const x = (width - textWidth) / 2;
      const y = (height - textHeight) / 2;

      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(r, g, b),
        opacity,
        rotate: degrees(rotationDegrees),
      });

      onProgress?.(Math.round(((i + 1) / pages.length) * 100));
    }

    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    return new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  }
}
