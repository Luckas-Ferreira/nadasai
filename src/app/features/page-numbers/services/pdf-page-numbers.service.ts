import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';

/** Onde o número fica na folha. */
export type NumberPosition =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'
  | 'top-left';

/** O que aparece escrito. */
export type NumberFormat = 'plain' | 'of-total' | 'page-n' | 'dash';

export interface PageNumberOptions {
  readonly file: File;
  readonly position: NumberPosition;
  readonly format: NumberFormat;
  /** Rótulo de "Página"/"de", já resolvido pelo idioma da interface. */
  readonly labels: { readonly page: string; readonly of: string };
  readonly fontSize: number;
  /** Número impresso na PRIMEIRA página numerada. */
  readonly startAt: number;
  /** Quantas páginas do começo ficam sem número (capa, folha de rosto). */
  readonly skipFirst: number;
  readonly onProgress?: (percent: number) => void;
}

export interface PageNumberResult {
  readonly blob: Blob;
  readonly numbered: number;
}

const MARGIN_PT = 28;

/**
 * Numerar páginas com pdf-lib.
 *
 * É a mais simples das ferramentas de PDF e mesmo assim tem três decisões que
 * não são óbvias, todas sobre o que o usuário quer dizer com "numerar":
 *
 *   1. **`skipFirst` e `startAt` são coisas diferentes.** Pular a capa e começar
 *      a contar do 1 é o caso comum (a capa não é a página 1); pular a capa e
 *      começar do 2 é o outro caso legítimo (a capa É a página 1, só não leva
 *      número impresso). Um controle só não expressa os dois, então há dois.
 *   2. **O total de `of-total` conta as páginas NUMERADAS**, não as do arquivo.
 *      Num documento de 11 folhas com a capa pulada, "1 de 10" é o certo — dizer
 *      "1 de 11" numa página rotulada 1 é aritmética que não fecha na mão de
 *      quem lê.
 *   3. **Nada é rasterizado.** O texto vetorial da página continua vetorial e
 *      pesquisável; o número entra como mais um comando de texto no content
 *      stream. É a diferença entre esta ferramenta e comprimir/proteger, que
 *      precisam re-rasterizar.
 */
@Injectable({ providedIn: 'root' })
export class PdfPageNumbersService {
  async addNumbers(options: PageNumberOptions): Promise<PageNumberResult> {
    const { file, onProgress } = options;

    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    // `ignoreEncryption` pelo mesmo motivo das ferramentas irmãs: o pdf-lib não
    // decifra, e quem já abriu o arquivo com senha foi o pdf.js antes daqui.
    const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });

    const pages = pdfDoc.getPages();
    if (pages.length === 0) throw new AppError('pdf_no_pages');

    const skip = Math.max(0, Math.min(options.skipFirst, pages.length));
    const numbered = pages.length - skip;
    if (numbered <= 0) throw new AppError('pdf_no_pages');

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const black = rgb(0, 0, 0);

    for (let i = skip; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();

      const shown = options.startAt + (i - skip);
      const text = label(shown, numbered, options.format, options.labels);

      const textWidth = font.widthOfTextAtSize(text, options.fontSize);
      const { x, y } = place(options.position, width, height, textWidth, options.fontSize);

      page.drawText(text, { x, y, size: options.fontSize, font, color: black });

      onProgress?.(Math.round(((i - skip + 1) / numbered) * 100));
    }

    const bytes = await pdfDoc.save();
    return {
      blob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
      numbered,
    };
  }
}

function label(
  shown: number,
  total: number,
  format: NumberFormat,
  labels: { page: string; of: string },
): string {
  switch (format) {
    case 'plain':
      return String(shown);
    case 'of-total':
      return `${shown} ${labels.of} ${total}`;
    case 'page-n':
      return `${labels.page} ${shown}`;
    case 'dash':
      return `— ${shown} —`;
  }
}

/**
 * O `y` de baixo é a margem; o de cima desconta a altura da fonte, senão a
 * caixa do texto encosta na borda superior e a parte de cima das letras some no
 * corte da impressora.
 */
function place(
  position: NumberPosition,
  pageWidth: number,
  pageHeight: number,
  textWidth: number,
  fontSize: number,
): { x: number; y: number } {
  const top = position.startsWith('top');
  const y = top ? pageHeight - MARGIN_PT - fontSize : MARGIN_PT;

  if (position.endsWith('left')) return { x: MARGIN_PT, y };
  if (position.endsWith('right')) return { x: pageWidth - MARGIN_PT - textWidth, y };
  return { x: (pageWidth - textWidth) / 2, y };
}
