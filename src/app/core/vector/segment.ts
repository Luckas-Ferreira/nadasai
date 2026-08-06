/**
 * Componentes conexos + despeckle.
 *
 * Depois da quantização, pixels vizinhos com a mesma cor formam regiões. Esta
 * etapa dá um rótulo a cada região CONEXA — duas manchas da mesma cor em cantos
 * opostos da imagem são duas regiões, não uma, porque cada uma vai virar um path
 * com sua própria geometria.
 *
 * DUAS DECISÕES QUE SEPARAM ISTO DO ÓBVIO
 *
 * 1. Conectividade 4, não 8.
 *    Com 8-conectividade dois pixels que se tocam só na diagonal são a mesma
 *    região — e aí a fronteira dela passa por um ponto onde a região está dos
 *    dois lados ao mesmo tempo. Isso é um grafo planar inválido: a subdivisão em
 *    `planar.ts` não consegue decidir por onde continuar o arco, e o resultado é
 *    um `<path>` que se autointersecta e pinta o buraco errado sob
 *    `fill-rule="evenodd"`. Conectividade 4 nas regiões mantém a topologia sã.
 *
 * 2. Despeckle FUNDE, nunca apaga.
 *    Um JPEG traz milhares de manchinhas de 2-3 px que são artefato de
 *    compressão, não desenho. Todo vetorizador filtra isso; quase todos filtram
 *    ERRADO, removendo a região e deixando o pixel sem rótulo. O que fica é um
 *    buraco: no meio de um logo aparece um furo do fundo, que é pior que o
 *    ponto que se queria tirar. Aqui a região pequena é absorvida pelo vizinho
 *    com quem ela compartilha a fronteira mais longa — o que preserva a partição
 *    (todo pixel continua tendo exatamente um rótulo) e escolhe o vizinho que
 *    visualmente já a cercava.
 *
 *    A ordem importa: da menor para a maior. Fundir a menor primeiro deixa que
 *    ela engorde o vizinho e que o resultado seja reavaliado, o que dissolve
 *    cadeias de manchinhas encostadas uma na outra. Fundir em ordem arbitrária
 *    deixa ilhas de ruído que sobrevivem porque cada uma só encostava em outra
 *    igualmente pequena.
 */

export interface Segmentation {
  /** Rótulo por pixel, 0..regionCount-1. */
  readonly labels: Int32Array;
  readonly regionCount: number;
  /** Índice da cor (na paleta da quantização) de cada região. */
  readonly regionColor: Int32Array;
  /** Área em pixels de cada região. */
  readonly regionArea: Int32Array;
}

/**
 * @param colorIndex índice de paleta por pixel, comprimento w*h
 * @param minArea    regiões menores que isto são absorvidas. 0 desliga.
 */
export function segment(
  colorIndex: Int32Array,
  w: number,
  h: number,
  minArea: number,
): Segmentation {
  const n = w * h;
  const labels = new Int32Array(n).fill(-1);

  let regionCount = 0;
  const colorOf: number[] = [];
  const areaOf: number[] = [];

  // Flood fill iterativo. Recursivo estoura a pilha numa região grande — uma
  // foto de céu é um único componente de milhões de pixels.
  const stack = new Int32Array(n);

  for (let start = 0; start < n; start++) {
    if (labels[start] !== -1) continue;

    const color = colorIndex[start];
    const label = regionCount++;
    let area = 0;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = label;

    while (sp > 0) {
      const p = stack[--sp];
      area++;
      const x = p % w;
      const y = (p / w) | 0;

      // 4-vizinhança, pelo motivo no cabeçalho.
      if (x > 0 && labels[p - 1] === -1 && colorIndex[p - 1] === color) {
        labels[p - 1] = label;
        stack[sp++] = p - 1;
      }
      if (x < w - 1 && labels[p + 1] === -1 && colorIndex[p + 1] === color) {
        labels[p + 1] = label;
        stack[sp++] = p + 1;
      }
      if (y > 0 && labels[p - w] === -1 && colorIndex[p - w] === color) {
        labels[p - w] = label;
        stack[sp++] = p - w;
      }
      if (y < h - 1 && labels[p + w] === -1 && colorIndex[p + w] === color) {
        labels[p + w] = label;
        stack[sp++] = p + w;
      }
    }

    colorOf.push(color);
    areaOf.push(area);
  }

  let result: Segmentation = {
    labels,
    regionCount,
    regionColor: Int32Array.from(colorOf),
    regionArea: Int32Array.from(areaOf),
  };

  if (minArea > 1) result = despeckle(result, w, h, minArea);
  return result;
}

/** Comprimento de fronteira compartilhada entre cada par de regiões vizinhas. */
function borderLengths(labels: Int32Array, w: number, h: number): Map<number, Map<number, number>> {
  const adj = new Map<number, Map<number, number>>();

  const bump = (a: number, b: number): void => {
    if (a === b) return;
    let m = adj.get(a);
    if (!m) adj.set(a, (m = new Map()));
    m.set(b, (m.get(b) ?? 0) + 1);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const a = labels[p];
      if (x < w - 1) {
        const b = labels[p + 1];
        bump(a, b);
        bump(b, a);
      }
      if (y < h - 1) {
        const b = labels[p + w];
        bump(a, b);
        bump(b, a);
      }
    }
  }

  return adj;
}

function despeckle(seg: Segmentation, w: number, h: number, minArea: number): Segmentation {
  const { labels } = seg;
  const area = Int32Array.from(seg.regionArea);
  const color = Int32Array.from(seg.regionColor);

  // União-busca: fundir é apontar a pequena para a grande, e só no fim reescrever
  // o mapa de rótulos. Reescrever a cada fusão seria O(n) por fusão.
  const parent = new Int32Array(seg.regionCount);
  for (let i = 0; i < parent.length; i++) parent[i] = i;

  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    while (parent[i] !== r) {
      const next = parent[i];
      parent[i] = r;
      i = next;
    }
    return r;
  };

  const adj = borderLengths(labels, w, h);

  // Da menor para a maior — ver o cabeçalho: é o que dissolve cadeias de ruído
  // em vez de deixar ilhas que sobrevivem por se encostarem entre si.
  const order = Array.from({ length: seg.regionCount }, (_, i) => i).sort((a, b) => area[a] - area[b]);

  for (const raw of order) {
    const r = find(raw);
    if (area[r] >= minArea) continue;

    const neighbours = adj.get(raw);
    if (!neighbours) continue;

    // O vizinho com a fronteira mais longa — o que de fato já cercava a mancha.
    // Empate é resolvido pela maior área, para que a absorção suba a hierarquia
    // e não fique oscilando entre dois pequenos.
    let best = -1;
    let bestLen = -1;
    for (const [rawOther, len] of neighbours) {
      const o = find(rawOther);
      if (o === r) continue;
      if (len > bestLen || (len === bestLen && best >= 0 && area[o] > area[best])) {
        best = o;
        bestLen = len;
      }
    }
    if (best < 0) continue;

    parent[r] = best;
    area[best] += area[r];
  }

  // Reescrita final: rótulos compactados em 0..k-1.
  const remap = new Map<number, number>();
  const newColor: number[] = [];
  const newArea: number[] = [];

  for (let i = 0; i < labels.length; i++) {
    const root = find(labels[i]);
    let id = remap.get(root);
    if (id === undefined) {
      id = newColor.length;
      remap.set(root, id);
      newColor.push(color[root]);
      newArea.push(area[root]);
    }
    labels[i] = id;
  }

  return {
    labels,
    regionCount: newColor.length,
    regionColor: Int32Array.from(newColor),
    regionArea: Int32Array.from(newArea),
  };
}
