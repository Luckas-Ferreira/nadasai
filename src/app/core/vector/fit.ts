/**
 * Detecção de canto, simplificação e ajuste de Bézier cúbica.
 *
 * É aqui que se decide se o resultado parece DESENHADO ou TRAÇADO. As duas
 * falhas clássicas são simétricas e igualmente feias:
 *
 *   - suavizar tudo: o canto reto de um "L" vira uma curva mole, e um logo
 *     geométrico perde a identidade;
 *   - não suavizar nada: sobra a escada de pixel, e o SVG fica pior que o raster
 *     que ele substituiu.
 *
 * A saída é detectar os cantos ANTES de simplificar, tratá-los como âncoras
 * intocáveis, e ajustar cada trecho ENTRE cantos como uma curva independente. O
 * canto fica exatamente onde estava; o resto vira curva.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Uma cúbica: p0 -> c1 -> c2 -> p3. */
export interface Cubic {
  readonly p0: Pt;
  readonly c1: Pt;
  readonly c2: Pt;
  readonly p3: Pt;
}

// ---------------------------------------------------------------------------
// Cantos
// ---------------------------------------------------------------------------

/**
 * Marca os índices que são canto, por curvatura discreta.
 *
 * O ângulo é medido entre o vetor que CHEGA e o que SAI, com os braços tomados a
 * `span` pontos de distância — nunca entre vizinhos imediatos. Num traçado de
 * reticulado todo ponto é um degrau de 90°, então a curvatura ponto-a-ponto é
 * ruído puro: mediria canto em toda parte. O braço mais longo mede a tendência,
 * que é o que distingue "a borda está virando" de "a escada de pixel deu um
 * passo".
 *
 * @param maxAngle em graus. Ângulo de virada ACIMA disto é canto. ~60° separa
 *        bem o canto de um "L" (90°) de uma curva fechada de fonte (~30°).
 */
export function detectCorners(pts: readonly Pt[], closed: boolean, span = 3, maxAngle = 60): boolean[] {
  const n = pts.length;
  const corner = new Array<boolean>(n).fill(false);
  if (n < 3) return corner;

  /**
   * Num ciclo o último ponto é uma CÓPIA do primeiro, e ignorar isso custou um
   * canto por forma.
   *
   * Com o módulo tomado sobre `n`, o ponto de costura aparece duas vezes na
   * varredura, e as duas aparições são vizinhas uma da outra. O afinamento
   * abaixo então enxerga "dois cantos colados", mede os dois com braço de
   * comprimento zero (a distância entre uma cópia e a outra é zero), empata em
   * sharpness 0 e apaga um deles — justamente o do índice 0.
   *
   * O efeito não fica no canto. Sem a âncora, o ajuste trata a esquina como
   * ponto de passagem, impõe G1 ali e resolve as duas arestas vizinhas com
   * tangentes a 45°: elas saem com pontos de controle a um terço da corda FORA
   * da reta. Medido na moldura de uma imagem de 240x240, duas das quatro bordas
   * saíam como um S de ±10 px de amplitude — numa borda que é literalmente uma
   * linha reta de um pixel. Era a assinatura de "o recorte ficou estranho".
   */
  const dup = closed && pts[0].x === pts[n - 1].x && pts[0].y === pts[n - 1].y;
  const count = dup ? n - 1 : n;
  if (count < 3) return corner;

  const idx = (i: number): number =>
    closed ? ((i % count) + count) % count : Math.max(0, Math.min(n - 1, i));

  const cos = Math.cos((maxAngle * Math.PI) / 180);
  // Segunda escala, mais tolerante: um canto de verdade continua virando quando
  // se olha de mais longe, mas não precisa virar o mesmo tanto.
  const cosWide = Math.cos(((maxAngle * 0.6) * Math.PI) / 180);

  const from = closed ? 0 : 1;
  const to = closed ? count : n - 1;

  /** cos do ângulo entre chegada e saída, com braços de `s` pontos. 1 = reto,
   *  0 = 90°, -1 = volta. `null` quando um dos braços é degenerado. */
  const turn = (i: number, s: number): number | null => {
    const p = pts[idx(i)];
    const a = pts[idx(i - s)];
    const b = pts[idx(i + s)];

    const v1x = p.x - a.x;
    const v1y = p.y - a.y;
    const v2x = b.x - p.x;
    const v2y = b.y - p.y;

    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);
    if (l1 === 0 || l2 === 0) return null;

    return (v1x * v2x + v1y * v2y) / (l1 * l2);
  };

  /**
   * DUAS ESCALAS, e a segunda é o que separa canto de RUÍDO DE UM PIXEL.
   *
   * Uma escala só não consegue: um degrau isolado no reticulado — o pixel cuja
   * cobertura ficou em 0,49 quando os vizinhos ficaram em 0,51 — vira duas
   * viradas de 90° coladas, indistinguíveis de uma esquina para um braço de três
   * pontos. Um canto de verdade continua virando quando os braços dobram de
   * tamanho; o degrau, não: de longe ele é uma reta com um solavanco.
   *
   * O estrago do falso positivo não é só um nó a mais. O canto vira âncora, e
   * `snapCorners` então ajusta uma reta de cada lado dele e põe o ponto na
   * interseção — sobre uma curva, isso corta uma CORDA. Medido num círculo de
   * raio 70 desenhado pelo Chrome: o contorno traçado ia de 67,98 a 71,33 px,
   * três pixels de bossa, e era exatamente esse o "serrilhado" que sobrava
   * depois de todo o refino sub-pixel. Sem os cantos falsos: 69,89 a 70,67.
   *
   * A defesa PRINCIPAL contra isso não está aqui: é `vectorize.ts` chamar esta
   * função sobre a polilinha já levada ao sub-pixel, onde o ângulo medido é o
   * que a forma faz e não o que a escada fez (naquele círculo, 63° de ruído com
   * braço curto contra 10° de curva real). A segunda escala é o que sobra para
   * os trechos onde a busca por cobertura não achou borda e o ponto continua no
   * reticulado — em digitalização ruim e JPEG velho, isso é comum.
   *
   * A escala larga usa 60% do limiar de propósito. Exigir os mesmos graus nas
   * duas mataria o canto agudo de uma letra, onde os braços longos já entraram
   * na curva do outro lado da serifa.
   */
  const wide = span * 2;
  const wideFits = closed ? count > wide * 2 + 1 : n > wide * 2 + 1;

  for (let i = from; i < to; i++) {
    const c = turn(i, span);
    if (c === null || c >= cos) continue;

    if (wideFits) {
      const cw = turn(i, wide);
      if (cw !== null && cw >= cosWide) continue;
    }

    corner[idx(i)] = true;
  }

  // Cantos adjacentes são a mesma esquina medida duas vezes; manter só o mais
  // agudo evita dois nós colados e um segmento de curva de comprimento ~1.
  const thinned = thinCorners(pts, corner, closed, span, count);

  // A cópia do ponto de costura carrega a mesma marca do original, para quem
  // percorrer o array até o fim.
  if (dup) thinned[n - 1] = thinned[0];
  return thinned;
}

function thinCorners(
  pts: readonly Pt[],
  corner: boolean[],
  closed: boolean,
  span: number,
  count: number,
): boolean[] {
  const n = count;
  const out = corner.slice();
  const idx = (i: number): number => (closed ? ((i % n) + n) % n : i);

  const sharpness = (i: number): number => {
    // Num ciclo os braços dão a volta; num traçado aberto eles param na ponta.
    // Grampear o índice num ciclo (o que este código fazia) zerava o braço
    // esquerdo do ponto 0 e dava a ele sharpness 0 em qualquer desempate.
    const p = pts[idx(i)];
    const a = pts[closed ? idx(i - span) : Math.max(0, i - span)];
    const b = pts[closed ? idx(i + span) : Math.min(n - 1, i + span)];
    const v1x = p.x - a.x;
    const v1y = p.y - a.y;
    const v2x = b.x - p.x;
    const v2y = b.y - p.y;
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    return -((v1x * v2x + v1y * v2y) / (l1 * l2));
  };

  for (let i = 0; i < n; i++) {
    if (!out[idx(i)]) continue;
    for (let d = 1; d <= span; d++) {
      const j = idx(i + d);
      if (j !== idx(i) && out[j]) {
        if (sharpness(i) >= sharpness(i + d)) out[j] = false;
        else out[idx(i)] = false;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Simplificação
// ---------------------------------------------------------------------------

/**
 * Ramer-Douglas-Peucker, ANCORADO nos cantos.
 *
 * O RDP normal escolhe o ponto de maior desvio e recursa; se um canto não é esse
 * ponto num certo nível da recursão, ele é descartado e a esquina desaparece.
 * Aqui o traçado é primeiro quebrado nos cantos e cada trecho é simplificado
 * isoladamente, o que torna a preservação estrutural em vez de estatística.
 */
export function simplifyAnchored(pts: readonly Pt[], corner: readonly boolean[], epsilon: number): number[] {
  const n = pts.length;
  if (n < 3) return pts.map((_, i) => i);

  const anchors: number[] = [0];
  for (let i = 1; i < n - 1; i++) if (corner[i]) anchors.push(i);
  anchors.push(n - 1);

  const keep = new Set<number>();
  for (let a = 0; a < anchors.length - 1; a++) {
    rdp(pts, anchors[a], anchors[a + 1], epsilon, keep);
  }
  for (const a of anchors) keep.add(a);

  return [...keep].sort((x, y) => x - y);
}

function rdp(pts: readonly Pt[], first: number, last: number, epsilon: number, keep: Set<number>): void {
  keep.add(first);
  keep.add(last);
  if (last <= first + 1) return;

  const a = pts[first];
  const b = pts[last];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);

  let maxDist = -1;
  let maxIdx = -1;

  for (let i = first + 1; i < last; i++) {
    const p = pts[i];
    // Distância ponto-segmento. Com len 0 o segmento é um ponto e a distância
    // vira a euclidiana — sem esta guarda daria divisão por zero e NaN, que se
    // propaga silenciosamente até um `d` de path com "NaN" dentro.
    const dist =
      len === 0
        ? Math.hypot(p.x - a.x, p.y - a.y)
        : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;

    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon && maxIdx > 0) {
    rdp(pts, first, maxIdx, epsilon, keep);
    rdp(pts, maxIdx, last, epsilon, keep);
  }
}

// ---------------------------------------------------------------------------
// Ajuste de curva (Schneider, Graphics Gems 1990)
// ---------------------------------------------------------------------------

/**
 * Ajusta uma sequência de pontos por uma ou mais cúbicas.
 *
 * Mínimos quadrados sobre a base de Bernstein, com parametrização por
 * comprimento de corda, refinada por Newton-Raphson e subdividida onde o erro
 * máximo passa da tolerância. Subdividir no ponto de PIOR erro (e não no meio) é
 * o que faz uma curva longa e mansa custar uma cúbica só, enquanto um trecho
 * complicado ganha as que precisar.
 *
 * `tHat1`/`tHat2` são as tangentes impostas nas pontas. É por elas que a
 * continuidade G1 entra: dois trechos vizinhos que não são separados por canto
 * recebem a MESMA tangente na junção, e a emenda fica invisível. Sem isso, cada
 * trecho escolhe sua tangente e a curva ganha uma dobra sutil em cada junção —
 * o defeito que faz um vetor "parecer traçado" mesmo quando os pontos estão
 * certos.
 */
export function fitCurve(pts: readonly Pt[], error: number, tHat1?: Pt, tHat2?: Pt): Cubic[] {
  if (pts.length < 2) return [];
  if (pts.length === 2) {
    const dist = distance(pts[0], pts[1]) / 3;
    const t1 = tHat1 ?? normalize(sub(pts[1], pts[0]));
    const t2 = tHat2 ?? normalize(sub(pts[0], pts[1]));
    return [
      {
        p0: pts[0],
        c1: add(pts[0], scale(t1, dist)),
        c2: add(pts[1], scale(t2, dist)),
        p3: pts[1],
      },
    ];
  }

  const t1 = tHat1 ?? leftTangent(pts);
  const t2 = tHat2 ?? rightTangent(pts);
  return fitCubic(pts, 0, pts.length - 1, t1, t2, error);
}

function fitCubic(pts: readonly Pt[], first: number, last: number, tHat1: Pt, tHat2: Pt, error: number): Cubic[] {
  const nPts = last - first + 1;

  if (nPts === 2) {
    const dist = distance(pts[last], pts[first]) / 3;
    return [
      {
        p0: pts[first],
        c1: add(pts[first], scale(tHat1, dist)),
        c2: add(pts[last], scale(tHat2, dist)),
        p3: pts[last],
      },
    ];
  }

  let u = chordLengthParameterize(pts, first, last);
  let curve = generateBezier(pts, first, last, u, tHat1, tHat2);

  let { maxError, splitPoint } = computeMaxError(pts, first, last, curve, u);
  if (maxError < error) return [curve];

  // Reparametrizar só vale a pena quando já estamos perto; longe, o Newton
  // diverge e gasta iterações para piorar.
  if (maxError < error * error) {
    for (let i = 0; i < 4; i++) {
      const uPrime = reparameterize(pts, first, last, u, curve);
      curve = generateBezier(pts, first, last, uPrime, tHat1, tHat2);
      const r = computeMaxError(pts, first, last, curve, uPrime);
      if (r.maxError < error) return [curve];
      u = uPrime;
      maxError = r.maxError;
      splitPoint = r.splitPoint;
    }
  }

  // Subdivide no pior ponto. A tangente central é compartilhada pelos dois lados
  // (uma é a negativa da outra), o que dá G1 na emenda de graça.
  const centerTangent = centerTangentAt(pts, splitPoint);
  return [
    ...fitCubic(pts, first, splitPoint, tHat1, centerTangent, error),
    ...fitCubic(pts, splitPoint, last, negate(centerTangent), tHat2, error),
  ];
}

function generateBezier(pts: readonly Pt[], first: number, last: number, u: number[], tHat1: Pt, tHat2: Pt): Cubic {
  const nPts = last - first + 1;
  const A: Array<[Pt, Pt]> = [];

  for (let i = 0; i < nPts; i++) {
    A.push([scale(tHat1, b1(u[i])), scale(tHat2, b2(u[i]))]);
  }

  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;

  const p0 = pts[first];
  const p3 = pts[last];

  for (let i = 0; i < nPts; i++) {
    const [a0, a1] = A[i];
    c00 += dot(a0, a0);
    c01 += dot(a0, a1);
    c11 += dot(a1, a1);

    const t = u[i];
    const tmp = sub(pts[first + i], {
      x: p0.x * b0(t) + p0.x * b1(t) + p3.x * b2(t) + p3.x * b3(t),
      y: p0.y * b0(t) + p0.y * b1(t) + p3.y * b2(t) + p3.y * b3(t),
    });
    x0 += dot(a0, tmp);
    x1 += dot(a1, tmp);
  }

  const det = c00 * c11 - c01 * c01;
  let alphaL: number;
  let alphaR: number;

  if (Math.abs(det) < 1e-12) {
    // Sistema singular — acontece em trechos quase retos, onde as duas tangentes
    // são colineares. Cair no heurístico de 1/3 da corda é o que o Schneider faz,
    // e é visualmente indistinguível justamente porque o trecho é reto.
    const c = distance(p0, p3) / 3;
    alphaL = c;
    alphaR = c;
  } else {
    alphaL = (c11 * x0 - c01 * x1) / det;
    alphaR = (c00 * x1 - c01 * x0) / det;
  }

  const segLength = distance(p0, p3);
  const epsilon = 1e-6 * segLength;

  /**
   * O limite SUPERIOR é tão necessário quanto o inferior, e o Schneider original
   * só traz o inferior.
   *
   * Os mínimos quadrados devolvem o alfa que minimiza o erro nos pontos
   * amostrados — e nada nele impede que esse alfa seja enorme. Quando o sistema
   * fica mal condicionado (tangentes quase paralelas à corda, que é o caso comum
   * num traçado de reticulado com degraus de um pixel), a solução ótima "no
   * papel" põe o ponto de controle a centenas de pixels de distância. A curva
   * ainda passa perto dos pontos amostrados, mas ENTRE eles ela dispara para
   * fora e volta.
   *
   * Medido numa imagem de 200x150: ponto de controle a 801 px do ponto corrente,
   * 54 segmentos com deslocamento acima de 12 px. Na tela isso aparece como
   * linhas retas longas atravessando o desenho e saindo da moldura — que é
   * exatamente o defeito que parecia erro de topologia, e não era: os ciclos
   * estavam todos fechados e com a região certa.
   *
   * 1,5x a corda é generoso: uma cúbica bem comportada usa entre 0,33 e 1,0, e
   * acima de ~1,33 ela já forma laço. Fora da faixa, o heurístico de um terço da
   * corda é o mesmo que o Schneider usa no caso singular — visualmente
   * indistinguível justamente porque o trecho que chega aqui é curto.
   */
  const maxAlpha = segLength * 1.5;
  const bad = (a: number): boolean => !Number.isFinite(a) || a < epsilon || a > maxAlpha;

  if (bad(alphaL) || bad(alphaR)) {
    const c = segLength / 3;
    alphaL = c;
    alphaR = c;
  }

  return {
    p0,
    c1: add(p0, scale(tHat1, alphaL)),
    c2: add(p3, scale(tHat2, alphaR)),
    p3,
  };
}

function reparameterize(pts: readonly Pt[], first: number, last: number, u: number[], curve: Cubic): number[] {
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(newtonRaphson(curve, pts[i], u[i - first]));
  return out;
}

function newtonRaphson(q: Cubic, p: Pt, u: number): number {
  const qu = bezier(q, u);
  const q1 = derivative1(q);
  const q2 = derivative2(q1);

  const q1u = evalQuadratic(q1, u);
  const q2u = evalLinear(q2, u);

  const num = (qu.x - p.x) * q1u.x + (qu.y - p.y) * q1u.y;
  const den = q1u.x * q1u.x + q1u.y * q1u.y + (qu.x - p.x) * q2u.x + (qu.y - p.y) * q2u.y;

  if (Math.abs(den) < 1e-12) return u;
  return u - num / den;
}

function computeMaxError(
  pts: readonly Pt[],
  first: number,
  last: number,
  curve: Cubic,
  u: number[],
): { maxError: number; splitPoint: number } {
  let maxDist = 0;
  let splitPoint = Math.floor((last - first + 1) / 2) + first;

  for (let i = first + 1; i < last; i++) {
    const p = bezier(curve, u[i - first]);
    const dx = p.x - pts[i].x;
    const dy = p.y - pts[i].y;
    const dist = dx * dx + dy * dy;
    if (dist >= maxDist) {
      maxDist = dist;
      splitPoint = i;
    }
  }
  return { maxError: maxDist, splitPoint };
}

function chordLengthParameterize(pts: readonly Pt[], first: number, last: number): number[] {
  const u: number[] = [0];
  for (let i = first + 1; i <= last; i++) u.push(u[i - first - 1] + distance(pts[i], pts[i - 1]));
  const total = u[u.length - 1];
  // Traçado degenerado (todos os pontos iguais): dividir por zero produziria NaN
  // em todo ponto de controle, e um `d` com NaN não desenha nada e não avisa.
  if (total === 0) return u.map((_, i) => i / (u.length - 1 || 1));
  return u.map((v) => v / total);
}

// --- base de Bernstein -----------------------------------------------------
const b0 = (u: number): number => (1 - u) ** 3;
const b1 = (u: number): number => 3 * u * (1 - u) ** 2;
const b2 = (u: number): number => 3 * u * u * (1 - u);
const b3 = (u: number): number => u ** 3;

export function bezier(c: Cubic, t: number): Pt {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const cc = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * c.p0.x + b * c.c1.x + cc * c.c2.x + d * c.p3.x,
    y: a * c.p0.y + b * c.c1.y + cc * c.c2.y + d * c.p3.y,
  };
}

function derivative1(c: Cubic): [Pt, Pt, Pt] {
  return [
    scale(sub(c.c1, c.p0), 3),
    scale(sub(c.c2, c.c1), 3),
    scale(sub(c.p3, c.c2), 3),
  ];
}

function derivative2(q: [Pt, Pt, Pt]): [Pt, Pt] {
  return [scale(sub(q[1], q[0]), 2), scale(sub(q[2], q[1]), 2)];
}

function evalQuadratic(q: [Pt, Pt, Pt], t: number): Pt {
  const mt = 1 - t;
  return {
    x: mt * mt * q[0].x + 2 * mt * t * q[1].x + t * t * q[2].x,
    y: mt * mt * q[0].y + 2 * mt * t * q[1].y + t * t * q[2].y,
  };
}

function evalLinear(q: [Pt, Pt], t: number): Pt {
  return { x: (1 - t) * q[0].x + t * q[1].x, y: (1 - t) * q[0].y + t * q[1].y };
}

// --- tangentes -------------------------------------------------------------

/** Tangente inicial, medida sobre alguns pontos e não só sobre o primeiro par:
 *  no reticulado o primeiro par é sempre horizontal ou vertical, então uma
 *  tangente de dois pontos só sabe dizer 0°, 90°, 180° ou 270°. */
function leftTangent(pts: readonly Pt[], span = 3): Pt {
  const j = Math.min(span, pts.length - 1);
  return normalize(sub(pts[j], pts[0]));
}

function rightTangent(pts: readonly Pt[], span = 3): Pt {
  const n = pts.length - 1;
  const j = Math.max(0, n - span);
  return normalize(sub(pts[j], pts[n]));
}

function centerTangentAt(pts: readonly Pt[], i: number, span = 2): Pt {
  const a = pts[Math.max(0, i - span)];
  const b = pts[Math.min(pts.length - 1, i + span)];
  const t = normalize(sub(a, b));
  // Degenerado (a === b): devolver zero faria o ponto de controle colapsar sobre
  // o nó e a curva virar um bico. Uma direção qualquer é melhor que um bico.
  return t.x === 0 && t.y === 0 ? { x: 1, y: 0 } : t;
}

/** Tangente na junção entre dois trechos, para impor G1. */
export function tangentAtJoin(prev: Pt, at: Pt, next: Pt): Pt {
  const t = normalize(sub(next, prev));
  return t.x === 0 && t.y === 0 ? normalize(sub(at, prev)) : t;
}

// --- vetores ---------------------------------------------------------------
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const negate = (a: Pt): Pt => ({ x: -a.x, y: -a.y });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
const distance = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

function normalize(a: Pt): Pt {
  const l = Math.hypot(a.x, a.y);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}
