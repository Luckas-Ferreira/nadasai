/**
 * Do RETICULADO para o SUB-PIXEL.
 *
 * O TRAÇADO NASCE COM UMA ESCADA QUE NÃO EXISTE NO DESENHO
 *
 * `planar.ts` anda pelos cantos de pixel, e essa é exatamente a propriedade que
 * faz duas regiões vizinhas compartilharem a MESMA fronteira. O preço é que a
 * fronteira só pode virar em ângulos retos: uma diagonal vira degrau, uma curva
 * vira escada de meio pixel de amplitude. Essa escada é artefato de amostragem —
 * ela não estava na imagem, e não pode chegar ao SVG.
 *
 * A DEFESA ANTIGA ERA A TOLERÂNCIA, E ELA COBRA CARO
 *
 * Enquanto o ajuste recebia a escada crua, a única defesa era pedir tolerância
 * alta o bastante para passar por cima dela — 1,1 a 1,6 px nos presets. Só que
 * tolerância é global: ela não distingue "ignore o degrau de meio pixel" de
 * "pode errar a curva inteira em um pixel e meio". Medido num círculo de raio
 * 100 com antialiasing, tolerância 1,4:
 *
 *     raio traçado entre 99,35 e 102,85 px  -> 3,5 px de ondulação
 *
 * Isso é o "serrilhado" que se vê na tela. A escada foi removida e substituída
 * por uma ondulação de baixa frequência, que é pior: escada de meio pixel some
 * de longe, ondulação de três pixels não.
 *
 * A SAÍDA É TIRAR A ESCADA ANTES, NÃO TOLERAR DEPOIS
 *
 * A escada é ruído de ALTA frequência (período de 1 a 3 pontos); a forma é baixa
 * frequência. Um filtro passa-baixa na polilinha separa os dois, e aí o ajuste
 * pode trabalhar com tolerância pequena — mais fiel E com menos nós, porque não
 * há mais ruído para reproduzir.
 *
 * POR QUE TAUBIN E NÃO LAPLACIANO
 *
 * O laplaciano puro (p += λ(média dos vizinhos - p)) encolhe: com as pontas
 * fixas ele converge para a RETA entre elas, então um arco de círculo vira corda.
 * O Taubin (1995) alterna um passo λ>0 com um passo μ<-λ; o segundo desfaz o
 * encolhimento nas frequências baixas e mantém a atenuação nas altas. É a mesma
 * razão de ele ser o padrão em suavização de malha 3D: suavizar sem derreter.
 *
 * DUAS TRAVAS, E AS DUAS SÃO NECESSÁRIAS
 *
 * 1. CANTOS SÃO FIXOS. Um canto reto é sinal, não ruído — e é a primeira coisa
 *    que qualquer suavização come. `detectCorners` roda antes deste filtro (mas
 *    DEPOIS da busca sub-pixel abaixo — ver a ordem em `vectorize.ts`), e os
 *    índices marcados não se movem. Sem isso o "L" de um logo vira gancho.
 *
 * 2. DESLOCAMENTO MÁXIMO. Nenhum ponto se afasta mais que `maxShift` do canto de
 *    pixel de onde saiu. A escada tem amplitude de meio pixel, então 0,8 px é
 *    folga suficiente para removê-la e pouco para inventar geometria: o que o
 *    filtro não conseguir explicar como ruído fica onde estava, em vez de
 *    escorregar. É a diferença entre suavizar e apagar.
 *
 * E AS PONTAS DOS ARCOS NÃO SE MOVEM NUNCA
 *
 * A ponta de um arco é um NÓ da subdivisão planar — o ponto onde três ou mais
 * regiões se encontram. Ele pertence a vários arcos ao mesmo tempo, e cada arco
 * é suavizado isoladamente: se cada um puxasse o nó para um lado, as fronteiras
 * que se encontravam ali deixariam de se encontrar, e a costura que `planar.ts`
 * existe para eliminar voltaria pela porta dos fundos. Ciclos fechados não têm
 * nó nenhum, então ali todos os pontos podem andar.
 */

import type { Pt } from './fit';

/**
 * Cobertura em [0,1] num ponto CONTÍNUO da imagem: 0 do lado esquerdo do arco,
 * 1 do lado direito. `null` quando a leitura não serve (fora da imagem, ou as
 * duas cores próximas demais para o cruzamento significar alguma coisa).
 */
export type CoverageFn = (x: number, y: number) => number | null;

export interface RefineOptions {
  /** Pares de passos λ/μ. 0 desliga o filtro por completo. */
  readonly passes: number;
  /** Passo de suavização (positivo). */
  readonly lambda: number;
  /** Passo de des-encolhimento (negativo, e |μ| > λ). */
  readonly mu: number;
  /** Teto de deslocamento em pixels, medido contra o ponto original. */
  readonly maxShift: number;
}

export const DEFAULT_REFINE: RefineOptions = { passes: 8, lambda: 0.5, mu: -0.53, maxShift: 0.8 };

/** Pixel art não tem escada para tirar: a escada É o desenho. */
export const NO_REFINE: RefineOptions = { passes: 0, lambda: 0, mu: 0, maxShift: 0 };

/**
 * Põe cada ponto do arco onde a BORDA REALMENTE ESTÁ, lendo o antialiasing.
 *
 * ESTE É O PASSO QUE SEPARA UM TRAÇADOR DE UM VETORIZADOR
 *
 * O filtro passa-baixa acima tira a escada de período curto e não pode tirar
 * mais que isso: perto dos eixos de uma curva os degraus têm período longo
 * (numa borda de inclinação 1/20 o degrau dura 20 px), e nessa frequência a
 * escada e a CURVATURA VERDADEIRA são a mesma coisa. Nenhum filtro que só olhe
 * a polilinha consegue separá-las — a informação não está lá.
 *
 * Ela está na imagem. Um pixel na borda de um desenho com antialiasing não é
 * "dentro" nem "fora": ele carrega a FRAÇÃO de cobertura, e essa fração diz onde
 * a borda passa dentro do pixel com precisão muito melhor que o pixel. É a mesma
 * informação que o olho usa para ver uma linha diagonal lisa numa tela quadrada.
 *
 * Então: para cada ponto do traçado, anda-se na direção NORMAL lendo a imagem, e
 * o ponto é remontado onde a cobertura cruza 0,5 — a fronteira real entre as
 * duas cores. O reticulado deixa de ser a resolução do resultado; ele vira só o
 * ponto de partida da busca.
 *
 * Medido no círculo de raio 100 com antialiasing (min..max do raio traçado, com
 * o SVG rasterizado em 4x para que a medida não seja o próprio arredondamento):
 *
 *     só reticulado, tolerância 1,41  :  99,06 .. 101,80   (2,74 px)
 *     passa-baixa só, tolerância 0,45 :  98,70 .. 102,45   (3,75 px — PIOR:
 *                                        sem a leitura da imagem, baixar a
 *                                        tolerância só manda o ajuste seguir
 *                                        a escada que sobrou)
 *     com esta busca sub-pixel        :  99,88 .. 101,01   (1,13 px)
 *
 * TRÊS COISAS QUE NÃO SE MOVEM
 *
 *   - as PONTAS de arco aberto, porque são nós compartilhados por vários arcos e
 *     cada um os empurraria para um lado (a costura voltaria pela porta dos
 *     fundos — ver o cabeçalho deste arquivo);
 *   - os CANTOS, porque ali a normal é ambígua: existem duas bordas, e projetar
 *     numa delas arrasta o canto ao longo da outra;
 *   - qualquer ponto cuja leitura não achou cruzamento — sem informação, o
 *     reticulado é a melhor estimativa que existe, e inventar seria pior.
 */
export function snapToCoverage(
  pts: readonly Pt[],
  closed: boolean,
  pinned: readonly boolean[],
  coverage: CoverageFn,
  maxShift = 1,
): Pt[] {
  const n = pts.length;
  const out = pts.map((p) => ({ x: p.x, y: p.y }));
  if (n < 4) return out;

  const cyclic = closed && pts[0].x === pts[n - 1].x && pts[0].y === pts[n - 1].y;
  const m = cyclic ? n - 1 : n;
  if (m < 3) return out;

  // Passo da busca. 0,25 px é bem abaixo do que a cobertura de um pixel pode
  // resolver e mantém a conta curta: 11 leituras por ponto.
  const STEP = 0.25;
  const REACH = 1.25;

  for (let i = 0; i < m; i++) {
    if (!cyclic && (i === 0 || i === m - 1)) continue;
    if (pinned[i]) continue;

    const prev = pts[cyclic ? (i - 1 + m) % m : i - 1];
    const next = pts[cyclic ? (i + 1) % m : i + 1];

    // Tangente pela corda dos vizinhos. Num reticulado a corda de dois pontos só
    // sabe dizer 0°/90°; a dos vizinhos já distingue a diagonal.
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty);
    if (len === 0) continue;

    // Normal apontando para a região da DIREITA de quem percorre o arco. Em
    // coordenadas de tela (y para baixo), a direita de quem anda para +x é +y.
    const nx = -ty / len;
    const ny = tx / len;

    const p = pts[i];
    let best: number | null = null;

    // O cruzamento mais PRÓXIMO do ponto atual, varrendo de dentro para fora em
    // pares (+t, -t): numa forma fina existe outra borda logo adiante, e pegar a
    // primeira da varredura linear costuraria o ponto na borda errada.
    for (let k = 1; k <= REACH / STEP && best === null; k++) {
      for (const dir of [1, -1]) {
        const t0 = STEP * (k - 1) * dir;
        const t1 = STEP * k * dir;
        const a = coverage(p.x + nx * t0, p.y + ny * t0);
        const b = coverage(p.x + nx * t1, p.y + ny * t1);
        if (a === null || b === null) continue;
        if ((a - 0.5) * (b - 0.5) > 0) continue; // sem troca de lado neste passo
        if (a === b) continue;

        best = t0 + ((0.5 - a) / (b - a)) * (t1 - t0);
        break;
      }
    }

    if (best === null) continue;
    const t = Math.max(-maxShift, Math.min(maxShift, best));
    out[i] = { x: p.x + nx * t, y: p.y + ny * t };
  }

  if (cyclic) out[n - 1] = { x: out[0].x, y: out[0].y };
  return out;
}

/**
 * Põe cada CANTO onde as duas bordas que o formam se cruzam.
 *
 * O canto é o único ponto do traçado que a busca por cobertura não sabe mexer:
 * ali existem duas bordas e a normal é ambígua, então ele fica onde o reticulado
 * o deixou — até 1 px fora do lugar, e sem correlação com as duas bordas
 * vizinhas, que JÁ foram levadas para o sub-pixel. Medido num losango de ponta
 * em (120,40): o canto saía em (118,98 , 40,81).
 *
 * O erro não fica contido no canto. Como os vizinhos estão certos e ele não, o
 * ajuste vê um joelho de um pixel logo depois da esquina e gasta uma cúbica
 * inteira para descrevê-lo — no losango, cada lado saía com duas curvas em vez
 * de uma reta, e o "bico" ficava cego. É a mesma assinatura que se vê em logo
 * vetorizado por ferramenta comum: quinas levemente cortadas com um sobressalto
 * ao lado.
 *
 * A construção certa é a que um desenhista faria: as duas bordas são retas
 * conhecidas, o canto é a INTERSEÇÃO delas. Cada lado é ajustado por mínimos
 * quadrados totais (PCA) sobre alguns pontos já refinados, ignorando os dois
 * imediatamente colados na esquina — ali a cobertura do pixel mistura as duas
 * bordas e a leitura não vale.
 *
 * Recusa em três casos, e recusar é sempre voltar ao ponto do reticulado:
 * poucos pontos de um dos lados, retas quase paralelas (a interseção dispara
 * para o infinito), ou interseção longe demais do canto original — que é o sinal
 * de que a suposição "duas retas" não descrevia aquela esquina.
 */
export function snapCorners(
  pts: readonly Pt[],
  closed: boolean,
  pinned: readonly boolean[],
  maxShift = 2,
): Pt[] {
  const n = pts.length;
  const out = pts.map((p) => ({ x: p.x, y: p.y }));
  if (n < 8) return out;

  const cyclic = closed && pts[0].x === pts[n - 1].x && pts[0].y === pts[n - 1].y;
  const m = cyclic ? n - 1 : n;

  const at = (i: number, dir: 1 | -1, k: number): number | null => {
    const j = i + dir * k;
    const idx = cyclic ? ((j % m) + m) % m : j;
    if (!cyclic && (idx < 0 || idx >= m)) return null;
    return idx;
  };

  /**
   * Pontos de um lado do canto. Começa no TERCEIRO — os dois colados na esquina
   * caem dentro do pixel onde as duas bordas se misturam, e a busca por cobertura
   * devolve ali um ponto que não pertence a nenhuma das duas retas. Incluí-los na
   * regressão puxava a interseção meio pixel para dentro.
   */
  const side = (i: number, dir: 1 | -1): Pt[] => {
    const picked: Pt[] = [];
    for (let k = 3; k <= 9; k++) {
      const idx = at(i, dir, k);
      if (idx === null) break;
      if (pinned[idx]) break; // outro canto: a reta acaba aqui
      picked.push(pts[idx]);
    }
    return picked;
  };

  for (let i = 0; i < m; i++) {
    if (!pinned[i]) continue;
    if (!cyclic && (i === 0 || i === m - 1)) continue;

    const a = side(i, -1);
    const b = side(i, 1);
    if (a.length < 3 || b.length < 3) continue;

    const la = fitLine(a);
    const lb = fitLine(b);
    if (!la || !lb) continue;

    const cross = la.dx * lb.dy - la.dy * lb.dx;
    /**
     * |cross| é o seno do ângulo entre as retas, e o piso de 30° não é folga
     * numérica — é o que impede este passo de CORTAR CURVA.
     *
     * Num arco de raio 70, os dois trechos usados aqui (±3 a ±9 pontos) formam
     * entre si cerca de 15°, e a "interseção" das duas retas cai bem para dentro
     * do arco. Se um canto falso escapar da detecção, mover o ponto para lá
     * arranca uma corda de até dois pixels: medido, o mesmo círculo de raio 70
     * traçado entre 67,99 e 71,11 px. Com o piso em 30°, uma curva nunca é
     * confundida com esquina e o pior caso do falso positivo volta a ser só um
     * nó a mais.
     */
    if (Math.abs(cross) < 0.5) continue;

    const t = ((lb.x - la.x) * lb.dy - (lb.y - la.y) * lb.dx) / cross;
    const px = la.x + la.dx * t;
    const py = la.y + la.dy * t;
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    if (Math.hypot(px - pts[i].x, py - pts[i].y) > maxShift) continue;

    out[i] = { x: px, y: py };

    // E os dois vizinhos de cada lado voltam para a RETA do seu lado. São
    // justamente os que a busca por cobertura não soube ler, e deixá-los soltos
    // não é neutro: eles ficam fora das duas retas, o RDP não consegue
    // descartá-los e o ajuste gasta uma cúbica de 2 px em cada esquina só para
    // passar por cima do erro de leitura. No losango eram 26 nós para descrever
    // quatro linhas retas e quatro cantos.
    for (const [dir, line] of [
      [-1, la],
      [1, lb],
    ] as const) {
      for (let k = 1; k <= 2; k++) {
        const idx = at(i, dir, k);
        if (idx === null || pinned[idx]) continue;
        const q = pts[idx];
        const t2 = (q.x - line.x) * line.dx + (q.y - line.y) * line.dy;
        const projX = line.x + line.dx * t2;
        const projY = line.y + line.dy * t2;
        if (Math.hypot(projX - q.x, projY - q.y) > 1) continue;
        out[idx] = { x: projX, y: projY };
      }
    }
  }

  if (cyclic) out[n - 1] = { x: out[0].x, y: out[0].y };
  return out;
}

/** Reta por mínimos quadrados TOTAIS: centroide + direção principal. A regressão
 *  comum (y sobre x) não serve porque metade das bordas de um desenho é
 *  vertical, e ali ela é singular. */
function fitLine(p: readonly Pt[]): { x: number; y: number; dx: number; dy: number } | null {
  const n = p.length;
  let cx = 0;
  let cy = 0;
  for (const q of p) {
    cx += q.x;
    cy += q.y;
  }
  cx /= n;
  cy /= n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const q of p) {
    const dx = q.x - cx;
    const dy = q.y - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  // Autovetor do maior autovalor da matriz de covariância 2x2.
  const tr = sxx + syy;
  if (tr < 1e-9) return null;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lambda = tr / 2 + disc;

  let dx = sxy;
  let dy = lambda - sxx;
  if (Math.hypot(dx, dy) < 1e-9) {
    dx = lambda - syy;
    dy = sxy;
  }
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;

  return { x: cx, y: cy, dx: dx / len, dy: dy / len };
}

/**
 * Suaviza uma polilinha do reticulado para posições sub-pixel.
 *
 * @param pts    pontos de canto de pixel, na ordem do arco
 * @param closed o arco é um ciclo (primeiro ponto === último)
 * @param pinned índices que não podem se mover — os cantos detectados
 */
export function refineLattice(
  pts: readonly Pt[],
  closed: boolean,
  pinned: readonly boolean[],
  opts: RefineOptions = DEFAULT_REFINE,
): Pt[] {
  const n = pts.length;
  if (opts.passes <= 0 || n < 4) return pts.map((p) => ({ x: p.x, y: p.y }));

  // Num ciclo o último ponto é uma repetição do primeiro. Suavizar os dois como
  // se fossem independentes abriria o ciclo em um deles; aqui só o primeiro é
  // real e a cópia é reescrita no fim.
  const cyclic = closed && pts[0].x === pts[n - 1].x && pts[0].y === pts[n - 1].y;
  const m = cyclic ? n - 1 : n;
  if (m < 3) return pts.map((p) => ({ x: p.x, y: p.y }));

  let cur: Pt[] = [];
  for (let i = 0; i < m; i++) cur.push({ x: pts[i].x, y: pts[i].y });

  const movable = new Array<boolean>(m);
  for (let i = 0; i < m; i++) {
    // Ponta de arco aberto é nó da subdivisão: nunca anda. Ver o cabeçalho.
    const isEnd = !cyclic && (i === 0 || i === m - 1);
    movable[i] = !isEnd && !pinned[i];
  }

  const step = (factor: number): void => {
    const next: Pt[] = new Array(m);
    for (let i = 0; i < m; i++) {
      if (!movable[i]) {
        next[i] = cur[i];
        continue;
      }
      const a = cur[cyclic ? (i - 1 + m) % m : i - 1];
      const b = cur[cyclic ? (i + 1) % m : i + 1];
      const p = cur[i];
      next[i] = {
        x: p.x + factor * ((a.x + b.x) / 2 - p.x),
        y: p.y + factor * ((a.y + b.y) / 2 - p.y),
      };
    }
    cur = next;
  };

  for (let k = 0; k < opts.passes; k++) {
    step(opts.lambda);
    step(opts.mu);
  }

  // Trava de deslocamento, aplicada uma vez no fim contra o ponto ORIGINAL.
  // Aplicá-la a cada passo transformaria o filtro num outro filtro (o ponto
  // ficaria preso na casca da bola e a iteração seguinte partiria de lá).
  const out: Pt[] = new Array(n);
  for (let i = 0; i < m; i++) {
    const o = pts[i];
    let dx = cur[i].x - o.x;
    let dy = cur[i].y - o.y;
    const d = Math.hypot(dx, dy);
    if (d > opts.maxShift) {
      const s = opts.maxShift / d;
      dx *= s;
      dy *= s;
    }
    out[i] = { x: o.x + dx, y: o.y + dy };
  }
  if (cyclic) out[n - 1] = { x: out[0].x, y: out[0].y };

  return out;
}
