import { Injectable } from '@angular/core';
import type { jsPDF } from 'jspdf';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../../core/pdf/pdfjs';

export interface ProtectPdfOptions {
  file: File;
  password: string;
  onProgress?: (percent: number) => void;
}

@Injectable({ providedIn: 'root' })
export class PdfProtectorService {
  async protect(options: ProtectPdfOptions): Promise<Blob> {
    const { file, password, onProgress } = options;

    // Dinâmico, como em todo o resto do repositório. Era o único import
    // estático de jspdf — registrado no CLAUDE.md como desvio consciente,
    // seguro enquanto só custava peso dentro de uma rota lazy. Com a geração
    // estática ele passou a custar mais do que peso: o módulo do jspdf toca
    // `document` ao ser carregado, e no Node isso derruba o build inteiro na
    // importação, antes de qualquer render. Aqui o import só acontece quando
    // alguém realmente protege um PDF, que é sempre no navegador.
    const { jsPDF } = await import('jspdf');

    const doc = await openPdf(file);
    try {
      const totalPages = doc.numPages;
      if (totalPages === 0) throw new Error('pdf_empty');

      let pdfDoc: jsPDF | null = null;

      for (let i = 1; i <= totalPages; i++) {
        const page = await doc.getPage(i);
        const viewport1x = page.getViewport({ scale: 1 });
        const widthPt = viewport1x.width;
        const heightPt = viewport1x.height;
        const orientation = widthPt > heightPt ? 'landscape' : 'portrait';

        // Render at 2x scale for HD clarity
        const canvas = await renderPageToCanvas(doc, i, 2);
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        releaseCanvas(canvas);

        if (i === 1) {
          pdfDoc = new jsPDF({
            orientation,
            unit: 'pt',
            format: [widthPt, heightPt],
            compress: true,
            encryption: {
              userPassword: password,
              ownerPassword: password,
              userPermissions: ['print', 'modify', 'copy', 'annot-forms'],
            },
          });
          pdfDoc.addImage(imgData, 'JPEG', 0, 0, widthPt, heightPt);
        } else if (pdfDoc) {
          pdfDoc.addPage([widthPt, heightPt], orientation);
          pdfDoc.addImage(imgData, 'JPEG', 0, 0, widthPt, heightPt);
        }

        if (onProgress) {
          onProgress(Math.round((i / totalPages) * 100));
        }
      }

      if (!pdfDoc) throw new Error('pdf_export_failed');

      return pdfDoc.output('blob');
    } finally {
      await closePdf(doc);
    }
  }
}
