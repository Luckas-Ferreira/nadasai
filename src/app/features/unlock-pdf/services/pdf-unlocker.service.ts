import { Injectable } from '@angular/core';
import { canvasToBlob } from '../../../core/image/image-file.util';
import { drawInvisibleText } from '../../../core/pdf/invisible-text';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../../core/pdf/pdfjs';

/** 200 DPI a 72 pontos por polegada. */
const POINTS_PER_INCH = 72;
const DPI = 200;
const JPEG_QUALITY = 0.9;

/**
 * REMOVE A PROTEÇÃO REDESENHANDO O DOCUMENTO, e não há outro caminho aqui.
 *
 * A divisão de trabalho deste produto entre as três bibliotecas de PDF é o que
 * decide isto: o **pdf.js** LÊ e sabe decifrar — dada a senha, ele entrega a
 * página já decifrada —, enquanto o **pdf-lib** ESCREVE e não sabe decifrar
 * nada. `PDFDocument.load(bytes, { ignoreEncryption: true })` passa pelo
 * cadeado sem abri-lo: os fluxos continuam cifrados e o arquivo salvo sai
 * ilegível, com a agravante de não lançar erro nenhum.
 *
 * Então o único caminho é o mesmo que o `protect-pdf` percorre na direção
 * oposta e que o `compress-pdf` usa nos níveis com perda: rasterizar cada
 * página com o leitor e montar um PDF novo com o escritor. O custo é o texto
 * vetorial, e ele é ANUNCIADO no painel em vez de ficar num comentário — a
 * mesma regra do `redact-pdf`.
 *
 * A busca sobrevive porque a camada de texto é redesenhada por baixo, com
 * opacidade zero. É o truque que o `PdfExporterService` usa para deixar um
 * documento escaneado pesquisável, e aqui ele paga a maior parte do preço.
 *
 * O que este serviço NÃO faz, e não deve passar a fazer: quebrar senha. Ele
 * exige a senha que abre o documento, que o componente recebe pelo prompt e
 * repassa ao `openPdf`. Sem ela o `openPdf` recusa, como em toda ferramenta de
 * PDF daqui.
 */
@Injectable({ providedIn: 'root' })
export class PdfUnlockerService {
  async unlock(
    file: File,
    password?: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Blob> {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');

    const source = await openPdf(file, password);

    try {
      const out = await PDFDocument.create();
      const helvetica = await out.embedFont(StandardFonts.Helvetica);
      const scale = DPI / POINTS_PER_INCH;

      // SEQUENCIAL, como o `rasterize` do compressor: a 200 DPI uma A4 é um
      // canvas de ~14 MP, uns 55 MB de RGBA. Mapear por `Promise.all` seguraria
      // todas as páginas ao mesmo tempo e mataria a aba em qualquer documento
      // de verdade.
      for (let i = 1; i <= source.numPages; i++) {
        const page = await source.getPage(i);
        // Escala 1 = o tamanho real da página em pontos, que é o que a página
        // de saída precisa medir, independente do DPI em que foi amostrada.
        const { width, height } = page.getViewport({ scale: 1 });
        const textContent = await page.getTextContent();

        const canvas = await renderPageToCanvas(source, i, scale);
        const jpeg = await canvasToBlob(canvas, 'image/jpeg', JPEG_QUALITY);
        releaseCanvas(canvas);

        const embedded = await out.embedJpg(await jpeg.arrayBuffer());
        const outPage = out.addPage([width, height]);
        outPage.drawImage(embedded, { x: 0, y: 0, width, height });

        drawInvisibleText(outPage, textContent.items, height, helvetica);

        onProgress?.(i, source.numPages);
      }

      // Sem `encrypt`: é justamente a ausência dele que é o produto aqui.
      const bytes = await out.save({ useObjectStreams: true });
      return new Blob([bytes as BlobPart], { type: 'application/pdf' });
    } finally {
      await closePdf(source);
    }
  }

}
