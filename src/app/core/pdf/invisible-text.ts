import type { PDFFont, PDFPage } from 'pdf-lib';

/**
 * A CAMADA DE TEXTO INVISÍVEL, e por que ela é uma só.
 *
 * Três ferramentas rasterizam uma página de PDF e montam outra em cima do
 * raster — comprimir (nos níveis com perda), desbloquear, e o exportador do
 * editor quando o documento veio de OCR. Nas três, o que se perde ao rasterizar
 * não é só a nitidez: é o Ctrl+F. Redesenhar o texto da página com opacidade
 * zero por cima da imagem devolve a busca e a seleção, e custa alguns bytes.
 *
 * Isto vivia dentro do compressor, e o desbloquear ia nascer com uma segunda
 * cópia — junto com uma segunda oportunidade de as duas discordarem sobre o
 * que fazer com um caractere fora da WinAnsi. Uma implementação, dois
 * consumidores, como o `reencode.ts` do vídeo.
 */

/**
 * Redesenha o texto da página com opacidade zero sobre o raster.
 *
 * O pdf.js entrega o `transform` de cada item já em espaço de PDF, que é o
 * mesmo espaço em que o pdf-lib desenha — mesma origem (canto inferior
 * esquerdo), mesmas unidades —, então a posição não precisa de conversão.
 * `transform[5]` é a linha de base, que é exatamente o que o `y` do `drawText`
 * significa.
 */
export function drawInvisibleText(
  page: PDFPage,
  items: readonly unknown[],
  pageHeight: number,
  font: PDFFont,
): void {
  for (const item of items) {
    const entry = item as { str?: string; transform?: number[]; height?: number };
    const text = entry.str;
    const transform = entry.transform;
    if (!text?.trim() || !transform) continue;

    const clean = sanitizeWinAnsi(text);
    if (!clean) continue;

    const size = Math.max(1, Math.abs(entry.height || transform[3] || 8));
    const y = transform[5];
    // Texto que caiu fora da página (o pdf.js relata também o que foi cortado)
    // seria invisível de qualquer forma; pular deixa o arquivo menor.
    if (y < -size || y > pageHeight + size) continue;

    /**
     * Protegido item a item, de propósito. A `StandardFonts.Helvetica` só
     * codifica WinAnsi e o pdf-lib LANÇA em qualquer coisa fora dela — o
     * `sanitizeWinAnsi` resolve os caracteres que sabe nomear, mas um glifo
     * exótico não pode custar o documento inteiro. A camada invisível é um
     * bônus; entregar o arquivo é o trabalho.
     */
    try {
      page.drawText(clean, { x: transform[4], y, size, font, opacity: 0 });
    } catch {
      // Pula este trecho e segue.
    }
  }
}

/**
 * Mapeia o texto para o que a WinAnsi (cp1252) consegue de fato codificar.
 *
 * Os culpados comuns em documento de verdade são a pontuação tipográfica que o
 * Word e o InDesign inserem — aspas curvas, travessões, reticências —, que têm
 * equivalente em WinAnsi e vale manter legíveis numa busca. Qualquer outra
 * coisa fora do Latin-1 vira espaço, o que preserva a fronteira entre palavras
 * para o Ctrl+F em vez de colar os tokens.
 */
export function sanitizeWinAnsi(text: string): string {
  const folded = text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ');

  let out = '';
  for (const char of folded) {
    const code = char.codePointAt(0) ?? 0;
    // Latin-1 imprimível mais tabulação; o resto ou lançaria na codificação ou
    // sairia como caractere de controle.
    out += (code >= 0x20 && code <= 0xff) || code === 0x09 ? char : ' ';
  }

  return out.trim();
}
