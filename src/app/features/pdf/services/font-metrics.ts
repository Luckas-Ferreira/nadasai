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
  block: { fontSize?: number; h: number; w?: number; originalText?: string | null; lineHeight?: number; bold?: boolean },
  pageHeight: number,
  pageWidth?: number
): number {
  // Se o bloco foi gerado com um lineHeight (fração da altura total), a altura
  // física de 1 linha é exatamente essa fração * pageHeight.
  // Caso falte (ex: blocos da persistência antiga), estimamos.
  let singleLineHPx = (block.lineHeight ?? (block.h / Math.max(1, block.originalText?.split('\n').length ?? 1))) * pageHeight;
  
  // Se a altura da linha representa quase a caixa toda (>80%), o bloco tem só 1 linha.
  const isSingleLine = block.h > 0 && block.lineHeight && block.lineHeight > block.h * 0.8;
  
  if (pageWidth !== undefined && block.w !== undefined && block.originalText && (isSingleLine || (!block.lineHeight && block.originalText.split('\n').length === 1))) {
    const availW = block.w * pageWidth;
    return Math.min(singleLineHPx * 0.85, fitFontSizeToWidth(block.originalText, availW, singleLineHPx * 0.85, !!block.bold));
  }
  
  // Para parágrafos multilinha, usar fitFontSizeToWidth não funciona bem porque o
  // comprimento original do string contínuo (sem \n) esgarça a escala da fonte para
  // preencher toda a caixa numa única iteração, gerando fontes muito maiores que a linha.
  return singleLineHPx * 0.72;
}

/**
 * Para blocos de texto NATIVO (PDF digital): mede o texto real no browser
 * usando CanvasRenderingContext2D.measureText() e busca por bissecção o
 * fontSize (em px de página) que faz o texto caber exatamente na largura
 * disponível do bloco.
 *
 * Isso elimina o erro de métricas entre a fonte original do PDF e
 * Helvetica/Arial do browser — não importa o quão diferente for o kerning ou
 * o tracking da fonte embarcada, o resultado visual ficará dentro de ~1–2% da
 * largura real do bloco.
 *
 * Por que bissecção e não cálculo direto? measureText retorna a largura para
 * um dado fontSize, mas a relação é linear em fontes bem comportadas. Duas
 * medições bastam para interpolar; a bissecção é usada como sanidade para
 * fontes que fogem do linear (ex: ligaduras, features OpenType).
 *
 * @param text           Texto a medir
 * @param availWidthPx   Largura disponível em px de página (b.w * pageWidth)
 * @param hintSizePx     Estimativa inicial do fontSize em px (b.h * pageHeight)
 * @param bold           Se o texto é negrito
 * @param fontFamily     Família de fonte usada no overlay
 * @returns              fontSize em px de página que ajusta o texto à largura
 */
export function fitFontSizeToWidth(
  text: string,
  availWidthPx: number,
  hintSizePx: number,
  bold = false,
  fontFamily = 'Helvetica, Arial Narrow, sans-serif'
): number {
  // Texto muito curto ou vazio: retornar a estimativa original sem medir.
  if (!text || text.length < 2 || availWidthPx <= 0) return hintSizePx;

  // Canvas de medição reutilizável (não adicionado ao DOM).
  const ctx = _getMeasureCtx();

  const weight = bold ? 'bold' : 'normal';

  // Medição rápida no tamanho hint para checar se já está certo.
  ctx.font = `${weight} ${hintSizePx}px ${fontFamily}`;
  const widthAtHint = ctx.measureText(text).width;

  // Se a diferença for < 5%, aceita sem ajuste — evita instabilidade.
  if (Math.abs(widthAtHint - availWidthPx) / availWidthPx < 0.05) {
    return hintSizePx;
  }

  // Caso simples: relação é linear → escala direta.
  // fontAtTarget / hintSize = availWidthPx / widthAtHint
  const directScale = availWidthPx / widthAtHint;
  const candidate = hintSizePx * directScale;

  // Verificar se o candidato linear está correto (tolerância 3%).
  ctx.font = `${weight} ${candidate}px ${fontFamily}`;
  const widthAtCandidate = ctx.measureText(text).width;
  if (Math.abs(widthAtCandidate - availWidthPx) / availWidthPx < 0.03) {
    return Math.max(4, candidate);
  }

  // Refinamento por bissecção em até 6 iterações (muito raro ser necessário).
  let lo = Math.max(4, candidate * 0.7);
  let hi = candidate * 1.4;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    ctx.font = `${weight} ${mid}px ${fontFamily}`;
    const w = ctx.measureText(text).width;
    if (w < availWidthPx) lo = mid;
    else hi = mid;
  }

  return Math.max(4, (lo + hi) / 2);
}

/** Canvas singleton de medição — criado uma vez, nunca adicionado ao DOM. */
let _measureCanvas: HTMLCanvasElement | null = null;
let _measureCtx: CanvasRenderingContext2D | null = null;

function _getMeasureCtx(): CanvasRenderingContext2D {
  if (_measureCtx) return _measureCtx;
  _measureCanvas = document.createElement('canvas');
  _measureCtx = _measureCanvas.getContext('2d')!;
  return _measureCtx;
}
