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
interface TextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

function parseFormattedLine(lineHtml: string, baseBold: boolean, baseItalic: boolean): TextSegment[] {
  if (!/<[a-z][\s\S]*>/i.test(lineHtml)) {
    const text = lineHtml.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return [{ text, bold: baseBold, italic: baseItalic }];
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
          // Usa edit.baseFontSize quando disponível (valor medido/calculado e
          // armazenado no seed), senão cai no baseFontSize() como fallback.
          // Garante que o export saia com o mesmo tamanho que aparece no overlay.
          const computedSize = edit.baseFontSize != null
            ? edit.baseFontSize * height
            : baseFontSize(edit, height, width);
          const fontSize = Math.max(6, Math.round(computedSize * (edit.fontScale || 1.0)));
          // Seleciona a fonte correta; Symbol cai em Helvetica (pdf-lib não tem Symbol embutida).
          const fontConfig = baseFonts[edit.fontFamily || 'Helvetica'] ?? baseFonts['Helvetica'];

          // Parse hex color (default black)
          let hex = (edit.color || '#000000').replace('#', '');
          if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;
          const scaledH = edit.h * (edit.fontScale || 1.0);

          const rawLines = edit.newText.replace(/<br\s*\/?>/gi, '\n').replace(/<\/div>\s*<div>/gi, '\n').split('\n');
          const lineCount = rawLines.length;
          // Passo entre baselines: usa o passo real medido na origem quando existe.
          // `h / lineCount` é o passo médio contando a caixa da última linha, então
          // subestima em ~1/n e faz o bloco encolher para cima linha a linha — o
          // mesmo erro que o overlay tinha.
          const lineSpacing = lineCount > 1
            ? (edit.lineHeight != null
                ? edit.lineHeight * height * (edit.fontScale || 1.0)
                : (scaledH * height) / lineCount)
            : fontSize * 1.2;

          const fontFor = (seg: TextSegment) => {
            if (seg.bold && seg.italic) return fontConfig.boldItalic;
            if (seg.bold) return fontConfig.bold;
            if (seg.italic) return fontConfig.italic;
            return fontConfig.normal;
          };

          const boxWidth = edit.w * width;

          for (let l = 0; l < rawLines.length; l++) {
            const lineStr = rawLines[l];
            const segments = parseFormattedLine(lineStr, edit.bold ?? false, edit.italic ?? false);

            let totalLineWidth = 0;
            for (const seg of segments) {
              totalLineWidth += fontFor(seg).widthOfTextAtSize(seg.text, fontSize);
            }

            let startX = edit.x * width;
            if (edit.textAlign === 'center') {
              startX += Math.max(0, (boxWidth - totalLineWidth) / 2);
            } else if (edit.textAlign === 'right') {
              startX += Math.max(0, boxWidth - totalLineWidth);
            }

            const baseLineY = height - (edit.y + scaledH) * height + (scaledH * height * 0.25);
            const lineY = lineCount > 1
              ? height - (edit.y * height) - (l * lineSpacing) - fontSize
              : baseLineY;

            // ── Justificado ──────────────────────────────────────────────
            // A última linha de um parágrafo nunca é esticada — é o que
            // distingue justificação de "linha esticada à força", e é o padrão
            // tipográfico que todo leitor reconhece sem saber nomear.
            const isLastLine = l === rawLines.length - 1;
            if (edit.textAlign === 'justify' && !isLastLine) {
              const words: { text: string; font: (typeof fontConfig)['normal'] }[] = [];
              for (const seg of segments) {
                const f = fontFor(seg);
                for (const w of seg.text.split(/\s+/)) {
                  if (w) words.push({ text: w, font: f });
                }
              }

              if (words.length > 1) {
                const wordsWidth = words.reduce(
                  (sum, w) => sum + w.font.widthOfTextAtSize(w.text, fontSize),
                  0,
                );
                const gapWidth = (boxWidth - wordsWidth) / (words.length - 1);
                const naturalSpace = fontConfig.normal.widthOfTextAtSize(' ', fontSize);

                // Só justifica quando a linha realmente enche a medida. Uma
                // linha curta demais renderia espaços enormes entre poucas
                // palavras — pior do que deixá-la alinhada à esquerda.
                if (gapWidth > 0 && gapWidth < naturalSpace * 4) {
                  let x = edit.x * width;
                  for (const w of words) {
                    page.drawText(w.text, { x, y: lineY, size: fontSize, font: w.font, color: rgb(r, g, b) });
                    x += w.font.widthOfTextAtSize(w.text, fontSize) + gapWidth;
                  }
                  continue;
                }
              }
            }

            let currentX = startX;
            for (const seg of segments) {
              const f = fontFor(seg);
              page.drawText(seg.text, {
                x: currentX,
                y: lineY,
                size: fontSize,
                font: f,
                color: rgb(r, g, b),
              });
              currentX += f.widthOfTextAtSize(seg.text, fontSize);
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
