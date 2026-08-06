import { OUTSIDE, buildPlanarMap, cycleToPolyline } from './planar';

/**
 * O que estes testes protegem é a PROPRIEDADE que justifica o módulo existir:
 * duas regiões vizinhas referenciam o MESMO arco, e portanto a mesma geometria.
 * Um teste que só conferisse "o contorno está aproximadamente certo" passaria
 * igual com o traçado por região que este código substituiu — e a costura
 * voltaria sem nada ficar vermelho.
 */
describe('planar subdivision', () => {
  /** Constrói um mapa de rótulos a partir de um desenho ASCII, um char por
   *  região. Muito mais legível que Int32Array literal e é o que permite os
   *  casos topológicos abaixo caberem no teste. */
  function labelsOf(rows: string[]): { labels: Int32Array; w: number; h: number } {
    const h = rows.length;
    const w = rows[0].length;
    const alphabet = [...new Set(rows.join(''))].sort();
    const labels = new Int32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) labels[y * w + x] = alphabet.indexOf(rows[y][x]);
    }
    return { labels, w, h };
  }

  it('uma região só produz um ciclo, e ele é o quadro da imagem', () => {
    const { labels, w, h } = labelsOf(['aaa', 'aaa']);
    const map = buildPlanarMap(labels, w, h);

    expect(map.cycles.size).toBe(1);
    const cycles = map.cycles.get(0)!;
    expect(cycles.length).toBe(1);

    const poly = cycleToPolyline(map.arcs, cycles[0]);
    // O perímetro do reticulado 3x2 tem 10 arestas unitárias.
    expect(poly.length - 1).toBe(10);
  });

  /**
   * O TESTE CENTRAL. Duas regiões lado a lado dividem uma fronteira vertical.
   * A propriedade exigida não é "as duas fronteiras coincidem" — é que existe UM
   * arco, referenciado pelas duas. Se alguém reescrever isto para traçar região
   * a região, este teste falha mesmo que o desenho fique visualmente igual.
   */
  it('vizinhas COMPARTILHAM o mesmo arco, não duas cópias', () => {
    const { labels, w, h } = labelsOf(['aabb', 'aabb', 'aabb']);
    const map = buildPlanarMap(labels, w, h);

    const cyclesA = map.cycles.get(0)!;
    const cyclesB = map.cycles.get(1)!;
    expect(cyclesA.length).toBe(1);
    expect(cyclesB.length).toBe(1);

    const arcsA = new Set(cyclesA[0].map((r) => r.arc));
    const arcsB = new Set(cyclesB[0].map((r) => r.arc));
    const shared = [...arcsA].filter((id) => arcsB.has(id));

    expect(shared.length).toBe(1);

    // E é percorrido em sentidos OPOSTOS pelas duas — que é o que mantém as
    // duas com a região à esquerda.
    const refA = cyclesA[0].find((r) => r.arc === shared[0])!;
    const refB = cyclesB[0].find((r) => r.arc === shared[0])!;
    expect(refA.forward).not.toBe(refB.forward);

    // A fronteira compartilhada é a vertical em x=2, de y=0 a y=3.
    const arc = map.arcs[shared[0]];
    expect(arc.points.length).toBe(4);
    expect(arc.points.every((p) => p.x === 2)).toBe(true);
  });

  it('a região de fora nunca vira path', () => {
    const { labels, w, h } = labelsOf(['ab']);
    const map = buildPlanarMap(labels, w, h);
    expect(map.cycles.has(OUTSIDE)).toBe(false);
  });

  /**
   * Um buraco é um segundo ciclo da mesma região — e não uma região à parte.
   * Errar isto produz um SVG em que o buraco é pintado por cima com a cor do
   * fundo, o que parece certo sobre fundo branco e vaza assim que o SVG é posto
   * sobre qualquer outra coisa.
   */
  it('região com buraco produz dois ciclos', () => {
    const { labels, w, h } = labelsOf(['aaaaa', 'abbba', 'aaaaa']);
    const map = buildPlanarMap(labels, w, h);

    const cyclesA = map.cycles.get(0)!;
    expect(cyclesA.length).toBe(2);

    const cyclesB = map.cycles.get(1)!;
    expect(cyclesB.length).toBe(1);

    // O buraco de 'a' e o contorno de 'b' são o MESMO arco.
    const holeArcs = new Set(cyclesA.flatMap((c) => c.map((r) => r.arc)));
    const bArcs = cyclesB[0].map((r) => r.arc);
    expect(bArcs.every((id) => holeArcs.has(id))).toBe(true);
  });

  /**
   * Ponto tríplice: três regiões se encontram. É aqui que o arco TEM de
   * terminar — além do encontro a fronteira separa um par diferente, e um arco
   * com dois pares seria compartilhado errado por uma das regiões.
   */
  it('quebra o arco onde três regiões se encontram', () => {
    const { labels, w, h } = labelsOf(['aab', 'aab', 'ccc']);
    const map = buildPlanarMap(labels, w, h);

    for (const arc of map.arcs) {
      const crosses = arc.points.some((p, i) => i > 0 && i < arc.points.length - 1 && p.x === 2 && p.y === 2);
      expect(crosses).toBe(false);
    }
  });

  it('cada ciclo é fechado: termina onde começou', () => {
    const { labels, w, h } = labelsOf(['aabb', 'accb', 'aabb']);
    const map = buildPlanarMap(labels, w, h);

    for (const [, cycles] of map.cycles) {
      for (const cycle of cycles) {
        const poly = cycleToPolyline(map.arcs, cycle);
        expect(poly.length).toBeGreaterThan(2);
        expect(poly[0]).toEqual(poly[poly.length - 1]);
      }
    }
  });

  /**
   * Xadrez: duas regiões que só se tocam na diagonal. É o caso ambíguo do
   * reticulado (grau 4) e a razão de a segmentação usar 4-conectividade. Aqui só
   * se exige que o resultado seja consistente — nós, e não uma conexão
   * arbitrária que criaria um path auto-intersectante.
   */
  it('não trava nem gera ciclo aberto no xadrez', () => {
    const { labels, w, h } = labelsOf(['ab', 'ba']);
    const map = buildPlanarMap(labels, w, h);

    for (const [, cycles] of map.cycles) {
      for (const cycle of cycles) {
        const poly = cycleToPolyline(map.arcs, cycle);
        expect(poly[0]).toEqual(poly[poly.length - 1]);
      }
    }
  });

  /**
   * A INVARIANTE QUE O ENCADEAMENTO POR `pop()` QUEBRAVA.
   *
   * Todo arco de um ciclo tem de deixar a MESMA região à esquerda. Se o próximo
   * arco é escolhido arbitrariamente num nó onde três regiões se encontram, o
   * ciclo emenda a fronteira A|B com a fronteira A|C e passa a descrever um
   * contorno que não é o de região nenhuma — o `d` fecha, o navegador desenha, e
   * o resultado ganha linhas retas atravessando a figura. Foi o que aconteceu no
   * primeiro teste com quatro cores, e nenhum teste de duas regiões pegava.
   */
  it('todo arco de um ciclo deixa a MESMA região à esquerda', () => {
    // Muitos pontos tríplices de propósito: é onde a ambiguidade existe.
    const { labels, w, h } = labelsOf([
      'aabbcc',
      'aabbcc',
      'ddeeff',
      'ddeeff',
      'gghhii',
      'gghhii',
    ]);
    const map = buildPlanarMap(labels, w, h);

    for (const [region, cycles] of map.cycles) {
      for (const cycle of cycles) {
        for (const ref of cycle) {
          const arc = map.arcs[ref.arc];
          const onLeft = ref.forward ? arc.left : arc.right;
          expect(onLeft).toBe(region);
        }
      }
    }
  });

  /** Um ciclo que não fecha é um contorno aberto, e um contorno aberto vira
   *  exatamente a linha reta que o `z` desenha do fim de volta ao começo. */
  it('todo ciclo fecha, mesmo com pontos tríplices por toda parte', () => {
    const { labels, w, h } = labelsOf(['aabbcc', 'aabbcc', 'ddeeff', 'ddeeff', 'gghhii', 'gghhii']);
    const map = buildPlanarMap(labels, w, h);

    for (const [, cycles] of map.cycles) {
      for (const cycle of cycles) {
        const poly = cycleToPolyline(map.arcs, cycle);
        expect(poly[0]).toEqual(poly[poly.length - 1]);
      }
    }
  });

  it('toda aresta de fronteira é usada por exatamente um arco', () => {
    const { labels, w, h } = labelsOf(['aabbcc', 'aabbcc', 'ddbbcc', 'ddeeff']);
    const map = buildPlanarMap(labels, w, h);

    const seen = new Set<string>();
    for (const arc of map.arcs) {
      for (let i = 1; i < arc.points.length; i++) {
        const a = arc.points[i - 1];
        const b = arc.points[i];
        // Chave sem direção, para pegar a mesma aresta percorrida ao contrário.
        const key = [`${a.x},${a.y}`, `${b.x},${b.y}`].sort().join('|');
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });
});
