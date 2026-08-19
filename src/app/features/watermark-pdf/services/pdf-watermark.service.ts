import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';
import { encodeImage } from '../../../core/image/converters';
import {
  rotatePoint,
  textBlock,
  watermarkPlacements,
  type MarkSize,
  type WatermarkLayout,
  type WatermarkPosition,
} from '../../../core/pdf/watermark-layout';

/**
 * A marca: um texto de uma ou mais linhas, ou uma imagem.
 *
 * As duas são o MESMO trabalho depois de medidas — uma caixa de tamanho conhecido
 * repetida nos pontos que `watermarkPlacements` devolve. É por isso que o
 * posicionamento não sabe distinguir texto de logo, e por isso um logo lado a
 * lado na diagonal saiu de graça quando o texto passou a sair certo.
 */
export type WatermarkMark =
  | {
      readonly kind: 'text';
      /** Uma linha por quebra: é assim que se põem vários nomes numa marca só. */
      readonly text: string;
      readonly fontSize: number;
      readonly colorHex: string;
      readonly bold: boolean;
    }
  | {
      readonly kind: 'image';
      readonly file: File;
      /** Largura da marca em % da largura da página. */
      readonly widthPercent: number;
    };

export interface WatermarkPdfOptions {
  readonly file: File;
  readonly password?: string;
  readonly mark: WatermarkMark;
  readonly layout: WatermarkLayout;
  readonly position: WatermarkPosition;
  readonly opacity: number;
  readonly rotationDegrees: number;
  readonly gapPercent: number;
  readonly onProgress?: (percent: number) => void;
}

export interface WatermarkResult {
  readonly blob: Blob;
  readonly marksPerPage: number;
  /** A densidade pedida passou do teto e o passo foi aberto. O painel avisa. */
  readonly spacingClamped: boolean;
}

/** Margem da folha quando a marca vai para um canto. */
const MARGIN_PT = 28;

@Injectable({ providedIn: 'root' })
export class PdfWatermarkService {
  async applyWatermark(options: WatermarkPdfOptions): Promise<WatermarkResult> {
    const { file, mark, onProgress } = options;

    const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
    // `ignoreEncryption` e não a senha: o pdf-lib não decifra. A senha existe nas
    // opções porque a cadeia a carrega e as ferramentas irmãs a aceitam do mesmo
    // jeito — quem a usa de verdade é o `openPdf` do pdf.js, que abriu o arquivo
    // antes de chegar aqui.
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });

    const pages = pdfDoc.getPages();
    if (pages.length === 0) throw new AppError('pdf_no_pages');

    // A imagem é embutida UMA vez e desenhada muitas. Embutir por página (ou pior,
    // por marca) copia os bytes do logo a cada uso: um PNG de 200 KB lado a lado
    // em dez páginas viraria dezenas de megabytes de arquivo.
    const font =
      mark.kind === 'text'
        ? await pdfDoc.embedFont(mark.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica)
        : null;
    const image = mark.kind === 'image' ? await embedMarkImage(pdfDoc, mark.file) : null;

    const lines = mark.kind === 'text' ? textLines(mark.text) : [];
    if (mark.kind === 'text' && lines.length === 0) throw new AppError('pdf_export_failed');

    const colour = mark.kind === 'text' ? hexToRgb(mark.colorHex) : { r: 0, g: 0, b: 0 };

    let marksPerPage = 0;
    let spacingClamped = false;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();

      const block =
        mark.kind === 'text' && font
          ? textBlock(
              lines.map((line) => font.widthOfTextAtSize(line, mark.fontSize)),
              mark.fontSize,
            )
          : null;

      const size: MarkSize =
        block?.size ??
        imageMarkSize(image!.width, image!.height, width, (mark as { widthPercent: number }).widthPercent);

      const layout = watermarkPlacements({
        pageWidth: width,
        pageHeight: height,
        mark: size,
        layout: options.layout,
        position: options.position,
        rotationDegrees: options.rotationDegrees,
        gapPercent: options.gapPercent,
        marginPt: MARGIN_PT,
      });

      marksPerPage = layout.placements.length;
      spacingClamped = spacingClamped || layout.spacingClamped;

      for (const origin of layout.placements) {
        if (mark.kind === 'text' && font && block) {
          for (let l = 0; l < lines.length; l++) {
            const at = rotatePoint(origin, block.lines[l], options.rotationDegrees);
            page.drawText(lines[l], {
              x: at.x,
              y: at.y,
              size: mark.fontSize,
              font,
              color: rgb(colour.r, colour.g, colour.b),
              opacity: options.opacity,
              rotate: degrees(options.rotationDegrees),
            });
          }
        } else if (image) {
          page.drawImage(image, {
            x: origin.x,
            y: origin.y,
            width: size.width,
            height: size.height,
            opacity: options.opacity,
            rotate: degrees(options.rotationDegrees),
          });
        }
      }

      onProgress?.(Math.round(((i + 1) / pages.length) * 100));
    }

    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    return {
      blob: new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }),
      marksPerPage,
      spacingClamped,
    };
  }
}

/** Linhas não vazias, na ordem digitada. Uma linha em branco no meio não vira marca. */
function textLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * O pdf-lib só embute PNG e JPEG, e é só isso que ele vai embutir.
 *
 * Qualquer outra coisa que o navegador saiba decodificar — WebP, GIF, BMP, AVIF —
 * passa pelo `encodeImage` do módulo de imagem e vira PNG aqui mesmo, no
 * navegador. Recusar esses formatos seria mandar a pessoa converter o logo em
 * outra ferramenta do próprio site antes de voltar; e um PNG preserva o canal
 * alfa, que é o que faz um logo recortado não vir com um retângulo branco atrás.
 */
async function embedMarkImage(
  pdfDoc: Awaited<ReturnType<typeof import('pdf-lib').PDFDocument.load>>,
  file: File,
) {
  const type = file.type.toLowerCase();

  if (type === 'image/jpeg' || type === 'image/jpg') {
    return pdfDoc.embedJpg(await file.arrayBuffer());
  }
  if (type === 'image/png') {
    return pdfDoc.embedPng(await file.arrayBuffer());
  }

  try {
    const png = await encodeImage(file, 'png');
    return pdfDoc.embedPng(await png.arrayBuffer());
  } catch (err) {
    throw new AppError('unsupported_file', err);
  }
}

/** O logo escala pela LARGURA da página e mantém a proporção. */
function imageMarkSize(
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  widthPercent: number,
): MarkSize {
  const width = (pageWidth * widthPercent) / 100;
  return { width, height: (width * imageHeight) / imageWidth };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.replace(/./g, (c) => c + c) : clean;

  return {
    r: (parseInt(value.slice(0, 2), 16) || 0) / 255,
    g: (parseInt(value.slice(2, 4), 16) || 0) / 255,
    b: (parseInt(value.slice(4, 6), 16) || 0) / 255,
  };
}
