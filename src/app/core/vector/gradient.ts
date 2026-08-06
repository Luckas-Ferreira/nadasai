/**
 * DETECÇÃO DE DEGRADÊ — o segundo diferencial.
 *
 * O PROBLEMA
 *
 * Vetorizador trabalha com cor chapada: quantiza, segmenta, preenche cada região
 * com uma cor. Numa ilustração com sombreado — que é a maioria das ilustrações —
 * um degradê suave do azul-claro ao azul-escuro não tem "cores": tem uma rampa.
 * O quantizador é obrigado a cortá-la em faixas, e cada faixa vira uma região
 * com seu próprio contorno. O resultado tem três defeitos ao mesmo tempo:
 *
 *   - BANDEAMENTO visível, as faixas aparecendo como listras onde o original era
 *     liso — e o olho é especialmente bom em ver borda falsa em rampa suave
 *     (bandas de Mach);
 *   - o arquivo explode: uma esfera sombreada pode gastar 14 paths;
 *   - os contornos das faixas são ARBITRÁRIOS, definidos por onde o quantizador
 *     cortou, então editar aquilo depois é impossível.
 *
 * A SOLUÇÃO
 *
 * Antes de aceitar que uma região é chapada, tentar explicar o interior dela por
 * um degradê. Se um degradê linear (ou radial) reproduz os pixels com resíduo
 * abaixo do limiar, emite-se UM path com `<linearGradient>` no lugar de N faixas.
 *
 * COMO O AJUSTE FUNCIONA
 *
 * Um degradê linear diz: cor = f(projeção do pixel sobre um eixo). Então, para
 * cada canal, a cor é uma função AFIM das coordenadas — c(x,y) = α·x + β·y + γ.
 * Isso é regressão linear múltipla, resolvida em forma fechada por mínimos
 * quadrados sobre as somas de x, y, x², xy, y², c, cx, cy. Uma passada pelos
 * pixels da região, três canais, sem iteração.
 *
 * O eixo do degradê sai do gradiente (α, β) — que é a direção de maior variação —
 * e as paradas saem avaliando o plano nos extremos da projeção. O SVG expressa
 * exatamente isso com `gradientUnits="userSpaceOnUse"` e dois pontos.
 *
 * O ajuste é feito em RGB LINEAR e não em sRGB. O SVG interpola gradiente em
 * sRGB por padrão, mas a RAMPA física de uma sombra é linear em luz; ajustar em
 * sRGB faz o meio do degradê errar de forma sistemática (mais claro do que
 * deveria), e o erro é maior justamente nas rampas longas, que são as que mais
 * pagam a pena de virar gradiente. Os valores voltam para sRGB só na emissão.
 *
 * QUANDO RECUSAR
 *
 * O ajuste é aceito só se o resíduo máximo E o médio estiverem abaixo do limiar.
 * Só o médio deixaria passar uma região com um detalhe forte (um brilho
 * especular) diluído numa área grande — e o detalhe some. Recusar devolve a
 * região para o caminho chapado, que é sempre correto, só mais gordo.
 */

import { type Lab, rgbToLab, deltaE2000 } from './color';

export interface LinearGradient {
  readonly kind: 'linear';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly from: { r: number; g: number; b: number };
  readonly to: { r: number; g: number; b: number };
}

export interface RadialGradient {
  readonly kind: 'radial';
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly from: { r: number; g: number; b: number };
  readonly to: { r: number; g: number; b: number };
}

export type Gradient = LinearGradient | RadialGradient;

const toLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (v: number): number => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

export interface GradientFitOptions {
  /** ΔE2000 médio aceitável. */
  readonly meanTolerance: number;
  /** ΔE2000 máximo aceitável num pixel só. */
  readonly maxTolerance: number;
  /** Regiões menores que isto não valem um gradiente: o ganho de arquivo é
   *  negativo (um `<linearGradient>` custa mais bytes que um `fill`) e o ajuste
   *  em poucos pixels é instável. */
  readonly minArea: number;
}

export const DEFAULT_GRADIENT_FIT: GradientFitOptions = {
  meanTolerance: 2.0,
  maxTolerance: 7.0,
  minArea: 400,
};

/**
 * Tenta explicar os pixels de uma região por um degradê linear.
 *
 * @param pixels índices lineares (y*w+x) dos pixels da região
 * @returns o degradê, ou null se a região é melhor servida por cor chapada
 */
export function fitLinearGradient(
  pixels: Int32Array | readonly number[],
  rgba: Uint8ClampedArray,
  w: number,
  opts: GradientFitOptions = DEFAULT_GRADIENT_FIT,
): LinearGradient | null {
  const n = pixels.length;
  if (n < opts.minArea) return null;

  // Somas para a regressão. Centradas na média para condicionar o sistema: sem
  // centrar, com x na casa dos milhares, Sxx passa de 1e10 e o determinante
  // perde precisão de float justamente nas imagens grandes.
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    const p = pixels[i];
    mx += p % w;
    my += (p / w) | 0;
  }
  mx /= n;
  my /= n;

  let Sxx = 0;
  let Sxy = 0;
  let Syy = 0;
  const Sc = [0, 0, 0];
  const Scx = [0, 0, 0];
  const Scy = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    const p = pixels[i];
    const dx = (p % w) - mx;
    const dy = ((p / w) | 0) - my;
    Sxx += dx * dx;
    Sxy += dx * dy;
    Syy += dy * dy;

    for (let ch = 0; ch < 3; ch++) {
      const v = toLinear(rgba[p * 4 + ch]);
      Sc[ch] += v;
      Scx[ch] += v * dx;
      Scy[ch] += v * dy;
    }
  }

  const det = Sxx * Syy - Sxy * Sxy;
  // Região degenerada — uma linha de 1 px de espessura. Não há plano a ajustar.
  if (Math.abs(det) < 1e-9) return null;

  /** c(dx,dy) = base + gx*dx + gy*dy, por canal, em luz linear. */
  const base: number[] = [];
  const gx: number[] = [];
  const gy: number[] = [];

  for (let ch = 0; ch < 3; ch++) {
    gx.push((Scx[ch] * Syy - Scy[ch] * Sxy) / det);
    gy.push((Scy[ch] * Sxx - Scx[ch] * Sxy) / det);
    base.push(Sc[ch] / n);
  }

  // Eixo do degradê: a direção de maior variação, somando os três canais. Somar
  // os gradientes por canal (e não tomar o do verde, nem a média das direções)
  // é o que faz um degradê que vai de vermelho a azul — em que R e B variam em
  // sentidos opostos — não cancelar e produzir um eixo degenerado.
  let ax = 0;
  let ay = 0;
  for (let ch = 0; ch < 3; ch++) {
    // Pesos de luminância: o eixo deve seguir a variação que o olho vê.
    const wgt = ch === 0 ? 0.2126 : ch === 1 ? 0.7152 : 0.0722;
    ax += gx[ch] * wgt;
    ay += gy[ch] * wgt;
  }

  const alen = Math.hypot(ax, ay);
  // Plano quase constante: é cor chapada, e forçar gradiente aqui só gastaria
  // bytes com dois stops idênticos.
  if (alen < 1e-6) return null;
  ax /= alen;
  ay /= alen;

  // Extremos da projeção sobre o eixo.
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = pixels[i];
    const t = ((p % w) - mx) * ax + (((p / w) | 0) - my) * ay;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  if (tMax - tMin < 1e-6) return null;

  const colorAt = (t: number): { r: number; g: number; b: number } => {
    const dx = ax * t;
    const dy = ay * t;
    return {
      r: fromLinear(base[0] + gx[0] * dx + gy[0] * dy),
      g: fromLinear(base[1] + gx[1] * dx + gy[1] * dy),
      b: fromLinear(base[2] + gx[2] * dx + gy[2] * dy),
    };
  };

  const from = colorAt(tMin);
  const to = colorAt(tMax);

  // ---------------------------------------------------------------------------
  // Validação em ΔE2000. É o passo que impede o gradiente de ser aplicado onde
  // ele não descreve a região — sem ele, TODA região vira gradiente, inclusive
  // as que têm textura, e o resultado é pior que o chapado.
  // ---------------------------------------------------------------------------
  let sum = 0;
  let max = 0;

  // Amostra: validar 12 MP em ΔE2000 custa mais que todo o resto do pipeline. O
  // passo é primo em relação a larguras comuns para não amostrar sempre a mesma
  // coluna e cair numa faixa não representativa.
  const step = Math.max(1, Math.floor(n / 3000));
  let counted = 0;

  for (let i = 0; i < n; i += step) {
    const p = pixels[i];
    const t = ((p % w) - mx) * ax + (((p / w) | 0) - my) * ay;
    const pred = colorAt(t);
    const actual: Lab = rgbToLab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]);
    const d = deltaE2000(actual, rgbToLab(pred.r, pred.g, pred.b));
    sum += d;
    if (d > max) max = d;
    counted++;
  }

  const mean = counted > 0 ? sum / counted : Infinity;
  if (mean > opts.meanTolerance || max > opts.maxTolerance) return null;

  return {
    kind: 'linear',
    x1: mx + ax * tMin,
    y1: my + ay * tMin,
    x2: mx + ax * tMax,
    y2: my + ay * tMax,
    from,
    to,
  };
}

/**
 * Degradê radial, tentado quando o linear falha.
 *
 * O centro é o pixel de cor mais extrema em relação à média — não o centróide
 * geométrico. Um brilho especular fica DESCENTRADO por definição, e ancorar no
 * centróide produziria um radial concêntrico que erra exatamente onde o brilho
 * está, que é a parte que se queria capturar.
 */
export function fitRadialGradient(
  pixels: Int32Array | readonly number[],
  rgba: Uint8ClampedArray,
  w: number,
  opts: GradientFitOptions = DEFAULT_GRADIENT_FIT,
): RadialGradient | null {
  const n = pixels.length;
  if (n < opts.minArea) return null;

  let mean = 0;
  for (let i = 0; i < n; i++) {
    const p = pixels[i];
    mean += 0.2126 * toLinear(rgba[p * 4]) + 0.7152 * toLinear(rgba[p * 4 + 1]) + 0.0722 * toLinear(rgba[p * 4 + 2]);
  }
  mean /= n;

  let cx = 0;
  let cy = 0;
  let bestDev = -1;
  for (let i = 0; i < n; i++) {
    const p = pixels[i];
    const lum =
      0.2126 * toLinear(rgba[p * 4]) + 0.7152 * toLinear(rgba[p * 4 + 1]) + 0.0722 * toLinear(rgba[p * 4 + 2]);
    const dev = Math.abs(lum - mean);
    if (dev > bestDev) {
      bestDev = dev;
      cx = p % w;
      cy = (p / w) | 0;
    }
  }

  let rMax = 0;
  for (let i = 0; i < n; i++) {
    const p = pixels[i];
    rMax = Math.max(rMax, Math.hypot((p % w) - cx, ((p / w) | 0) - cy));
  }
  if (rMax < 1) return null;

  // Regressão de cor contra o RAIO — o mesmo mínimos quadrados do linear, numa
  // variável só.
  let Srr = 0;
  const Sr = [0, 0, 0];
  const Scr = [0, 0, 0];
  const Sc = [0, 0, 0];
  let Sr1 = 0;

  for (let i = 0; i < n; i++) {
    const p = pixels[i];
    const r = Math.hypot((p % w) - cx, ((p / w) | 0) - cy);
    Srr += r * r;
    Sr1 += r;
    for (let ch = 0; ch < 3; ch++) {
      const v = toLinear(rgba[p * 4 + ch]);
      Sc[ch] += v;
      Scr[ch] += v * r;
    }
    Sr[0] = Sr1;
  }

  const det = n * Srr - Sr1 * Sr1;
  if (Math.abs(det) < 1e-9) return null;

  const slope: number[] = [];
  const intercept: number[] = [];
  for (let ch = 0; ch < 3; ch++) {
    slope.push((n * Scr[ch] - Sr1 * Sc[ch]) / det);
    intercept.push((Sc[ch] * Srr - Sr1 * Scr[ch]) / det);
  }

  const colorAt = (r: number): { r: number; g: number; b: number } => ({
    r: fromLinear(intercept[0] + slope[0] * r),
    g: fromLinear(intercept[1] + slope[1] * r),
    b: fromLinear(intercept[2] + slope[2] * r),
  });

  const from = colorAt(0);
  const to = colorAt(rMax);

  let sum = 0;
  let max = 0;
  const step = Math.max(1, Math.floor(n / 3000));
  let counted = 0;

  for (let i = 0; i < n; i += step) {
    const p = pixels[i];
    const r = Math.hypot((p % w) - cx, ((p / w) | 0) - cy);
    const pred = colorAt(r);
    const d = deltaE2000(rgbToLab(rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]), rgbToLab(pred.r, pred.g, pred.b));
    sum += d;
    if (d > max) max = d;
    counted++;
  }

  if (counted === 0 || sum / counted > opts.meanTolerance || max > opts.maxTolerance) return null;

  return { kind: 'radial', cx, cy, r: rMax, from, to };
}
