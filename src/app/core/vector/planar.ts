/**
 * A SUBDIVISÃO PLANAR — o diferencial que separa este vetorizador dos outros.
 *
 * O PROBLEMA QUE ELE RESOLVE
 *
 * Todo vetorizador da web traça cada região fechada isoladamente: pega a máscara
 * da região A, anda no contorno, ajusta curva, emite um `<path>`; repete para a
 * região B vizinha. As duas passam pela MESMA fronteira, mas cada uma ajusta a
 * própria curva, e dois ajustes independentes do mesmo traçado não dão o mesmo
 * resultado — o erro de aproximação cai para lados diferentes. O que sobra entre
 * eles é meio pixel de nada: a "costura", aquela linha de fundo aparecendo entre
 * duas cores que no original se encostavam. É o defeito mais visível de
 * vetorização e o mais difícil de consertar depois, porque não existe pós-
 * processamento que junte duas curvas que já foram decididas em separado.
 *
 * As gambiarras conhecidas são todas ruins: dilatar cada região em 0,5 px (gera
 * sobreposição, e aí a ORDEM de pintura decide a cor da fronteira — muda com o
 * z-order); ou desenhar tudo empilhado do maior para o menor (funciona só quando
 * as regiões são aninhadas, e falha em qualquer mapa/mosaico).
 *
 * A SOLUÇÃO
 *
 * Não traçar regiões. Traçar a SUBDIVISÃO PLANAR: extrair o grafo das fronteiras,
 * onde cada aresta entre duas regiões é um objeto único, traçado uma vez e
 * ajustado uma vez. Cada região referencia as arestas que a cercam, algumas no
 * sentido direto e outras no reverso. Duas regiões vizinhas então não têm
 * fronteiras "iguais" — têm a MESMA fronteira, o mesmo array de pontos. Costura
 * deixa de ser um bug a evitar e passa a ser impossível de expressar.
 *
 * Três ganhos de brinde:
 *   - o arquivo encolhe quase pela metade, porque cada fronteira interna era
 *     escrita duas vezes, uma em cada região;
 *   - abrir no Illustrator/Inkscape e mexer num nó move as duas regiões juntas,
 *     que é o que um humano espera de um desenho;
 *   - o ajuste de curva roda uma vez por fronteira em vez de duas.
 *
 * A REPRESENTAÇÃO
 *
 * O traçado NÃO acompanha centro de pixel — acompanha o RETICULADO DOS CANTOS.
 * Uma imagem W×H tem (W+1)×(H+1) pontos de canto, e toda fronteira entre dois
 * pixels de rótulo diferente é uma aresta unitária desse reticulado. Isso importa
 * porque é o que faz a fronteira ser exatamente a mesma para os dois lados: um
 * traçado por centro de pixel percorre pixels de A ou pixels de B, que são
 * conjuntos diferentes.
 *
 *   ponto de canto (i,j):  i em [0..W], j em [0..H]
 *   aresta vertical   em i=x+1, de (x+1,y) a (x+1,y+1)   <- entre pixel (x,y) e (x+1,y)
 *   aresta horizontal em j=y+1, de (x,y+1) a (x+1,y+1)   <- entre pixel (x,y) e (x,y+1)
 *
 * NÓS são os pontos de canto com grau != 2: onde três ou mais regiões se
 * encontram, e os quatro cantos da imagem. ARCOS são as cadeias maximais de
 * arestas unitárias entre dois nós — cada arco separa exatamente duas regiões ao
 * longo de todo o seu comprimento, que é a propriedade que permite ajustá-lo uma
 * vez e usá-lo dos dois lados.
 *
 * O fundo fora da imagem é a região OUTSIDE (-1), o que faz a borda da imagem ser
 * tratada pelo mesmo código de qualquer outra fronteira, sem caso especial.
 */

/** Rótulo da região virtual fora da imagem. */
export const OUTSIDE = -1;

export interface Arc {
  readonly id: number;
  /** Pontos de canto, do nó inicial ao final. Coordenadas do reticulado. */
  readonly points: ReadonlyArray<{ x: number; y: number }>;
  /** Região à ESQUERDA de quem percorre `points` na ordem dada. */
  readonly left: number;
  /** Região à DIREITA. */
  readonly right: number;
  /** Ciclo sem nó nenhum (ilha inteiramente cercada por uma única região). */
  readonly closed: boolean;
}

/** Um arco percorrido num sentido. `forward: false` significa `points` ao contrário. */
export interface ArcRef {
  readonly arc: number;
  readonly forward: boolean;
}

export interface PlanarMap {
  readonly arcs: readonly Arc[];
  /** Por região, os ciclos de fronteira. O primeiro é o contorno externo; os
   *  demais são buracos. Cada ciclo é uma sequência encadeada de arcos. */
  readonly cycles: ReadonlyMap<number, ReadonlyArray<readonly ArcRef[]>>;
}

const key = (x: number, y: number, w: number): number => y * (w + 1) + x;

/**
 * Monta o grafo planar a partir do mapa de rótulos.
 *
 * @param labels rótulo por pixel, comprimento w*h. Rótulos são inteiros >= 0.
 * @param w largura em pixels
 * @param h altura em pixels
 */
export function buildPlanarMap(labels: Int32Array, w: number, h: number): PlanarMap {
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? OUTSIDE : labels[y * w + x];

  // ---------------------------------------------------------------------------
  // 1. Arestas unitárias de fronteira.
  //
  // Guardadas por ponto de canto, em quatro direções. `hEdge[k]` = existe aresta
  // do canto k para o canto à direita; `vEdge[k]` = do canto k para o de baixo.
  // Duas arrays bastam para descrever o grafo inteiro sem duplicar aresta.
  // ---------------------------------------------------------------------------
  const nPts = (w + 1) * (h + 1);
  const hEdge = new Uint8Array(nPts); // (x,y) -> (x+1,y)
  const vEdge = new Uint8Array(nPts); // (x,y) -> (x,y+1)

  // Aresta horizontal em y separa o pixel de cima (x, y-1) do de baixo (x, y).
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y - 1) !== at(x, y)) hEdge[key(x, y, w)] = 1;
    }
  }
  // Aresta vertical em x separa o pixel da esquerda (x-1, y) do da direita (x, y).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x <= w; x++) {
      if (at(x - 1, y) !== at(x, y)) vEdge[key(x, y, w)] = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Grau de cada ponto de canto, e quais são nós.
  //
  // Grau 2 = meio de um arco (a fronteira só passa reto ou dobra). Grau 3 ou 4 =
  // encontro de três ou mais regiões, e ali o arco TEM de terminar: além desse
  // ponto a fronteira separa um par de regiões diferente, e um arco precisa ter
  // um único par para poder ser compartilhado.
  //
  // Grau 4 tem um caso ambíguo — o xadrez, em que duas regiões se tocam só na
  // diagonal. Tratar como nó resolve sem escolher uma conexão arbitrária.
  // ---------------------------------------------------------------------------
  const degree = new Uint8Array(nPts);
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      const k = key(x, y, w);
      let d = 0;
      if (x < w && hEdge[k]) d++;
      if (x > 0 && hEdge[key(x - 1, y, w)]) d++;
      if (y < h && vEdge[k]) d++;
      if (y > 0 && vEdge[key(x, y - 1, w)]) d++;
      degree[k] = d;
    }
  }

  const isNode = (k: number): boolean => degree[k] !== 0 && degree[k] !== 2;

  // ---------------------------------------------------------------------------
  // 3. Percorrer os arcos.
  // ---------------------------------------------------------------------------
  const arcs: Arc[] = [];
  const usedH = new Uint8Array(nPts);
  const usedV = new Uint8Array(nPts);

  /** As quatro direções, e para cada uma o par de regiões que a aresta separa
   *  quando percorrida NESSE sentido. `left`/`right` são relativos ao avanço,
   *  num sistema de coordenadas com y para BAIXO — então "esquerda" de quem anda
   *  para +x é o pixel de cima (y-1). Errar este sinal produz um SVG em que todo
   *  buraco vira preenchimento e vice-versa, e o sintoma (figura invertida) não
   *  aponta para cá de forma nenhuma. */
  const STEPS = [
    { dx: 1, dy: 0, horizontal: true, left: [0, -1], right: [0, 0] }, // →
    { dx: -1, dy: 0, horizontal: true, left: [-1, 0], right: [-1, -1] }, // ←
    { dx: 0, dy: 1, horizontal: false, left: [0, 0], right: [-1, 0] }, // ↓
    { dx: 0, dy: -1, horizontal: false, left: [-1, -1], right: [0, -1] }, // ↑
  ] as const;

  function edgeExists(x: number, y: number, dir: (typeof STEPS)[number]): boolean {
    if (dir.horizontal) {
      const ex = dir.dx > 0 ? x : x - 1;
      return ex >= 0 && ex < w && hEdge[key(ex, y, w)] === 1;
    }
    const ey = dir.dy > 0 ? y : y - 1;
    return ey >= 0 && ey < h && vEdge[key(x, ey, w)] === 1;
  }

  function edgeUsed(x: number, y: number, dir: (typeof STEPS)[number]): boolean {
    if (dir.horizontal) {
      const ex = dir.dx > 0 ? x : x - 1;
      return usedH[key(ex, y, w)] === 1;
    }
    const ey = dir.dy > 0 ? y : y - 1;
    return usedV[key(x, ey, w)] === 1;
  }

  function markUsed(x: number, y: number, dir: (typeof STEPS)[number]): void {
    if (dir.horizontal) {
      const ex = dir.dx > 0 ? x : x - 1;
      usedH[key(ex, y, w)] = 1;
    } else {
      const ey = dir.dy > 0 ? y : y - 1;
      usedV[key(x, ey, w)] = 1;
    }
  }

  /** Percorre um arco a partir de (sx,sy) na direção `dir0`, até um nó ou até
   *  fechar o ciclo. */
  function walk(sx: number, sy: number, dir0: (typeof STEPS)[number], closed: boolean): Arc | null {
    if (edgeUsed(sx, sy, dir0)) return null;

    const points: { x: number; y: number }[] = [{ x: sx, y: sy }];
    let x = sx;
    let y = sy;
    let dir = dir0;

    // O par de regiões é lido na PRIMEIRA aresta e vale para o arco inteiro —
    // é justamente essa invariante que os nós de grau != 2 garantem.
    const left = at(x + dir.left[0], y + dir.left[1]);
    const right = at(x + dir.right[0], y + dir.right[1]);

    for (;;) {
      markUsed(x, y, dir);
      x += dir.dx;
      y += dir.dy;
      points.push({ x, y });

      const k = key(x, y, w);
      if (isNode(k)) break;
      if (x === sx && y === sy) break; // ciclo fechado sem nó

      // Grau 2: existe exatamente uma continuação que não é voltar por onde veio.
      let next: (typeof STEPS)[number] | null = null;
      for (const cand of STEPS) {
        if (cand.dx === -dir.dx && cand.dy === -dir.dy) continue;
        if (edgeExists(x, y, cand) && !edgeUsed(x, y, cand)) {
          next = cand;
          break;
        }
      }
      if (!next) break;
      dir = next;
    }

    return {
      id: arcs.length,
      points,
      left,
      right,
      closed: closed && points.length > 1 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y,
    };
  }

  // Primeiro os arcos que começam em nós. Depois o que sobrar são ciclos puros.
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      const k = key(x, y, w);
      if (!isNode(k)) continue;
      for (const dir of STEPS) {
        if (!edgeExists(x, y, dir) || edgeUsed(x, y, dir)) continue;
        const arc = walk(x, y, dir, false);
        if (arc) arcs.push(arc);
      }
    }
  }

  // Ciclos sem nenhum nó: uma ilha cercada por uma região só (um disco dentro de
  // um fundo). Não têm ponto de partida canônico, então qualquer aresta ainda
  // não usada serve.
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      for (const dir of STEPS) {
        if (!edgeExists(x, y, dir) || edgeUsed(x, y, dir)) continue;
        const arc = walk(x, y, dir, true);
        if (arc) arcs.push(arc);
      }
    }
  }

  return { arcs, cycles: buildCycles(arcs) };
}

/**
 * Encadeia os arcos de cada região em ciclos fechados — POR ORDEM ANGULAR.
 *
 * Convenção: percorrer um ciclo deixa a região sempre à ESQUERDA. Uma região
 * pode ter vários ciclos — o externo e um por buraco — e é por isso que o
 * `<path>` sai com `fill-rule="evenodd"`.
 *
 * A ESCOLHA DO PRÓXIMO ARCO NÃO PODE SER ARBITRÁRIA, e essa foi a primeira
 * versão deste código: guardava os arcos num balde por ponto de partida e dava
 * `pop()`. Onde só duas regiões se encontram existe um candidato só e funciona;
 * num nó onde TRÊS regiões se encontram saem vários, e pegar qualquer um emenda
 * o fim de uma fronteira no começo de outra que passa pelo mesmo ponto mas
 * pertence a outro trecho do contorno. O `d` continua fechado e bem formado — o
 * desenho é que ganha linhas retas atravessando a figura de ponta a ponta, que
 * foi exatamente o sintoma no primeiro teste com quatro cores. Os testes de duas
 * regiões passavam, porque ali a ambiguidade não existe.
 *
 * O certo é a travessia de faces de grafo planar: ao chegar num nó pela direção
 * `din`, o próximo arco é o PRIMEIRO no sentido horário a partir de
 * `reverso(din)`. No reticulado só há quatro direções, então "ordem angular" é
 * uma tabela de quatro entradas e a escolha é exata, sem atan2 e sem empate.
 *
 * Verificação rápida com um quadrado: chegando em (2,2) indo para LESTE, o
 * reverso é OESTE e o primeiro horário depois de OESTE é NORTE — que é de fato
 * por onde o contorno sobe. Com `pop()`, seria sorte.
 */

/** 0=L 1=S 2=O 3=N. A ordem É horária na tela (y para baixo), e é isso que a
 *  travessia usa: girar +1 é girar no sentido horário. */
const DIR_E = 0;
const DIR_S = 1;
const DIR_W = 2;
const DIR_N = 3;

function directionOf(from: { x: number; y: number }, to: { x: number; y: number }): number {
  if (to.x > from.x) return DIR_E;
  if (to.x < from.x) return DIR_W;
  if (to.y > from.y) return DIR_S;
  return DIR_N;
}

interface Dart {
  readonly ref: ArcRef;
  readonly region: number;
  /** Nó de partida e direção do primeiro passo. */
  readonly fromKey: string;
  readonly startDir: number;
  /** Nó de chegada e direção do último passo. */
  readonly toKey: string;
  readonly endDir: number;
}

function buildCycles(arcs: readonly Arc[]): Map<number, ArcRef[][]> {
  const pt = (p: { x: number; y: number }): string => `${p.x},${p.y}`;

  // Duas passagens (darts) por arco: no sentido direto a região da esquerda é
  // `left`; no reverso é `right`. Cada dart pertence a exatamente um ciclo.
  const darts: Dart[] = [];

  for (const arc of arcs) {
    const p = arc.points;
    const n = p.length;
    if (n < 2) continue;

    darts.push({
      ref: { arc: arc.id, forward: true },
      region: arc.left,
      fromKey: pt(p[0]),
      startDir: directionOf(p[0], p[1]),
      toKey: pt(p[n - 1]),
      endDir: directionOf(p[n - 2], p[n - 1]),
    });

    darts.push({
      ref: { arc: arc.id, forward: false },
      region: arc.right,
      fromKey: pt(p[n - 1]),
      startDir: directionOf(p[n - 1], p[n - 2]),
      toKey: pt(p[0]),
      endDir: directionOf(p[1], p[0]),
    });
  }

  /** Por nó de partida e direção do primeiro passo. A direção é única por nó no
   *  reticulado: de um ponto só sai uma aresta para cada lado. */
  const byStart = new Map<string, Map<number, number>>();
  darts.forEach((d, i) => {
    let m = byStart.get(d.fromKey);
    if (!m) byStart.set(d.fromKey, (m = new Map()));
    m.set(d.startDir, i);
  });

  const used = new Uint8Array(darts.length);
  const out = new Map<number, ArcRef[][]>();

  for (let start = 0; start < darts.length; start++) {
    if (used[start]) continue;
    const region = darts[start].region;
    // A moldura infinita não vira path.
    if (region === OUTSIDE) {
      used[start] = 1;
      continue;
    }

    const cycle: ArcRef[] = [];
    let i = start;

    for (;;) {
      used[i] = 1;
      cycle.push(darts[i].ref);

      const d = darts[i];
      const candidates = byStart.get(d.toKey);
      if (!candidates) break;

      // Primeiro no sentido horário a partir do reverso da chegada. O laço vai
      // até +4 de propósito: a última tentativa é o próprio reverso, isto é, a
      // meia-volta, que é a resposta correta numa ponta sem saída — sem ela o
      // ciclo simplesmente pararia e deixaria um contorno aberto.
      const back = (d.endDir + 2) % 4;
      let next = -1;
      for (let k = 1; k <= 4; k++) {
        const cand = candidates.get((back + k) % 4);
        if (cand !== undefined) {
          next = cand;
          break;
        }
      }

      if (next < 0 || next === start) break;
      if (used[next]) break;
      i = next;
    }

    if (cycle.length > 0) {
      const list = out.get(region);
      if (list) list.push(cycle);
      else out.set(region, [cycle]);
    }
  }

  return out;
}

/** Expande um ciclo na polilinha fechada que ele descreve, no reticulado.
 *  Usado pelo ajuste de curva e pelos testes. */
export function cycleToPolyline(
  arcs: readonly Arc[],
  cycle: readonly ArcRef[],
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const ref of cycle) {
    const pts = arcs[ref.arc].points;
    const seq = ref.forward ? pts : [...pts].reverse();
    // O primeiro ponto de cada arco é o último do anterior — emitir os dois
    // duplicaria todo nó e faria o ajuste de curva ver um segmento de
    // comprimento zero, que produz tangente NaN.
    for (let i = out.length === 0 ? 0 : 1; i < seq.length; i++) out.push(seq[i]);
  }
  return out;
}
