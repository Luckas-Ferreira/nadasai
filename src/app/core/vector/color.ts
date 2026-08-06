/**
 * sRGB <-> CIELAB e ΔE2000.
 *
 * Toda decisão de "estas duas cores são a mesma?" no vetorizador passa por aqui,
 * e nenhuma delas pode ser tomada em RGB. A distância euclidiana em RGB não tem
 * relação com o que o olho vê: (0,0,255) e (0,0,200) são 55 unidades e
 * praticamente indistinguíveis; (0,255,0) e (0,200,0) são os mesmos 55 e a
 * diferença é gritante. Um quantizador que agrupa em RGB gasta cores em azuis
 * escuros que ninguém separa e junta verdes que todo mundo separa — é a origem
 * do "bandeamento em lugar errado" que caracteriza vetorizador ruim.
 *
 * CIELAB é aproximadamente uniforme e ΔE2000 corrige o que sobra (a elipse de
 * MacAdam no azul, a compressão do croma em cinzas). ΔE2000 ~1.0 é o limiar de
 * percepção para um observador treinado lado a lado; ~2.3 é o JND clássico.
 *
 * Sem dependência, como todo `core/` deste repositório.
 */

export interface Lab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

/** D65, o iluminante que o sRGB assume. */
const WHITE_X = 95.047;
const WHITE_Y = 100.0;
const WHITE_Z = 108.883;

/**
 * Linearização do sRGB. O trecho reto perto do zero não é detalhe: a curva pura
 * `x^2.4` tem derivada zero na origem, o que faz todo preto quase-puro colapsar
 * num valor só e destrói a separação de sombra — exatamente onde uma ilustração
 * escura precisa de mais resolução, não de menos.
 */
function toLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function fromLinear(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

function pivot(t: number): number {
  // 6/29 ao cubo. O ramo linear existe pelo mesmo motivo do de cima.
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27) * t / 116 + 4 / 29;
}

function unpivot(t: number): number {
  const t3 = t * t * t;
  return t3 > 216 / 24389 ? t3 : (116 * t - 16) / (24389 / 27);
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) * 100;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175) * 100;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) * 100;

  const fx = pivot(x / WHITE_X);
  const fy = pivot(y / WHITE_Y);
  const fz = pivot(z / WHITE_Z);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToRgb(lab: Lab): { r: number; g: number; b: number } {
  const fy = (lab.L + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;

  const x = (unpivot(fx) * WHITE_X) / 100;
  const y = (unpivot(fy) * WHITE_Y) / 100;
  const z = (unpivot(fz) * WHITE_Z) / 100;

  return {
    r: fromLinear(x * 3.2404542 + y * -1.5371385 + z * -0.4985314),
    g: fromLinear(x * -0.969266 + y * 1.8760108 + z * 0.041556),
    b: fromLinear(x * 0.0556434 + y * -0.2040259 + z * 1.0572252),
  };
}

/**
 * ΔE CIE2000.
 *
 * A fórmula é feia e é assim mesmo — é uma correção empírica ajustada a dados
 * de observadores, não uma métrica derivada de princípio nenhum. Vale escrever
 * inteira em vez de usar ΔE76 (euclidiana em Lab) porque o erro do ΔE76 se
 * concentra justamente no azul saturado e nos cinzas, que é onde logo e
 * ilustração vivem.
 */
export function deltaE2000(c1: Lab, c2: Lab): number {
  const kL = 1;
  const kC = 1;
  const kH = 1;

  const C1 = Math.hypot(c1.a, c1.b);
  const C2 = Math.hypot(c2.a, c2.b);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));

  const a1p = (1 + G) * c1.a;
  const a2p = (1 + G) * c2.a;

  const C1p = Math.hypot(a1p, c1.b);
  const C2p = Math.hypot(a2p, c2.b);

  const h1p = hueAngle(c1.b, a1p);
  const h2p = hueAngle(c2.b, a2p);

  const dLp = c2.L - c1.L;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) dhp = 0;
  else {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) dhp = diff;
    else if (diff > 180) dhp = diff - 360;
    else dhp = diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);

  const Lbarp = (c1.L + c2.L) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp: number;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else {
    const diff = Math.abs(h1p - h2p);
    const sum = h1p + h2p;
    if (diff <= 180) hbarp = sum / 2;
    else if (sum < 360) hbarp = (sum + 360) / 2;
    else hbarp = (sum - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const Rt = -Rc * Math.sin(rad(2 * dTheta));

  const Lbarp50 = (Lbarp - 50) ** 2;
  const Sl = 1 + (0.015 * Lbarp50) / Math.sqrt(20 + Lbarp50);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;

  const termL = dLp / (kL * Sl);
  const termC = dCp / (kC * Sc);
  const termH = dHp / (kH * Sh);

  return Math.sqrt(termL * termL + termC * termC + termH * termH + Rt * termC * termH);
}

function hueAngle(b: number, ap: number): number {
  if (ap === 0 && b === 0) return 0;
  const deg = (Math.atan2(b, ap) * 180) / Math.PI;
  return deg >= 0 ? deg : deg + 360;
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distância euclidiana em Lab (ΔE76). Barata, para os laços internos do k-means
 *  onde só a ordem relativa importa e o custo do ΔE2000 por pixel por iteração
 *  seria proibitivo. A decisão final de fundir cores usa ΔE2000. */
export function deltaE76(c1: Lab, c2: Lab): number {
  const dL = c1.L - c2.L;
  const da = c1.a - c2.a;
  const db = c1.b - c2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** Luminância relativa (WCAG), para decidir o limiar do modo traço. */
export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
