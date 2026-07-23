import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';

export interface PlacedSignature {
  id: string;
  signaturePngDataUrl: string; // data:image/png;base64,...
  pageIndex: number; // 1-based
  xPercent: number; // 0 to 100
  yPercent: number; // 0 to 100 (top-based)
  widthPercent: number; // e.g. 25 (%)
  label?: string;
}

export interface SignPdfOptions {
  file: File;
  password?: string;
  signatures: PlacedSignature[];
  onProgress?: (percent: number) => void;
}

@Injectable({ providedIn: 'root' })
export class PdfSignerService {
  async sign(options: SignPdfOptions): Promise<Blob> {
    const { file, password, signatures, onProgress } = options;

    if (!signatures.length) throw new AppError('pdf_export_failed');

    const { PDFDocument } = await import('pdf-lib');
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const totalPages = pdfDoc.getPageCount();

    const embeddedCache = new Map<string, any>();

    for (let i = 0; i < signatures.length; i++) {
      const sig = signatures[i];
      const targetPageIndex = Math.max(0, Math.min(totalPages - 1, sig.pageIndex - 1));
      const page = pdfDoc.getPage(targetPageIndex);
      const { width: pageWidth, height: pageHeight } = page.getSize();

      let embeddedImage = embeddedCache.get(sig.signaturePngDataUrl);
      if (!embeddedImage) {
        const base64Data = sig.signaturePngDataUrl.split(',')[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let k = 0; k < binaryString.length; k++) {
          bytes[k] = binaryString.charCodeAt(k);
        }
        embeddedImage = await pdfDoc.embedPng(bytes);
        embeddedCache.set(sig.signaturePngDataUrl, embeddedImage);
      }

      const imgAspect = embeddedImage.height / embeddedImage.width;
      const sigWidth = Math.max(20, (pageWidth * sig.widthPercent) / 100);
      const sigHeight = sigWidth * imgAspect;

      const posX = (pageWidth * sig.xPercent) / 100;
      const posY = pageHeight - (pageHeight * sig.yPercent) / 100 - sigHeight;

      page.drawImage(embeddedImage, {
        x: Math.max(0, Math.min(pageWidth - sigWidth, posX)),
        y: Math.max(0, Math.min(pageHeight - sigHeight, posY)),
        width: sigWidth,
        height: sigHeight,
      });

      if (onProgress) {
        onProgress(Math.round(((i + 1) / signatures.length) * 100));
      }
    }

    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    return new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  }
}
