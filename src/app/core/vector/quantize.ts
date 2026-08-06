/**
 * Quantização de cor por k-means em CIELAB.
 *
 * POR QUE NÃO MEDIAN-CUT / OCTREE
 *
 * São os dois algoritmos padrão de paleta e ambos particionam o cubo RGB por
 * eixo. Isso vale para GIF, onde o objetivo é minimizar erro de exibição. Aqui o
 * objetivo é outro: cada cor da paleta vira uma ou mais REGIÕES, e cada região
 * vira um `<path>`. Uma cor a mais não é um pouco mais de erro — é um conjunto
 * novo de contornos, com o custo de arquivo e de ruído que isso traz. Então a
 * pergunta certa não é "qual paleta reproduz melhor os pixels" e sim "quais
 * agrupamentos o olho aceita como uma cor só", que é uma pergunta perceptual e
 * só faz sentido em Lab.
 *
 * K AUTOMÁTICO
 *
 * Pedir "número de cores" ao usuário é o que todo vetorizador faz e é a razão
 * de o primeiro resultado ser sempre ruim: ninguém sabe se um logo tem 5 ou 9
 * cores. Aqui o k é buscado: roda-se o k-means para k crescente e para-se quando
 * juntar o par de centróides mais próximo ainda deixaria ΔE2000 acima do limiar
 * de percepção. Ou seja, o critério é "existe alguma cor na paleta que uma
 * pessoa confundiria com outra?" — se não existe, acrescentar cor é gastar path
 * à toa.
 *
 * INICIALIZAÇÃO
 *
 * k-means++ , não aleatória. Com semente aleatória dois centróides caem no mesmo
 * gradiente e o algoritmo converge para um mínimo local em que uma cor
 * importante e pequena (o vermelho de um logo, 2% da área) simplesmente não
 * ganha centróide — ela é absorvida e some do desenho. k-means++ escolhe cada
 * semente com probabilidade proporcional à distância ao que já foi escolhido,
 * que é exatamente a defesa contra isso.
 *
 * A escolha é DETERMINÍSTICA: um gerador com semente fixa, e não Math.random.
 * Vetorizar a mesma imagem duas vezes tem de dar o mesmo SVG, ou não há como
 * testar nem como o usuário confiar no que vê.
 */

import { type Lab, deltaE2000, deltaE76, labToRgb, rgbToLab } from './color';

export interface Palette {
  /** Índice de cor por pixel, comprimento w*h. */
  readonly indices: Int32Array;
  readonly colors: readonly Lab[];
  readonly rgb: ReadonlyArray<{ r: number; g: number; b: number }>;
}

/** PRNG determinístico (mulberry32). Ver o cabeçalho: reprodutibilidade. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface QuantizeOptions {
  /** Teto de cores. O k real pode ser menor se a imagem não precisar. */
  readonly maxColors: number;
  /** Piso de cores, para não colapsar um logo de 4 cores em 2. */
  readonly minColors: number;
  /** ΔE2000 abaixo do qual duas cores da paleta são "a mesma". ~2.3 é o JND
   *  clássico; valores maiores dão menos paths e mais chapado. */
  readonly mergeThreshold: number;
}

export const DEFAULT_QUANTIZE: QuantizeOptions = {
  maxColors: 16,
  minColors: 2,
  mergeThreshold: 2.3,
};

export function quantize(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  opts: QuantizeOptions = DEFAULT_QUANTIZE,
): Palette {
  const n = w * h;

  // Converter cada pixel para Lab uma vez. É a conta mais cara do módulo e
  // refazê-la por iteração multiplicaria o custo pelo número de iterações.
  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lab = rgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    L[i] = lab.L;
    A[i] = lab.a;
    B[i] = lab.b;
  }

  // Amostragem para a BUSCA de k. Rodar k-means completo sobre 12 MP por
  // candidato de k seria dezenas de segundos; a paleta de uma imagem é estável
  // com dezenas de milhares de amostras, e a atribuição final ainda passa por
  // todos os pixels.
  const sampleStep = Math.max(1, Math.floor(n / 40000));
  const sample: number[] = [];
  for (let i = 0; i < n; i += sampleStep) sample.push(i);

  let best: Lab[] | null = null;

  for (let k = opts.minColors; k <= opts.maxColors; k++) {
    const centers = kmeans(L, A, B, sample, k, rng(0x9e3779b9));

    // Existe par indistinguível? Então k já passou do ponto: o k anterior
    // descreve a imagem com menos paths e sem perda visível.
    let minPair = Infinity;
    for (let i = 0; i < centers.length; i++) {
      for (let j = i + 1; j < centers.length; j++) {
        minPair = Math.min(minPair, deltaE2000(centers[i], centers[j]));
      }
    }

    if (minPair < opts.mergeThreshold && best) break;
    best = centers;
    if (minPair < opts.mergeThreshold) break;
  }

  const colors = best ?? [{ L: 50, a: 0, b: 0 }];

  // Atribuição final, sobre todos os pixels.
  const indices = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let bestD = Infinity;
    let bestC = 0;
    for (let c = 0; c < colors.length; c++) {
      const dL = L[i] - colors[c].L;
      const dA = A[i] - colors[c].a;
      const dB = B[i] - colors[c].b;
      const d = dL * dL + dA * dA + dB * dB;
      if (d < bestD) {
        bestD = d;
        bestC = c;
      }
    }
    indices[i] = bestC;
  }

  return { indices, colors, rgb: colors.map(labToRgb) };
}

function kmeans(
  L: Float32Array,
  A: Float32Array,
  B: Float32Array,
  sample: readonly number[],
  k: number,
  rand: () => number,
): Lab[] {
  const centers = kmeansPlusPlus(L, A, B, sample, k, rand);

  // `k` é um PEDIDO; `centers.length` é o que a imagem comporta.
  //
  // O k-means++ para de semear quando toda amostra já está a distância zero de
  // algum centróide — isto é, quando a imagem tem menos cores distintas que o k
  // pedido. Um xadrez preto-e-branco com k=32 devolve 2. Continuar usando `k`
  // daqui para baixo lia `centers[2..31]`, que é `undefined`, e o erro só
  // aparecia como "Cannot read properties of undefined (reading 'L')" em plena
  // vetorização — longe da causa e sem dizer que o problema era a imagem ser
  // simples demais para o parâmetro.
  const kk = centers.length;

  const assign = new Int32Array(sample.length);
  const sumL = new Float64Array(kk);
  const sumA = new Float64Array(kk);
  const sumB = new Float64Array(kk);
  const count = new Int32Array(kk);

  for (let iter = 0; iter < 24; iter++) {
    let moved = false;

    for (let s = 0; s < sample.length; s++) {
      const i = sample[s];
      let bestD = Infinity;
      let bestC = 0;
      for (let c = 0; c < kk; c++) {
        const dL = L[i] - centers[c].L;
        const dA = A[i] - centers[c].a;
        const dB = B[i] - centers[c].b;
        const d = dL * dL + dA * dA + dB * dB;
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (assign[s] !== bestC) {
        assign[s] = bestC;
        moved = true;
      }
    }

    sumL.fill(0);
    sumA.fill(0);
    sumB.fill(0);
    count.fill(0);

    for (let s = 0; s < sample.length; s++) {
      const c = assign[s];
      const i = sample[s];
      sumL[c] += L[i];
      sumA[c] += A[i];
      sumB[c] += B[i];
      count[c]++;
    }

    for (let c = 0; c < kk; c++) {
      // Centróide órfão: manter onde está. Reposicionar aleatoriamente é o que
      // faz duas execuções darem paletas diferentes, e a reprodutibilidade é
      // requisito (ver cabeçalho).
      if (count[c] === 0) continue;
      centers[c] = { L: sumL[c] / count[c], a: sumA[c] / count[c], b: sumB[c] / count[c] };
    }

    if (!moved) break;
  }

  return centers;
}

function kmeansPlusPlus(
  L: Float32Array,
  A: Float32Array,
  B: Float32Array,
  sample: readonly number[],
  k: number,
  rand: () => number,
): Lab[] {
  const centers: Lab[] = [];
  const first = sample[Math.floor(rand() * sample.length)];
  centers.push({ L: L[first], a: A[first], b: B[first] });

  const d2 = new Float64Array(sample.length).fill(Infinity);

  while (centers.length < k) {
    const last = centers[centers.length - 1];
    let total = 0;

    for (let s = 0; s < sample.length; s++) {
      const i = sample[s];
      const dL = L[i] - last.L;
      const dA = A[i] - last.a;
      const dB = B[i] - last.b;
      const d = dL * dL + dA * dA + dB * dB;
      if (d < d2[s]) d2[s] = d;
      total += d2[s];
    }

    if (total === 0) break; // imagem com menos cores distintas que k

    let target = rand() * total;
    let picked = sample.length - 1;
    for (let s = 0; s < sample.length; s++) {
      target -= d2[s];
      if (target <= 0) {
        picked = s;
        break;
      }
    }
    const i = sample[picked];
    centers.push({ L: L[i], a: A[i], b: B[i] });
  }

  return centers;
}

/** Limiar de Otsu sobre luminância, para o modo traço. Escolhe o corte que
 *  maximiza a variância entre as duas classes — o que funciona sem parâmetro em
 *  digitalização, que é onde o modo traço vive. */
export function otsuThreshold(rgba: Uint8ClampedArray, n: number): number {
  const hist = new Int32Array(256);
  for (let i = 0; i < n; i++) {
    const y = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) | 0;
    hist[y]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  return threshold;
}

/** ΔE76 exposto para quem precisa comparar cor de região sem pagar ΔE2000. */
export { deltaE76 };
