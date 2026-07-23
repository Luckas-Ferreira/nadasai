import { Injectable } from '@angular/core';
import { zipSync } from 'fflate';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../../core/pdf/pdfjs';

export type ImageOutputFormat = 'jpeg' | 'png' | 'webp';

export interface PdfToImgOptions {
  file: File;
  format: ImageOutputFormat;
  scale: number; // 1, 2, or 3
  selectedPages: number[]; // 1-based indices
  onProgress?: (percent: number) => void;
}

export interface PdfToImgResult {
  blob: Blob;
  filename: string;
  isZip: boolean;
  imageCount: number;
}

@Injectable({ providedIn: 'root' })
export class PdfToImgService {
  async convertToImages(options: PdfToImgOptions): Promise<PdfToImgResult> {
    const { file, format, scale, selectedPages, onProgress } = options;

    const doc = await openPdf(file);
    try {
      const totalPages = doc.numPages;
      if (totalPages === 0) {
        throw new Error('pdf_empty');
      }

      // Determine valid pages to process
      const pagesToProcess = (selectedPages.length > 0 ? selectedPages : Array.from({ length: totalPages }, (_, i) => i + 1))
        .filter((p) => p >= 1 && p <= totalPages)
        .sort((a, b) => a - b);

      if (pagesToProcess.length === 0) {
        throw new Error('no_pages_selected');
      }

      const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
      const ext = format === 'jpeg' ? 'jpg' : format;
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const quality = format === 'jpeg' || format === 'webp' ? 0.92 : undefined;

      const createdImages: { name: string; bytes: Uint8Array }[] = [];

      for (let i = 0; i < pagesToProcess.length; i++) {
        const pageNum = pagesToProcess[i];
        const canvas = await renderPageToCanvas(doc, pageNum, scale);

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), mimeType, quality),
        );
        releaseCanvas(canvas);

        if (!blob) {
          throw new Error(`Failed to convert page ${pageNum} to ${format}`);
        }

        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const imageName = `${baseName}_page_${pageNum}.${ext}`;

        createdImages.push({ name: imageName, bytes });

        if (onProgress) {
          onProgress(Math.round(((i + 1) / pagesToProcess.length) * 100));
        }
      }

      // If single image created, return directly as single image Blob
      if (createdImages.length === 1) {
        const blob = new Blob([createdImages[0].bytes], { type: mimeType });
        return {
          blob,
          filename: createdImages[0].name,
          isZip: false,
          imageCount: 1,
        };
      }

      // Multiple images created: bundle into a ZIP archive using fflate
      const zipFiles: Record<string, Uint8Array> = {};
      for (const item of createdImages) {
        zipFiles[item.name] = item.bytes;
      }

      const zipData = zipSync(zipFiles);
      const zipBlob = new Blob([zipData], { type: 'application/zip' });

      return {
        blob: zipBlob,
        filename: `${baseName}_images.zip`,
        isZip: true,
        imageCount: createdImages.length,
      };
    } finally {
      await closePdf(doc);
    }
  }
}
