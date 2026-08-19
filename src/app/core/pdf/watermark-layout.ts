/**
 * Onde cada marca d'água é desenhada — em coordenadas de PDF, e só aritmética.
 *
 * Isto mora em `core/` e é puro pelo mesmo motivo que `core/audio/`: o serviço
 * escreve no PDF e o componente pinta a prévia num canvas, e as duas precisam
 * concordar. Enquanto a prévia era uma aproximação em CSS (um `<span>` girado no
 * meio da página, `uppercase`, `tracking-widest`, `fontSize * 0.75`), ela não
 * mostrava nem o número de marcas nem a posição nem o tamanho reais — era um
 * enfeite que dizia "confidencial" e escondia o resultado até o download.
 *
 * O sistema de coordenadas é o do PDF: origem no canto INFERIOR esquerdo, y para
 * cima, ângulo em graus no sentido anti-horário. Quem desenha num canvas inverte
 * o y na saída; ninguém inverte no meio da conta.
 */

export type WatermarkLayout = 'single' | 'tiled';

export type WatermarkPosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** O tamanho da marca sem rotação: a caixa do texto ou da imagem. */
export interface MarkSize {
  readonly width: number;
  readonly height: number;
}

export interface LayoutRequest {
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly mark: MarkSize;
  readonly layout: WatermarkLayout;
  /** Só vale em `single`: lado a lado a página inteira é coberta. */
  readonly position: WatermarkPosition;
  readonly rotationDegrees: number;
  /** Espaço entre marcas, em % do tamanho da própria marca. */
  readonly gapPercent: number;
  readonly marginPt: number;
}

/**
 * O ponto que o `drawText`/`drawImage` do pdf-lib recebe.
 *
 * É o canto inferior esquerdo da marca ANTES de girar, porque é em torno dele
 * que o pdf-lib gira. Não é o centro, e essa diferença é o bug que esta função
 * existe para não repetir: a versão anterior centralizava a caixa sem rotação e
 * mandava girar, então qualquer ângulo diferente de zero jogava o texto para
 * fora do lugar — a 45° numa A4 ele saía a mais de 100pt do centro.
 */
export interface Placement {
  readonly x: number;
  readonly y: number;
}

export interface LayoutResult {
  readonly placements: readonly Placement[];
  /**
   * Verdadeiro quando a densidade pedida passou do teto e o passo foi aberto.
   * O painel diz que isso aconteceu, em vez de aplicar um espaçamento diferente
   * do que o controle mostra — mesma regra do crossfade em juntar-áudio.
   */
  readonly spacingClamped: boolean;
}

/**
 * Teto de marcas por página.
 *
 * Não é gosto: cada marca é um comando no content stream da página. Um texto de
 * 8pt lado a lado numa A4 passa de mil por página, o que engorda o arquivo e faz
 * o pdf-lib demorar visivelmente num documento de trinta páginas — para um
 * resultado que a essa altura já é um borrão cinza.
 */
export const MAX_MARKS_PER_PAGE = 400;

/** Quanto o passo abre a cada tentativa, quando a densidade estoura o teto. */
const STEP_GROWTH = 1.15;

/**
 * A origem de desenho de uma marca cujo CENTRO deve cair em (cx, cy).
 *
 * O centro, no referencial da marca, está em (w/2, h/2). Girado por θ ele vira
 * (w/2·cos − h/2·sen, w/2·sen + h/2·cos); a origem é o centro desejado menos
 * esse vetor. É a conta inteira, e é o que faltava antes.
 */
export function drawOriginFor(
  cx: number,
  cy: number,
  mark: MarkSize,
  rotationDegrees: number,
): Placement {
  const rad = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = mark.width / 2;
  const hh = mark.height / 2;

  return {
    x: cx - (hw * cos - hh * sin),
    y: cy - (hw * sin + hh * cos),
  };
}

/** A caixa que a marca ocupa DEPOIS de girada — o que precisa caber na margem. */
export function rotatedBounds(mark: MarkSize, rotationDegrees: number): MarkSize {
  const rad = (rotationDegrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));

  return {
    width: mark.width * cos + mark.height * sin,
    height: mark.width * sin + mark.height * cos,
  };
}

export function watermarkPlacements(request: LayoutRequest): LayoutResult {
  return request.layout === 'tiled' ? tiled(request) : single(request);
}

function single(request: LayoutRequest): LayoutResult {
  const { pageWidth, pageHeight, mark, position, rotationDegrees, marginPt } = request;
  const bounds = rotatedBounds(mark, rotationDegrees);

  const centre = (page: number, extent: number, side: 'start' | 'middle' | 'end'): number => {
    // Uma marca maior que a página não tem canto para ir: centralizar é a única
    // resposta que não a corta fora da folha dos dois lados.
    if (extent + marginPt * 2 >= page) return page / 2;
    if (side === 'start') return marginPt + extent / 2;
    if (side === 'end') return page - marginPt - extent / 2;
    return page / 2;
  };

  const horizontal = position.includes('left') ? 'start' : position.includes('right') ? 'end' : 'middle';
  // 'top' é y ALTO no PDF: a origem fica embaixo, ao contrário de um canvas.
  const vertical = position.startsWith('top') ? 'end' : position.startsWith('bottom') ? 'start' : 'middle';

  const cx = centre(pageWidth, bounds.width, horizontal);
  const cy = centre(pageHeight, bounds.height, vertical);

  return { placements: [drawOriginFor(cx, cy, mark, rotationDegrees)], spacingClamped: false };
}

/**
 * A grade gira JUNTO com a marca, e é isso que faz as linhas saírem diagonais e
 * paralelas em vez de uma grade reta com cada item torto dentro dela.
 *
 * A cobertura é medida pelo raio da página (metade da diagonal) porque a grade
 * girada não se alinha com as bordas: cobrir só a largura deixaria os cantos
 * vazios em qualquer ângulo que não fosse múltiplo de 90°.
 */
function tiled(request: LayoutRequest): LayoutResult {
  const { pageWidth, pageHeight, mark, rotationDegrees, gapPercent } = request;

  const rad = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const gap = Math.max(0, gapPercent) / 100;
  let stepX = Math.max(1, mark.width * (1 + gap));
  let stepY = Math.max(1, mark.height * (1 + gap));

  const radius = Math.hypot(pageWidth, pageHeight) / 2;
  let clamped = false;

  const countFor = (sx: number, sy: number): number =>
    (2 * Math.ceil(radius / sx) + 1) * (2 * Math.ceil(radius / sy) + 1);

  while (countFor(stepX, stepY) > MAX_MARKS_PER_PAGE) {
    stepX *= STEP_GROWTH;
    stepY *= STEP_GROWTH;
    clamped = true;
  }

  const cols = Math.ceil(radius / stepX);
  const rows = Math.ceil(radius / stepY);
  const cxPage = pageWidth / 2;
  const cyPage = pageHeight / 2;

  const placements: Placement[] = [];
  for (let i = -cols; i <= cols; i++) {
    for (let j = -rows; j <= rows; j++) {
      const u = i * stepX;
      const v = j * stepY;
      placements.push(
        drawOriginFor(cxPage + u * cos - v * sin, cyPage + u * sin + v * cos, mark, rotationDegrees),
      );
    }
  }

  return { placements, spacingClamped: clamped };
}

/**
 * Um bloco de texto de várias linhas, medido por quem sabe medir.
 *
 * As larguras chegam prontas porque quem mede é diferente dos dois lados — o
 * `widthOfTextAtSize` da fonte embutida no PDF e o `measureText` do canvas na
 * prévia. O que NÃO pode divergir é a altura da linha, o alinhamento e a ordem,
 * e é isso que esta função fixa: sem ela, prévia e resultado usariam duas
 * entrelinhas diferentes e a marca de três nomes sairia mais alta num lado.
 *
 * A saída é a base de cada linha, no referencial do bloco (origem no canto
 * inferior esquerdo, y para cima), já centralizada horizontalmente.
 */
export interface TextBlock {
  readonly size: MarkSize;
  readonly lines: readonly Placement[];
}

/** Entrelinha, em múltiplos do corpo. */
export const LINE_HEIGHT_FACTOR = 1.25;

/** Quanto a base sobe dentro da faixa da linha, para o texto não colar embaixo. */
const BASELINE_LIFT = 0.22;

export function textBlock(lineWidths: readonly number[], fontSize: number): TextBlock {
  const widths = lineWidths.length > 0 ? lineWidths : [0];
  const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
  const width = Math.max(...widths);
  const height = lineHeight * widths.length;

  return {
    size: { width, height },
    lines: widths.map((w, i) => ({
      x: (width - w) / 2,
      y: (widths.length - 1 - i) * lineHeight + fontSize * BASELINE_LIFT,
    })),
  };
}

/** Um ponto do referencial da marca levado para a página, com a marca girada. */
export function rotatePoint(
  origin: Placement,
  offset: Placement,
  rotationDegrees: number,
): Placement {
  const rad = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  return {
    x: origin.x + offset.x * cos - offset.y * sin,
    y: origin.y + offset.x * sin + offset.y * cos,
  };
}
