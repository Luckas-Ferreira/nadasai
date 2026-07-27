import { Injectable } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// Type-only: o pdf-lib continua sendo importado dinamicamente, para não entrar
// no bundle de quem só veio ler um PDF.
import type { PDFFont } from 'pdf-lib';
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
interface TextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** Palavra já medida, na fonte em que será desenhada. */
interface Word {
  text: string;
  font: PDFFont;
  width: number;
}

function parseFormattedLine(lineHtml: string, baseBold: boolean, baseItalic: boolean): TextSegment[] {
  // Qualquer '<' ou '&' vai para o DOMParser, que lida com marcação
  // desbalanceada sem reclamar.
  //
  // O teste era `/<[a-z]/`, que só reconhece tag de ABERTURA. Ao fatiar o
  // conteúdo do contenteditable em linhas, a última fica com o `</div>` de
  // fechamento pendurado e nenhuma abertura — caía no ramo de texto puro e o
  // `</div>` era desenhado, literalmente, no fim do parágrafo exportado.
  if (!/[<&]/.test(lineHtml)) {
    return [{ text: lineHtml, bold: baseBold, italic: baseItalic }];
  }

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<body>${lineHtml}</body>`, 'text/html');
      const segments: TextSegment[] = [];

      function traverse(node: Node, isBold: boolean, isItalic: boolean) {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent?.replace(/&nbsp;/g, ' ') || '';
          if (t) {
            segments.push({ text: t, bold: isBold, italic: isItalic });
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tag = el.tagName.toLowerCase();
          const nextBold = isBold || tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight || '0') >= 600;
          const nextItalic = isItalic || tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic';

          for (const child of Array.from(el.childNodes)) {
            traverse(child, nextBold, nextItalic);
          }
        }
      }

      traverse(doc.body, baseBold, baseItalic);
      if (segments.length > 0) return segments;
    } catch {
      // Fallback
    }
  }

  const plainText = lineHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
  return [{ text: plainText, bold: baseBold, italic: baseItalic }];
}

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
      // Symbol não existe no pdf-lib como fonte padrão — usa Helvetica como fallback.
      Symbol: {
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
          // `edit.baseFontSize` JÁ vem em px da página — o seed o calcula como
          // uma fração da altura da página multiplicada pela altura da página, e
          // numa página de PDF 1 px de usuário é 1 pt. Multiplicar por `height`
          // aqui era multiplicar pela altura da página uma segunda vez: um corpo
          // de 9pt virava ~6441pt, e a linha de base ia parar a milhares de
          // pontos abaixo do papel. O bloco editado saía do export como um
          // retângulo branco, porque o retângulo de cobertura era desenhado e o
          // texto caía fora da página.
          //
          // O fallback `baseFontSize()` sempre devolveu px da página; era só
          // este caminho que convertia a mais.
          const computedSize = edit.baseFontSize ?? baseFontSize(edit, height, width);
          const fontSize = Math.max(6, Math.round(computedSize * (edit.fontScale || 1.0)));
          // Seleciona a fonte correta; Symbol cai em Helvetica (pdf-lib não tem Symbol embutida).
          const fontConfig = baseFonts[edit.fontFamily || 'Helvetica'] ?? baseFonts['Helvetica'];

          // Parse hex color (default black)
          let hex = (edit.color || '#000000').replace('#', '');
          if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;
          const fontFor = (seg: TextSegment) => {
            if (seg.bold && seg.italic) return fontConfig.boldItalic;
            if (seg.bold) return fontConfig.bold;
            if (seg.italic) return fontConfig.italic;
            return fontConfig.normal;
          };

          const boxWidth = edit.w * width;
          const spaceWidth = fontConfig.normal.widthOfTextAtSize(' ', fontSize);

          // Quebras rígidas do conteúdo editável. O contenteditable produz <div>
          // por linha ou <br>, conforme o navegador.
          const rawLines = edit.newText
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/div>\s*<div>/gi, '\n')
            .split('\n');

          // ── Quebra de linha ──────────────────────────────────────────────
          // O overlay quebra o texto dentro da caixa; o export desenhava cada
          // linha rígida inteira, sem quebrar. Bastava digitar no meio de um
          // parágrafo para a linha correspondente crescer e sair pela borda da
          // página no arquivo final, enquanto na tela ela parecia certa. Aqui as
          // linhas rígidas viram linhas visuais, do mesmo jeito.
          const visualLines: Word[][] = [];
          for (const lineHtml of rawLines) {
            const words: Word[] = [];
            for (const seg of parseFormattedLine(lineHtml, edit.bold ?? false, edit.italic ?? false)) {
              const f = fontFor(seg);
              for (const token of seg.text.split(/\s+/)) {
                if (token) words.push({ text: token, font: f, width: f.widthOfTextAtSize(token, fontSize) });
              }
            }

            if (words.length === 0) {
              visualLines.push([]);
              continue;
            }

            let current: Word[] = [];
            let currentWidth = 0;
            for (const word of words) {
              const advance = current.length ? spaceWidth + word.width : word.width;
              if (current.length && currentWidth + advance > boxWidth) {
                visualLines.push(current);
                current = [word];
                currentWidth = word.width;
              } else {
                current.push(word);
                currentWidth += advance;
              }
            }
            visualLines.push(current);
          }

          // Passo entre baselines: o passo real medido na origem quando existe.
          // `h / lineCount` é o passo médio contando a caixa da última linha,
          // então subestima em ~1/n e faz o bloco encolher para cima linha a
          // linha — o mesmo erro que o overlay tinha.
          const lineSpacing = edit.lineHeight != null
            ? edit.lineHeight * height * (edit.fontScale || 1.0)
            : fontSize * 1.2;

          // `edit.y` é o topo do glifo da primeira linha, na mesma convenção do
          // loader. Um só modelo para uma ou muitas linhas: o ramo separado que
          // existia para bloco de uma linha posicionava pelo rodapé da caixa, e
          // divergia assim que a caixa crescia ao se digitar.
          const boxTop = height - edit.y * height;

          for (let l = 0; l < visualLines.length; l++) {
            const words = visualLines[l];
            if (words.length === 0) continue;

            const lineY = boxTop - l * lineSpacing - fontSize;
            const wordsWidth = words.reduce((sum, w) => sum + w.width, 0);
            const naturalWidth = wordsWidth + (words.length - 1) * spaceWidth;

            let gap = spaceWidth;
            let startX = edit.x * width;

            // A última linha de um parágrafo nunca é esticada — é o que
            // distingue justificação de "linha esticada à força", e é o padrão
            // tipográfico que todo leitor reconhece sem saber nomear.
            const isLastLine = l === visualLines.length - 1;

            if (edit.textAlign === 'justify' && !isLastLine && words.length > 1) {
              const stretched = (boxWidth - wordsWidth) / (words.length - 1);
              // Só justifica quando a linha realmente enche a medida. Uma linha
              // curta demais renderia vãos enormes entre poucas palavras — pior
              // do que deixá-la alinhada à esquerda.
              if (stretched > 0 && stretched < spaceWidth * 4) gap = stretched;
            } else if (edit.textAlign === 'center') {
              startX += Math.max(0, (boxWidth - naturalWidth) / 2);
            } else if (edit.textAlign === 'right') {
              startX += Math.max(0, boxWidth - naturalWidth);
            }

            let x = startX;
            for (const word of words) {
              page.drawText(word.text, {
                x,
                y: lineY,
                size: fontSize,
                font: word.font,
                color: rgb(r, g, b),
              });
              x += word.width + gap;
            }
          }
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
