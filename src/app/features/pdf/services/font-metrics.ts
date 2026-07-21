/**
 * Corpo da fonte de um bloco, em px da página (não em px de tela — quem
 * multiplica por scale() é o template do editor).
 *
 * Mora aqui, e não em pdf.component, porque o exporter também precisa dela e o
 * componente já importa o exporter: um `import` de valor no sentido contrário
 * fecharia o ciclo. O parâmetro é estrutural pelo mesmo motivo — não depende do
 * TextEdit nem do OcrBlock, só do que os dois têm em comum.
 *
 * Fonte única para a tela e para o export. O exporter recalculava isto por
 * conta própria e divergia em dois pontos: ignorava `fontSize` (bloco de OCR
 * saía do export com tamanho diferente do que aparecia na tela) e repetia o
 * multiplicador do texto nativo descrito abaixo.
 *
 * OCR: o bloco já vem com o corpo estimado e cortado contra a mediana da página
 * (ver assignFontSizes em ocr.service.ts). Chutar de novo aqui, palavra a
 * palavra, era o que fazia um token de 1-2 caracteres renderizar 3x maior.
 *
 * TEXTO NATIVO: `h` sai de `item.height` do pdf.js, que vem da matriz de texto
 * — é o corpo da fonte, igual para toda a linha, e NÃO depende dos glifos que a
 * palavra por acaso tem. Aqui havia um multiplicador de 1.06–1.92 escolhido por
 * ascendente/descendente, copiado da heurística do OCR. No OCR ele é necessário
 * (lá `h` é a caixa dos glifos desenhados, então "arme" mede menos que "Data");
 * no texto nativo ele é aplicado sobre um valor que já está certo, e o resultado
 * é texto 38% a 92% maior que o original — era isso que aparecia ao clicar num
 * bloco e o texto saltar de tamanho. Sem multiplicador: `h` é o valor.
 */
export function baseFontSize(
  block: { fontSize?: number; h: number; w?: number; originalText?: string | null },
  pageHeight: number,
  pageWidth?: number
): number {
  const baseSize = (block.fontSize ?? block.h) * pageHeight;

  // Cap the font size to prevent horizontal overflow.
  // Helvetica's average character width is around 0.55 of the font size.
  // We use a 0.48 multiplier to prevent extreme shrinking which makes the text look unnaturally tiny compared to its bounding box.
  if (pageWidth !== undefined && block.w !== undefined && block.originalText != null) {
    const textLength = Math.max(1, block.originalText.length);
    const maxAvailableWidthPx = block.w * pageWidth;
    const maxFontSize = maxAvailableWidthPx / (textLength * 0.48);
    return Math.min(baseSize, maxFontSize);
  }

  return baseSize;
}
