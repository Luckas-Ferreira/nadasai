/**
 * O pipeline completo: raster -> SVG.
 *
 *   1. quantização        k-means em CIELAB, k automático        quantize.ts
 *   2. segmentação        componentes conexos + despeckle        segment.ts
 *   3. subdivisão planar  DIFERENCIAL 1: aresta compartilhada    planar.ts
 *   4. cantos             curvatura discreta                      fit.ts
 *   5. simplificação      RDP ancorado nos cantos                 fit.ts
 *   6. ajuste             Bézier cúbica, Schneider, G1            fit.ts
 *   7. degradês           DIFERENCIAL 2: linear/radial            gradient.ts
 *   8. serialização       precisão 2, comandos relativos          serialize.ts
 *
 * A ORDEM 3-ANTES-DE-6 É O PONTO INTEIRO. Traçar a subdivisão antes de ajustar
 * curva significa que cada fronteira entre duas regiões é ajustada UMA vez e as
 * duas regiões referenciam o mesmo array de cúbicas. Não há como duas formas
 * vizinhas discordarem sobre onde a fronteira passa, porque não existem duas
 * fronteiras — existe uma. É isso que elimina a costura, e é a razão de este
 * módulo ser mais longo que um vetorizador comum.
 *
 * Um vetorizador "normal" faria 2 -> traçar cada região -> 6, e cada fronteira
 * interna seria ajustada duas vezes, com dois resultados ligeiramente
 * diferentes. O buraco de meio pixel entre eles é o defeito que se vê em
 * qualquer conversor online.
 */

import { ALPHA_CUTOFF } from './alpha';
import { type Cubic, type Pt, detectCorners, fitCurve, simplifyAnchored, tangentAtJoin } from './fit';
import { DEFAULT_GRADIENT_FIT, type GradientFitOptions, fitLinearGradient, fitRadialGradient } from './gradient';
import { OUTSIDE, type ArcRef, buildPlanarMap } from './planar';
import { DEFAULT_PREPROCESS, type PreprocessOptions, preprocess } from './preprocess';
import { DEFAULT_QUANTIZE, otsuThreshold, quantize } from './quantize';
import {
  type CoverageFn,
  DEFAULT_REFINE,
  NO_REFINE,
  type RefineOptions,
  refineLattice,
  snapCorners,
  snapToCoverage,
} from './refine';
import { segment } from './segment';
import { type SvgOptions, type VectorShape, countNodes, toSvg } from './serialize';

export type VectorMode = 'trace' | 'logo' | 'illustration' | 'pixel';

export interface VectorizeOptions {
  readonly mode: VectorMode;
  /** Teto de cores. Ignorado em `trace` (que é bilevel por definição). */
  readonly maxColors: number;
  /** Área mínima de região, em pixels. Absorve ruído de JPEG. */
  readonly minArea: number;
  /**
   * Tolerância do ajuste de curva, em pixels. Maior = menos nós, mais solto.
   *
   * O PISO DE 1,0 PX ERA PROPRIEDADE DA ESCADA, E A ESCADA NÃO EXISTE MAIS.
   *
   * Enquanto o ajuste recebia a polilinha crua do reticulado, medir tolerância
   * abaixo de 1 px era medir a reprodução do artefato de amostragem, e o custo
   * era brutal — 0,7 gastava 5,5x mais nós que 1,2 para descrever o mesmo
   * desenho com fidelidade pior. Daí os presets de 1,1 a 1,6.
   *
   * O erro estava em tolerar a escada em vez de removê-la. `refine.ts` agora
   * entrega uma polilinha sub-pixel, e com ela a tolerância volta a significar
   * "de quanto pode errar a FORMA". Medido no círculo de raio 100 com
   * antialiasing, ondulação do raio traçado (min..max) e número de nós:
   *
   *     antes:  1,41 px de tolerância, reticulado cru -> 99,06..101,80  18 nós
   *     depois: 0,45 px, borda em sub-pixel           -> 99,88..101,01  28 nós
   *
   * Metade da ondulação por dez nós a mais num círculo inteiro. É o inverso da
   * troca que o comentário antigo descrevia, porque a entrada do ajuste mudou.
   */
  readonly smoothness: number;
  /** Ângulo (graus) acima do qual uma virada é canto e não é suavizada. */
  readonly cornerThreshold: number;
  /** Tentar explicar regiões grandes por degradê. */
  readonly gradients: boolean;
  readonly gradientFit: GradientFitOptions;
  /** Casas decimais na saída. */
  readonly precision: number;
  /** Filtro que preserva aresta, antes de quantizar. Ver preprocess.ts. */
  readonly denoise: PreprocessOptions;
  /** Remoção da escada do reticulado, antes do ajuste. Ver refine.ts. */
  readonly refine: RefineOptions;
}

/**
 * Presets por modo. Um algoritmo com um jogo de parâmetros não serve aos quatro
 * casos: o que preserva o canto de um logo destrói o cabelo de uma ilustração, e
 * o que suaviza uma foto derrete um sprite de 32px.
 */
export const MODE_PRESETS: Record<VectorMode, VectorizeOptions> = {
  /** Traço: logo P&B, assinatura, digitalização. Bilevel, canto duro. */
  trace: {
    mode: 'trace',
    maxColors: 2,
    minArea: 8,
    smoothness: 0.45,
    cornerThreshold: 55,
    gradients: false,
    gradientFit: DEFAULT_GRADIENT_FIT,
    precision: 2,
    // Digitalização é papel: grão de scanner e ruído de JPEG viram ilha preta
    // no meio do branco. Raio maior que os outros modos, de propósito.
    denoise: { radius: 3, epsilon: 90 },
    refine: DEFAULT_REFINE,
  },
  /** Logo/arte plana: poucas cores, aresta dura, nada de degradê. */
  logo: {
    mode: 'logo',
    maxColors: 12,
    minArea: 16,
    smoothness: 0.45,
    cornerThreshold: 50,
    gradients: false,
    gradientFit: DEFAULT_GRADIENT_FIT,
    precision: 2,
    denoise: DEFAULT_PREPROCESS,
    refine: DEFAULT_REFINE,
  },
  /** Ilustração: muitas cores e degradês; tolerância maior porque a fidelidade
   *  de contorno importa menos que a de cor. */
  illustration: {
    mode: 'illustration',
    maxColors: 24,
    minArea: 24,
    smoothness: 0.7,
    cornerThreshold: 68,
    gradients: true,
    gradientFit: DEFAULT_GRADIENT_FIT,
    precision: 2,
    denoise: DEFAULT_PREPROCESS,
    refine: DEFAULT_REFINE,
  },
  /**
   * Pixel art: NADA de suavização.
   *
   * `smoothness` ~0 e `cornerThreshold` baixíssimo fazem todo degrau do
   * reticulado virar canto, então a saída são retângulos exatos — que é
   * precisamente o que se quer de um sprite. Suavizar pixel art é o erro mais
   * comum dos vetorizadores genéricos: transforma um ícone nítido de 32px numa
   * mancha, e não há como desfazer depois.
   */
  pixel: {
    mode: 'pixel',
    maxColors: 32,
    minArea: 1,
    smoothness: 0.01,
    cornerThreshold: 20,
    gradients: false,
    gradientFit: DEFAULT_GRADIENT_FIT,
    precision: 0,
    // Em pixel art todo pixel é conteúdo. Filtrar aqui apagaria o desenho.
    denoise: { radius: 0, epsilon: 0 },
    // E a escada do reticulado É o desenho: suavizá-la derreteria o sprite.
    refine: NO_REFINE,
  },
};

export interface VectorizeResult {
  readonly svg: string;
  readonly shapeCount: number;
  readonly nodeCount: number;
  readonly colorCount: number;
  readonly gradientCount: number;
  /** Bytes do SVG — a UI mostra ao lado do tamanho do raster. */
  readonly byteLength: number;
}

export type ProgressFn = (stage: string, fraction: number) => void;

export function vectorize(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  opts: VectorizeOptions,
  onProgress?: ProgressFn,
): VectorizeResult {
  const report = (stage: string, f: number): void => onProgress?.(stage, f);

  // --- 0. filtro que preserva aresta ---------------------------------------
  //
  // Antes de qualquer decisão de cor. Ver preprocess.ts: sem ele o ruído de JPEG
  // chega ao quantizador como se fosse desenho, e o segmentador acha centenas de
  // regiões de 3 px que nunca existiram na imagem original.
  report('denoise', 0);
  const clean = preprocess(rgba, w, h, opts.denoise);

  // --- 0b. buracos ---------------------------------------------------------
  //
  // O que é transparente vira uma REGIÃO como qualquer outra — segmentada,
  // traçada, e no fim não emitida. Ver alpha.ts: tratar a imagem como opaca
  // devolvia um retângulo branco (ou, sem o branco, um retângulo da cor do
  // objeto) onde o original era vazio.
  const holes = new Uint8Array(w * h);
  let holeCount = 0;
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] < ALPHA_CUTOFF) {
      holes[i] = 1;
      holeCount++;
    }
  }

  // --- 1. quantização ------------------------------------------------------
  report('quantize', 0.1);

  let colorIndex: Int32Array;
  let palette: ReadonlyArray<{ r: number; g: number; b: number }>;

  if (opts.mode === 'trace') {
    // Bilevel por Otsu. Não passa pelo k-means: com duas classes o limiar ótimo
    // tem forma fechada, e o k-means em Lab escolheria dois centróides que não
    // são necessariamente "tinta" e "papel" numa digitalização amarelada.
    const t = otsuThreshold(clean, w * h);
    colorIndex = new Int32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const y = 0.299 * clean[i * 4] + 0.587 * clean[i * 4 + 1] + 0.114 * clean[i * 4 + 2];
      colorIndex[i] = y < t ? 0 : 1;
    }
    palette = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ];
  } else {
    const q = quantize(clean, w, h, {
      ...DEFAULT_QUANTIZE,
      maxColors: opts.maxColors,
      minColors: Math.min(2, opts.maxColors),
    });
    colorIndex = q.indices;
    palette = q.rgb;
  }

  // O buraco é um índice de paleta a mais, fora do alcance da paleta real. Assim
  // a segmentação, a subdivisão planar e o ajuste tratam a área transparente com
  // o mesmo código de todo o resto — e a fronteira entre o objeto e o vazio é
  // ajustada UMA vez, como qualquer outra fronteira.
  const HOLE = palette.length;
  if (holeCount > 0) {
    for (let i = 0; i < colorIndex.length; i++) if (holes[i]) colorIndex[i] = HOLE;
  }

  // --- 2. segmentação ------------------------------------------------------
  report('segment', 0.2);
  const seg = segment(colorIndex, w, h, opts.minArea);

  // --- 3. subdivisão planar (DIFERENCIAL 1) --------------------------------
  report('topology', 0.35);
  const planar = buildPlanarMap(seg.labels, w, h);

  // --- 4/5/6. cada ARCO ajustado UMA vez -----------------------------------
  //
  // O cache é o mecanismo do diferencial. `arcCurves[i]` é a geometria da aresta
  // i; a região da esquerda a usa direta, a da direita a usa reversa. Nenhuma
  // das duas recalcula.
  report('fit', 0.5);
  const arcCurves = new Map<number, Cubic[]>();

  // A leitura sub-pixel precisa saber o que há dos DOIS lados do arco para saber
  // o que procurar: uma rampa entre duas cores, ou uma rampa de alfa contra o
  // vazio. `clean` é o raster filtrado — o alfa nele é o original, porque
  // `preprocess` só toca os três primeiros canais.
  const coverageFor = makeCoverageFactory(clean, w, h, seg.regionColor, palette, HOLE);

  for (const arc of planar.arcs) {
    const pts: Pt[] = arc.points.map((p) => ({ x: p.x, y: p.y }));
    arcCurves.set(arc.id, fitPolyline(pts, arc.closed, opts, coverageFor(arc.left, arc.right)));
  }

  // --- 7/8. montar as formas ----------------------------------------------
  report('shapes', 0.75);

  // Pixels por região, só quando há degradê para tentar — montar sempre custaria
  // uma passada e um array de milhões de índices sem uso.
  let regionPixels: Int32Array[] | null = null;
  if (opts.gradients) {
    const counts = new Int32Array(seg.regionCount);
    for (let i = 0; i < seg.labels.length; i++) counts[seg.labels[i]]++;
    regionPixels = Array.from({ length: seg.regionCount }, (_, r) => new Int32Array(counts[r]));
    const fill = new Int32Array(seg.regionCount);
    for (let i = 0; i < seg.labels.length; i++) {
      const r = seg.labels[i];
      regionPixels[r][fill[r]++] = i;
    }
  }

  const shapes: VectorShape[] = [];
  let gradientCount = 0;

  for (const [region, cycles] of planar.cycles) {
    if (region === OUTSIDE) continue;
    // A região transparente foi traçada como todas as outras — ela só não vira
    // `<path>`. O que sobra no lugar dela é buraco no SVG, que é o que um
    // recorte tem de devolver.
    if (seg.regionColor[region] === HOLE) continue;

    const subpaths: Cubic[][] = [];
    for (const cycle of cycles) {
      const curves = cycleCurves(cycle, arcCurves);
      if (curves.length > 0) subpaths.push(curves);
    }
    if (subpaths.length === 0) continue;

    // O maior sub-caminho primeiro. `evenodd` não depende da ordem, mas um
    // editor que abra o arquivo mostra o contorno externo como o principal, e é
    // o que um humano espera ao clicar na forma.
    subpaths.sort((a, b) => bboxArea(b) - bboxArea(a));

    const fill = palette[seg.regionColor[region]] ?? { r: 0, g: 0, b: 0 };

    let gradient;
    if (opts.gradients && regionPixels) {
      // O degradê é ajustado contra o raster FILTRADO, e não contra o original.
      //
      // A validação é em ΔE2000 com tolerância apertada; medida contra os pixels
      // crus, o ruído de JPEG sozinho estoura o resíduo máximo e o degradê é
      // recusado justamente nas fotos e ilustrações onde ele mais valeria. O
      // filtro removeu ruído, não sinal — a rampa que se quer ajustar continua
      // exatamente onde estava.
      const px = regionPixels[region];
      gradient =
        fitLinearGradient(px, clean, w, opts.gradientFit) ??
        fitRadialGradient(px, clean, w, opts.gradientFit) ??
        undefined;
      if (gradient) gradientCount++;
    }

    shapes.push({ subpaths, fill, gradient });
  }

  report('serialize', 0.9);
  const svgOpts: SvgOptions = {
    width: w,
    height: h,
    precision: opts.precision,
    // Sem retângulo de fundo: as regiões já cobrem cada pixel da imagem, porque
    // a partição é total. Um fundo seria um path a mais pintando o que já está
    // pintado — e destruiria a transparência de quem vetoriza um recorte.
    background: null,
    // Fecha a fresta de antialiasing do renderizador. Ver o comentário longo em
    // `SvgOptions.seamStroke`: a geometria já é exata, o que sobra é o
    // compositing. Em `pixel` fica desligado, porque ali as bordas são
    // alinhadas à grade e não há cobertura parcial para compor — e um contorno
    // engordaria cada pixel do sprite.
    seamStroke: opts.mode === 'pixel' ? 0 : 0.8,
  };
  const svg = toSvg(shapes, svgOpts);

  report('done', 1);

  return {
    svg,
    shapeCount: shapes.length,
    nodeCount: countNodes(shapes),
    colorCount: new Set(shapes.map((s) => `${s.fill.r},${s.fill.g},${s.fill.b}`)).size,
    gradientCount,
    byteLength: svg.length,
  };
}

/**
 * Constrói a função de cobertura de um arco a partir das regiões que ele separa.
 *
 * Três casos, e o terceiro é o que faz um recorte PNG sair com a borda certa:
 *
 *   - fora da imagem de um dos lados: sem cobertura. A moldura tem de ficar
 *     exatamente onde está, ou toda forma encostada na borda encolhe para dentro
 *     dela;
 *   - duas cores: a rampa é medida projetando a cor lida no segmento que liga as
 *     duas cores da paleta. Cores próximas demais não têm rampa que signifique
 *     alguma coisa — aí não se mexe;
 *   - um dos lados é BURACO: a rampa está no alfa, não na cor. É o único sinal
 *     que existe ali, porque `alpha.ts` justamente copiou a cor do objeto para
 *     dentro da área transparente.
 */
function makeCoverageFactory(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  regionColor: Int32Array,
  palette: ReadonlyArray<{ r: number; g: number; b: number }>,
  hole: number,
): (left: number, right: number) => CoverageFn | null {
  /** Amostra bilinear de um canal. O centro do pixel (i,j) fica em (i+.5, j+.5),
   *  e o traçado anda pelos CANTOS — sem esse meio pixel a leitura sai deslocada
   *  meio pixel, que é justamente a ordem de grandeza que se está medindo. */
  const at = (ch: number, x: number, y: number): number => {
    const fx = x - 0.5;
    const fy = y - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;

    const cx0 = Math.max(0, Math.min(w - 1, x0));
    const cx1 = Math.max(0, Math.min(w - 1, x0 + 1));
    const cy0 = Math.max(0, Math.min(h - 1, y0));
    const cy1 = Math.max(0, Math.min(h - 1, y0 + 1));

    const p00 = px[(cy0 * w + cx0) * 4 + ch];
    const p10 = px[(cy0 * w + cx1) * 4 + ch];
    const p01 = px[(cy1 * w + cx0) * 4 + ch];
    const p11 = px[(cy1 * w + cx1) * 4 + ch];

    return (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty;
  };

  const colorOf = (region: number): { r: number; g: number; b: number } | null => {
    const idx = regionColor[region];
    return idx === hole ? null : (palette[idx] ?? null);
  };

  return (left: number, right: number): CoverageFn | null => {
    if (left === OUTSIDE || right === OUTSIDE) return null;

    const cl = colorOf(left);
    const cr = colorOf(right);

    if (cl === null || cr === null) {
      // Buraco de um dos lados: a rampa é o alfa. `flip` orienta para que a
      // cobertura continue valendo 0 na região da esquerda e 1 na da direita.
      const flip = cr === null;
      return (x, y) => {
        const a = at(3, x, y) / 255;
        return flip ? 1 - a : a;
      };
    }

    const dr = cr.r - cl.r;
    const dg = cr.g - cl.g;
    const db = cr.b - cl.b;
    const dd = dr * dr + dg * dg + db * db;
    // ~14 níveis somados nos três canais. Abaixo disso o "cruzamento" seria
    // decidido pelo ruído que sobrou do filtro, e mexer o ponto pioraria.
    if (dd < 200) return null;

    return (x, y) => {
      const t =
        ((at(0, x, y) - cl.r) * dr + (at(1, x, y) - cl.g) * dg + (at(2, x, y) - cl.b) * db) / dd;
      return t < 0 ? 0 : t > 1 ? 1 : t;
    };
  };
}

/** Ajusta uma polilinha do reticulado: cantos -> sub-pixel -> simplificação ->
 *  Bézier, com G1 imposto nas junções que NÃO são canto. */
function fitPolyline(
  pts: Pt[],
  closed: boolean,
  opts: VectorizeOptions,
  coverage: CoverageFn | null,
): Cubic[] {
  if (pts.length < 2) return [];

  // Os cantos são detectados no RETICULADO, antes de suavizar: é o traçado cru
  // que ainda tem a virada de 90° inteira para medir. Depois do filtro, um canto
  // já está parcialmente arredondado e o mesmo limiar deixaria de vê-lo — a
  // ordem aqui é o que mantém o "L" de um logo com o canto no lugar.
  /**
   * A ORDEM AQUI JÁ FOI O CONTRÁRIO, E O CONTRÁRIO ESTAVA ERRADO.
   *
   * Detectar canto ANTES do sub-pixel parece o certo — o traçado cru ainda tem a
   * virada de 90° inteira para medir — e é o que este código fazia. Só que medir
   * ângulo no reticulado é medir ângulo numa escada: num círculo de raio 70, um
   * trecho onde a escada troca de "quase diagonal" para "quase vertical" mede
   * 63° com braço de três pontos e 34° com braço de seis, quando a curva real
   * virou 10°. Isso não é canto, é amostragem — e cada falso positivo virava uma
   * âncora que `snapCorners` transformava numa corda cortada para dentro do
   * arco. Medido: 67,99 a 71,11 px de raio, três pixels de bossa, no mesmo
   * círculo que sem cantos falsos saía 69,89 a 70,67.
   *
   * Depois da busca por cobertura a polilinha tem precisão de ~0,1 px, e o mesmo
   * ângulo passa a medir o que a forma faz. O canto de verdade continua com seus
   * 90°; a escada some. Custa que o canto entra na busca com a normal ambígua —
   * o que não importa, porque `snapCorners` reescreve a posição dele logo depois
   * pela interseção das duas retas.
   */
  const unpinned = new Array<boolean>(pts.length).fill(false);
  const located =
    coverage && opts.refine.passes > 0
      ? snapToCoverage(pts, closed, unpinned, coverage, 1)
      : pts;

  let corners = detectCorners(located, closed, 3, opts.cornerThreshold);

  /**
   * Num ciclo, a costura do array cai onde o traçado começou — um ponto
   * arbitrário, quase nunca um canto. Tudo o que trata a polilinha como aberta
   * (o afinamento de cantos, a quebra em trechos, o próprio RDP) trata esse
   * ponto como ponta fixa, e uma esquina que caia ali sai arredondada enquanto
   * as outras três do mesmo losango saem perfeitas — o defeito aparecia como um
   * canto amassado por forma, sempre um só, sempre em lugar diferente.
   *
   * Girar o ciclo para começar NUM canto resolve na origem: a costura passa a
   * cair onde o ajuste já ia quebrar de qualquer jeito.
   */
  let onEdge = located;
  if (closed && onEdge.length > 3) {
    const first = corners.findIndex((c, i) => c && i > 0 && i < onEdge.length - 1);
    if (first > 0) {
      const m = onEdge.length - 1; // o último ponto é cópia do primeiro
      const rot = <T>(arr: readonly T[]): T[] => {
        const outArr: T[] = [];
        for (let i = 0; i <= m; i++) outArr.push(arr[(first + i) % m]);
        return outArr;
      };
      onEdge = rot(onEdge);
      corners = rot(corners);
    }
  }

  // O passa-baixa limpa o ruído de medida que sobrou da busca por cobertura,
  // sem tocar nos cantos.
  const smooth = refineLattice(onEdge, closed, corners, opts.refine);

  // E o canto, que a busca por cobertura não sabe mexer, vai para onde as duas
  // bordas já refinadas se cruzam. Depois do passa-baixa de propósito: as retas
  // são ajustadas sobre os pontos definitivos.
  const withCorners =
    opts.refine.passes > 0 ? snapCorners(smooth, closed, corners) : smooth;

  const kept = simplifyAnchored(withCorners, corners, opts.smoothness);
  if (kept.length < 2) return [];

  const simple = kept.map((i) => withCorners[i]);
  const simpleCorner = kept.map((i) => corners[i]);

  // Quebrar nos cantos e ajustar cada trecho. Um trecho sem canto nenhum é uma
  // chamada só, e o `fitCurve` subdivide internamente conforme o erro.
  const out: Cubic[] = [];
  let start = 0;

  for (let i = 1; i <= simple.length - 1; i++) {
    const isLast = i === simple.length - 1;
    if (!simpleCorner[i] && !isLast) continue;

    const segPts = simple.slice(start, i + 1);
    if (segPts.length >= 2) {
      // G1: nas pontas que não são canto, a tangente é a da junção — a mesma
      // que o trecho vizinho vai usar. É isso que faz a emenda sumir.
      const tStart =
        start > 0 && !simpleCorner[start]
          ? tangentAtJoin(simple[start - 1], simple[start], simple[Math.min(start + 1, simple.length - 1)])
          : undefined;
      const tEnd =
        !isLast && !simpleCorner[i]
          ? negate(tangentAtJoin(simple[i - 1], simple[i], simple[Math.min(i + 1, simple.length - 1)]))
          : undefined;

      out.push(...fitCurve(segPts, opts.smoothness * opts.smoothness, tStart, tEnd));
    }
    start = i;
  }

  return out;
}

const negate = (p: Pt): Pt => ({ x: -p.x, y: -p.y });

/** Concatena a geometria dos arcos de um ciclo, revertendo onde preciso.
 *  Reverter uma cúbica é trocar p0<->p3 e c1<->c2 — a curva é a mesma, o sentido
 *  é o oposto. É o que permite as duas regiões usarem o MESMO ajuste. */
function cycleCurves(cycle: readonly ArcRef[], cache: ReadonlyMap<number, Cubic[]>): Cubic[] {
  const out: Cubic[] = [];
  for (const ref of cycle) {
    const curves = cache.get(ref.arc);
    if (!curves || curves.length === 0) continue;
    if (ref.forward) {
      out.push(...curves);
    } else {
      for (let i = curves.length - 1; i >= 0; i--) {
        const c = curves[i];
        out.push({ p0: c.p3, c1: c.c2, c2: c.c1, p3: c.p0 });
      }
    }
  }
  return out;
}

function bboxArea(curves: readonly Cubic[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of curves) {
    for (const p of [c.p0, c.p3]) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return maxX <= minX || maxY <= minY ? 0 : (maxX - minX) * (maxY - minY);
}

/**
 * Sugere o modo a partir da própria imagem.
 *
 * Mede o que `BackgroundRemovalService.isFlatGraphic()` já mede por outro motivo:
 * quantas cores distintas dominam, e quanto da imagem é aresta. Pedir o modo ao
 * usuário antes de ele ver qualquer resultado é o que faz a primeira tentativa
 * ser sempre errada — ninguém sabe de antemão se a própria imagem é "logo" ou
 * "ilustração".
 */
export function suggestMode(rgba: Uint8ClampedArray, w: number, h: number): VectorMode {
  const n = w * h;
  const step = Math.max(1, Math.floor(n / 20000));

  // Cores distintas em grade grossa (5 bits por canal): 32768 baldes.
  const seen = new Set<number>();
  let sampled = 0;
  let grayish = 0;

  for (let i = 0; i < n; i += step) {
    // O que é transparente não conta: com o vazamento de cor de `alpha.ts` a
    // área vazia carrega uma cópia da cor da borda, e contá-la faria um recorte
    // com fundo grande parecer ter menos cores do que tem.
    if (rgba[i * 4 + 3] < ALPHA_CUTOFF) continue;

    const r = rgba[i * 4] >> 3;
    const g = rgba[i * 4 + 1] >> 3;
    const b = rgba[i * 4 + 2] >> 3;
    seen.add((r << 10) | (g << 5) | b);
    const max = Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    const min = Math.min(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    if (max - min < 24) grayish++;
    sampled++;
  }

  const distinct = seen.size;
  // Imagem inteiramente transparente: nada amostrado, e dividir por zero daria
  // NaN, que reprova toda comparação e cai no modo de ilustração por acidente.
  const grayShare = sampled === 0 ? 0 : grayish / sampled;

  // Imagem pequena com poucas cores é sprite, não logo: suavizar destruiria.
  if (w * h <= 128 * 128 && distinct <= 64) return 'pixel';
  // Quase tudo cinza e pouquíssimas cores: digitalização/assinatura.
  if (grayShare > 0.9 && distinct < 400) return 'trace';
  // Poucas cores distintas: arte plana.
  if (distinct < 900) return 'logo';
  return 'illustration';
}
