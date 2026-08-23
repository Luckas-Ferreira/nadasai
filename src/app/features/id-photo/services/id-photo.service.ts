import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';
import { canvasToBlob, loadImage } from '../../../core/image/image-file.util';
import {
  PRINT_DPI,
  cellPositions,
  mmToPx,
  sheetLayout,
  type PhotoFormat,
  type Sheet,
} from '../../../core/photo/id-photo';

export type SheetOutput = 'pdf' | 'jpg';

/** 72 pontos por polegada é a unidade do PDF; 25,4 mm é a polegada. */
const POINTS_PER_MM = 72 / 25.4;

/** Cinza claro da linha de corte, e sua espessura em milímetros. */
const GUIDE_GRAY = 0.75;
const GUIDE_MM = 0.2;

export interface ComposedSheet {
  readonly blob: Blob;
  readonly ext: string;
  readonly count: number;
}

/**
 * MONTA A FOLHA a partir de uma foto já recortada na medida certa.
 *
 * A escolha entre PDF e JPG não é de gosto: o PDF carrega o TAMANHO FÍSICO
 * dentro dele, então imprimir sai em 3x4 de verdade em qualquer impressora. Um
 * JPEG carrega só pixels — o tamanho impresso depende do que o programa de
 * impressão decidir, e é por isso que o PDF é o padrão aqui e o JPG existe
 * para quem vai mandar por mensagem em vez de imprimir.
 *
 * A imagem é embutida UMA vez e desenhada muitas. Embutir por cópia
 * multiplicaria os bytes da foto pelo número de fotos — a mesma regra que o
 * logo da marca d'água registra.
 */
@Injectable({ providedIn: 'root' })
export class IdPhotoService {
  async compose(
    photo: Blob,
    format: PhotoFormat,
    sheet: Sheet,
    output: SheetOutput,
  ): Promise<ComposedSheet> {
    const layout = sheetLayout(format, sheet);
    if (layout.count === 0) throw new AppError('encode_failed');

    return output === 'pdf'
      ? { blob: await this.toPdf(photo, layout), ext: 'pdf', count: layout.count }
      : { blob: await this.toJpeg(photo, layout), ext: 'jpg', count: layout.count };
  }

  private async toPdf(
    photo: Blob,
    layout: ReturnType<typeof sheetLayout>,
  ): Promise<Blob> {
    const { PDFDocument, rgb } = await import('pdf-lib');

    const doc = await PDFDocument.create();
    const page = doc.addPage([
      layout.sheet.widthMm * POINTS_PER_MM,
      layout.sheet.heightMm * POINTS_PER_MM,
    ]);

    const embedded = await doc.embedJpg(await photo.arrayBuffer());
    const w = layout.photo.widthMm * POINTS_PER_MM;
    const h = layout.photo.heightMm * POINTS_PER_MM;
    const guide = rgb(GUIDE_GRAY, GUIDE_GRAY, GUIDE_GRAY);

    for (const cell of cellPositions(layout)) {
      const x = cell.xMm * POINTS_PER_MM;
      // O PDF conta o Y de BAIXO para cima e a grade é montada de cima para
      // baixo. Sem esta inversão a folha sai espelhada na vertical, o que num
      // retrato passa despercebido até alguém comparar com o original.
      const y = (layout.sheet.heightMm - cell.yMm - layout.photo.heightMm) * POINTS_PER_MM;

      page.drawImage(embedded, { x, y, width: w, height: h });

      if (layout.count > 1) {
        page.drawRectangle({
          x,
          y,
          width: w,
          height: h,
          borderColor: guide,
          borderWidth: GUIDE_MM * POINTS_PER_MM,
        });
      }
    }

    const bytes = await doc.save({ useObjectStreams: true });
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
  }

  private async toJpeg(
    photo: Blob,
    layout: ReturnType<typeof sheetLayout>,
  ): Promise<Blob> {
    const url = URL.createObjectURL(photo);

    try {
      const image = await loadImage(url);

      const canvas = document.createElement('canvas');
      canvas.width = mmToPx(layout.sheet.widthMm, PRINT_DPI);
      canvas.height = mmToPx(layout.sheet.heightMm, PRINT_DPI);

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new AppError('encode_failed');

      // Fundo branco explícito: um canvas sem alfa começa PRETO, e uma folha de
      // fotos com fundo preto é papel fotográfico gasto à toa.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const w = mmToPx(layout.photo.widthMm, PRINT_DPI);
      const h = mmToPx(layout.photo.heightMm, PRINT_DPI);
      const gray = Math.round(GUIDE_GRAY * 255);

      ctx.strokeStyle = `rgb(${gray}, ${gray}, ${gray})`;
      ctx.lineWidth = Math.max(1, mmToPx(GUIDE_MM, PRINT_DPI));

      for (const cell of cellPositions(layout)) {
        const x = mmToPx(cell.xMm, PRINT_DPI);
        const y = mmToPx(cell.yMm, PRINT_DPI);

        ctx.drawImage(image, x, y, w, h);
        if (layout.count > 1) ctx.strokeRect(x, y, w, h);
      }

      return await canvasToBlob(canvas, 'image/jpeg', 0.92);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
