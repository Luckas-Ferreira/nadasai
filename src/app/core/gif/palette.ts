import { type Lab, rgbToLab } from '../vector/color';

/**
 * A paleta do GIF, que é o que decide se ele parece bom ou parece de 2005.
 *
 * POR QUE NÃO É O `quantize()` DO VETORIZADOR, já que ele existe e é melhor
 * escrito que este arquivo: aquele resolve outra pergunta. Ele BUSCA o k —
 * roda um k-means completo para cada k de `minColors` até `maxColors` e para
 * quando a paleta já explica a arte chapada. É exatamente certo para um logo,
 * onde "quantas cores esta imagem tem de verdade?" é a pergunta; e é inviável
 * aqui, onde o k não é uma descoberta e sim uma imposição do formato (256), o
 * que faria a busca rodar 256 k-means por vídeo.
 *
 * O que se reaproveita é a parte que vale: a conversão para CIELAB de
 * `core/vector/color.ts`. Agrupar cor em RGB — que é o que quase todo conversor
 * de GIF faz, com median cut — trata a distância entre dois verdes como igual à
 * distância entre dois azuis, e o olho não. É daí que vem o banding e a cor
 * lavada dos GIFs da internet.
 *
 * O CASO EXATO NÃO É EXCEÇÃO, é o caso principal desta ferramenta. Gravação de
 * tela tem interface chapada e costuma ter menos de 256 cores distintas; quando
 * tem, a paleta é a lista delas e a conversão é SEM PERDA. Só vídeo de câmera
 * cai no agrupamento.
 */

export interface GifPalette {
  readonly rgb: ReadonlyArray<{ r: number; g: number; b: number }>;
  readonly lab: readonly Lab[];
  /** Verdadeiro quando a paleta é a lista exata das cores presentes. */
  readonly exact: boolean;
}

/** Amostras para a busca. Mais que isto não muda a paleta e custa tempo. */
const MAX_SAMPLES = 20_000;

/** Teto de iterações do Lloyd. Na prática converge antes; é um limite de tempo. */
const MAX_ITERATIONS = 8;

/** PRNG determinístico (mulberry32), mesmo motivo do vetorizador: o mesmo vídeo
 *  tem de dar o mesmo GIF, ou não há como testar nem confiar no que se vê. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/**
 * Constrói a paleta a partir de pixels amostrados de vários quadros.
 *
 * `samples` é RGBA e pode vir de quantos quadros forem — quanto mais espalhados
 * no tempo, melhor a paleta cobre o vídeo inteiro. Uma paleta tirada só do
 * primeiro quadro erra feio em vídeo que muda de cena.
 */
export function buildPalette(samples: Uint8ClampedArray, maxColors: number): GifPalette {
  const cap = Math.max(2, Math.min(256, Math.floor(maxColors)));
  const pixels = samples.length / 4;

  // 1. As cores distintas. Se couberem no teto, acabou: a paleta é elas, e a
  //    conversão não perde nada. É o caso da gravação de tela.
  const seen = new Map<number, number>();
  for (let i = 0; i < pixels; i++) {
    const key = packRgb(samples[i * 4], samples[i * 4 + 1], samples[i * 4 + 2]);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (seen.size > cap) break;
  }

  if (seen.size <= cap) {
    const rgb = [...seen.keys()].map((key) => ({
      r: (key >> 16) & 0xff,
      g: (key >> 8) & 0xff,
      b: key & 0xff,
    }));
    return {
      rgb,
      lab: rgb.map((c) => rgbToLab(c.r, c.g, c.b)),
      exact: true,
    };
  }

  // 2. Amostragem uniforme para o agrupamento.
  const step = Math.max(1, Math.floor(pixels / MAX_SAMPLES));
  const L: number[] = [];
  const A: number[] = [];
  const B: number[] = [];
  for (let i = 0; i < pixels; i += step) {
    const lab = rgbToLab(samples[i * 4], samples[i * 4 + 1], samples[i * 4 + 2]);
    L.push(lab.L);
    A.push(lab.a);
    B.push(lab.b);
  }

  const n = L.length;
  const random = rng(0x9e3779b9);

  // 3. k-means++: o primeiro centro é sorteado e cada seguinte sai com
  //    probabilidade proporcional ao quadrado da distância ao centro mais
  //    próximo. É o que evita a paleta inteira cair na cor dominante — num
  //    vídeo com fundo escuro, a inicialização aleatória gasta quase todas as
  //    cores no preto e some com o resto.
  const cL = new Float64Array(cap);
  const cA = new Float64Array(cap);
  const cB = new Float64Array(cap);

  const first = Math.floor(random() * n);
  cL[0] = L[first];
  cA[0] = A[first];
  cB[0] = B[first];

  const nearestSq = new Float64Array(n).fill(Infinity);

  for (let k = 1; k < cap; k++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const dL = L[i] - cL[k - 1];
      const dA = A[i] - cA[k - 1];
      const dB = B[i] - cB[k - 1];
      const d = dL * dL + dA * dA + dB * dB;
      if (d < nearestSq[i]) nearestSq[i] = d;
      total += nearestSq[i];
    }

    let target = random() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      target -= nearestSq[i];
      if (target <= 0) {
        chosen = i;
        break;
      }
    }

    cL[k] = L[chosen];
    cA[k] = A[chosen];
    cB[k] = B[chosen];
  }

  // 4. Lloyd.
  const assign = new Int32Array(n);
  const sumL = new Float64Array(cap);
  const sumA = new Float64Array(cap);
  const sumB = new Float64Array(cap);
  const count = new Int32Array(cap);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let moved = 0;

    for (let i = 0; i < n; i++) {
      let bestD = Infinity;
      let bestC = 0;
      for (let k = 0; k < cap; k++) {
        const dL = L[i] - cL[k];
        const dA = A[i] - cA[k];
        const dB = B[i] - cB[k];
        const d = dL * dL + dA * dA + dB * dB;
        if (d < bestD) {
          bestD = d;
          bestC = k;
        }
      }
      if (assign[i] !== bestC) {
        assign[i] = bestC;
        moved++;
      }
    }

    if (iteration > 0 && moved === 0) break;

    sumL.fill(0);
    sumA.fill(0);
    sumB.fill(0);
    count.fill(0);

    for (let i = 0; i < n; i++) {
      const k = assign[i];
      sumL[k] += L[i];
      sumA[k] += A[i];
      sumB[k] += B[i];
      count[k]++;
    }

    for (let k = 0; k < cap; k++) {
      if (count[k] === 0) {
        // Cluster vazio recebe a amostra mais distante do próprio centro, em vez
        // de ficar ocupando uma das 256 vagas sem descrever nada.
        let farthest = 0;
        let farthestD = -1;
        for (let i = 0; i < n; i++) {
          const c = assign[i];
          const dL = L[i] - cL[c];
          const dA = A[i] - cA[c];
          const dB = B[i] - cB[c];
          const d = dL * dL + dA * dA + dB * dB;
          if (d > farthestD) {
            farthestD = d;
            farthest = i;
          }
        }
        cL[k] = L[farthest];
        cA[k] = A[farthest];
        cB[k] = B[farthest];
        continue;
      }

      cL[k] = sumL[k] / count[k];
      cA[k] = sumA[k] / count[k];
      cB[k] = sumB[k] / count[k];
    }
  }

  const lab: Lab[] = [];
  for (let k = 0; k < cap; k++) lab.push({ L: cL[k], a: cA[k], b: cB[k] });

  // As cores de saída são a MÉDIA EM RGB dos pixels do cluster, e não a
  // conversão do centróide em Lab de volta. Voltar de Lab passa por um espaço
  // maior que o sRGB e o recorte desloca a cor — visível como um leve
  // deslocamento de matiz em tons saturados, justamente onde ele incomoda.
  const rSum = new Float64Array(cap);
  const gSum = new Float64Array(cap);
  const bSum = new Float64Array(cap);
  const rgbCount = new Int32Array(cap);

  for (let i = 0, s = 0; i < pixels; i += step, s++) {
    if (s >= n) break;
    const k = assign[s];
    rSum[k] += samples[i * 4];
    gSum[k] += samples[i * 4 + 1];
    bSum[k] += samples[i * 4 + 2];
    rgbCount[k]++;
  }

  const rgb = [];
  for (let k = 0; k < cap; k++) {
    if (rgbCount[k] === 0) {
      rgb.push({ r: 0, g: 0, b: 0 });
      continue;
    }
    rgb.push({
      r: Math.round(rSum[k] / rgbCount[k]),
      g: Math.round(gSum[k] / rgbCount[k]),
      b: Math.round(bSum[k] / rgbCount[k]),
    });
  }

  return { rgb, lab, exact: false };
}

/**
 * Encontra o índice da cor mais próxima, com cache.
 *
 * Sem o cache, mapear um quadro de 480x270 contra 256 cores são 33 milhões de
 * distâncias — por quadro. O cache é indexado pelos 5 bits altos de cada canal
 * (32768 posições) e preenchido sob demanda: só as cores que o vídeo realmente
 * tem chegam a custar uma busca, e a partir da segunda vez custam um índice.
 */
export class PaletteMapper {
  private readonly cache = new Int16Array(32768).fill(-1);

  constructor(private readonly palette: GifPalette) {}

  nearest(r: number, g: number, b: number): number {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cached = this.cache[key];
    if (cached >= 0) return cached;

    const target = rgbToLab(r, g, b);
    let bestD = Infinity;
    let bestI = 0;

    for (let i = 0; i < this.palette.lab.length; i++) {
      const c = this.palette.lab[i];
      const dL = target.L - c.L;
      const dA = target.a - c.a;
      const dB = target.b - c.b;
      const d = dL * dL + dA * dA + dB * dB;
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }

    this.cache[key] = bestI;
    return bestI;
  }
}

/**
 * Converte um quadro RGBA em índices de paleta.
 *
 * `dither` liga difusão de erro de Floyd–Steinberg, e é uma TROCA e não uma
 * melhoria: ela quebra a faixa de um degradê espalhando o erro nos vizinhos, e
 * ao mesmo tempo enche a imagem de ruído de alta frequência — que é exatamente
 * o que o LZW não consegue comprimir. Num vídeo, o mesmo ruído ainda muda de
 * lugar a cada quadro. Ligado, um GIF pode crescer bem mais que o dobro; por
 * isso quem chama decide, e a interface diz o que está trocando.
 */
export function mapFrame(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette: GifPalette,
  mapper: PaletteMapper,
  dither: boolean,
): Uint8Array {
  const out = new Uint8Array(width * height);

  if (!dither) {
    for (let i = 0; i < out.length; i++) {
      out[i] = mapper.nearest(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    }
    return out;
  }

  // O erro é acumulado em float, e não nos bytes da imagem: somar de volta em
  // Uint8Clamped satura em 0 e 255 e o erro se perde justamente nas áreas
  // escuras e claras, que é onde a faixa aparece.
  const errR = new Float32Array(width * height);
  const errG = new Float32Array(width * height);
  const errB = new Float32Array(width * height);

  const spread = (index: number, r: number, g: number, b: number, factor: number): void => {
    errR[index] += r * factor;
    errG[index] += g * factor;
    errB[index] += b * factor;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;

      const r = Math.max(0, Math.min(255, rgba[i * 4] + errR[i]));
      const g = Math.max(0, Math.min(255, rgba[i * 4 + 1] + errG[i]));
      const b = Math.max(0, Math.min(255, rgba[i * 4 + 2] + errB[i]));

      const index = mapper.nearest(Math.round(r), Math.round(g), Math.round(b));
      out[i] = index;

      const chosen = palette.rgb[index];
      const dr = r - chosen.r;
      const dg = g - chosen.g;
      const db = b - chosen.b;

      if (x + 1 < width) spread(i + 1, dr, dg, db, 7 / 16);
      if (y + 1 < height) {
        if (x > 0) spread(i + width - 1, dr, dg, db, 3 / 16);
        spread(i + width, dr, dg, db, 5 / 16);
        if (x + 1 < width) spread(i + width + 1, dr, dg, db, 1 / 16);
      }
    }
  }

  return out;
}
