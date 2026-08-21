import { dbToAmplitude, findSilence, type SilenceOptions } from './silence';

const RATE = 48_000;

const OPTS: SilenceOptions = {
  thresholdDb: -45,
  minSilenceSeconds: 0.5,
  keepPadding: 0.06,
};

/** Tom a -6 dBFS entre `from` e `to` (em segundos); silêncio no resto. */
function toneBetween(seconds: number, spans: Array<[number, number]>): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));

  for (const [from, to] of spans) {
    const a = Math.round(from * RATE);
    const b = Math.round(to * RATE);
    for (let i = a; i < b && i < out.length; i++) out[i] = Math.sin((i / RATE) * 2 * Math.PI * 440) * 0.5;
  }

  return out;
}

const seconds = (frames: number): number => frames / RATE;

describe('findSilence', () => {
  it('keeps everything when there is no silence long enough', () => {
    const tone = toneBetween(3, [[0, 3]]);

    const result = findSilence([tone], RATE, OPTS);

    expect(result.silenceCount).toBe(0);
    expect(result.removedFrames).toBe(0);
    expect(result.keep).toEqual([[0, tone.length]]);
  });

  /**
   * O caso central: fala, pausa longa, fala. O trecho removido tem de ser
   * MENOR que a pausa, porque as margens ficam nas duas pontas — cortar
   * exatamente onde o nível sobe come o ataque da consoante.
   */
  it('removes a long gap but leaves padding on both sides', () => {
    const audio = toneBetween(5, [
      [0, 1.5],
      [3.5, 5],
    ]);

    const result = findSilence([audio], RATE, OPTS);

    expect(result.silenceCount).toBe(1);

    const removed = seconds(result.removedFrames);
    // A pausa tem 2 s; com 60 ms de margem de cada lado sobra ~1,88 s.
    expect(removed).toBeGreaterThan(1.7);
    expect(removed).toBeLessThan(2.0);

    expect(result.keep.length).toBe(2);
    expect(result.keep[0][0]).toBe(0);
    expect(result.keep[result.keep.length - 1][1]).toBe(audio.length);
  });

  /**
   * A duração mínima é o que separa pausa de respiro. Sem ela, todo intervalo
   * entre sílabas some e o resultado sai atropelado — é o defeito clássico do
   * removedor de silêncio.
   */
  it('ignores gaps shorter than the minimum', () => {
    const audio = toneBetween(3, [
      [0, 1],
      [1.2, 3],
    ]);

    const result = findSilence([audio], RATE, OPTS);

    expect(result.silenceCount).toBe(0);
    expect(result.removedFrames).toBe(0);
  });

  it('finds several gaps in one pass', () => {
    const audio = toneBetween(9, [
      [0, 1],
      [3, 4],
      [6, 7],
    ]);

    const result = findSilence([audio], RATE, OPTS);

    // Três silêncios: [1,3], [4,6] e o final [7,9]. Os dois primeiros são
    // interiores e deixam margem; o terceiro vai até a borda. Sobram TRÊS
    // trechos, e não quatro — não há cauda a manter depois do último corte.
    expect(result.silenceCount).toBe(3);
    expect(result.keep.length).toBe(3);
    expect(result.keep[result.keep.length - 1][1]).toBeLessThan(audio.length);
  });

  /**
   * Um trecho só é silêncio se for silêncio em TODOS os canais. Cortar por
   * causa de um lado mudo apagaria o que está no outro — que é exatamente o
   * arquivo que traz gente à ferramenta de separar canais.
   */
  it('does not cut a passage that is loud on only one channel', () => {
    const loud = toneBetween(4, [[0, 4]]);
    const silent = new Float32Array(loud.length);

    const result = findSilence([loud, silent], RATE, OPTS);

    expect(result.silenceCount).toBe(0);
    expect(result.removedFrames).toBe(0);
  });

  it('cuts only where both channels are quiet', () => {
    const a = toneBetween(5, [
      [0, 1.5],
      [3.5, 5],
    ]);
    const b = toneBetween(5, [
      [0, 1.5],
      [3.5, 5],
    ]);

    expect(findSilence([a, b], RATE, OPTS).silenceCount).toBe(1);
  });

  /**
   * Um limiar mais alto acha mais silêncio. É a garantia de que o controle da
   * tela faz o que o rótulo diz.
   */
  it('finds more with a higher threshold', () => {
    // Trecho baixo (-50 dBFS) entre duas falas: passa por -45 e não por -60.
    const audio = toneBetween(5, [
      [0, 1.5],
      [3.5, 5],
    ]);
    const quiet = dbToAmplitude(-50);
    for (let i = Math.round(1.5 * RATE); i < Math.round(3.5 * RATE); i++) {
      audio[i] = Math.sin((i / RATE) * 2 * Math.PI * 300) * quiet;
    }

    expect(findSilence([audio], RATE, { ...OPTS, thresholdDb: -45 }).silenceCount).toBe(1);
    expect(findSilence([audio], RATE, { ...OPTS, thresholdDb: -60 }).silenceCount).toBe(0);
  });

  /**
   * Nas bordas do arquivo a margem não protege nada — não há vizinho de um dos
   * lados. Preservá-la ali deixaria 60 ms de silêncio no começo e no fim, que é
   * justamente o que quem remove silêncio quer ver sumir. Então o corte vai até
   * a borda, e o que sobra é UM trecho só.
   */
  it('trims leading and trailing silence all the way to the edge', () => {
    const audio = toneBetween(6, [[2, 4]]);

    const result = findSilence([audio], RATE, OPTS);

    expect(result.silenceCount).toBe(2);
    expect(result.keep.length).toBe(1);

    // A margem continua valendo do lado de DENTRO, protegendo o ataque.
    expect(seconds(result.keep[0][0])).toBeGreaterThan(1.9);
    expect(seconds(result.keep[0][0])).toBeLessThan(2.0);
    expect(seconds(result.keep[0][1])).toBeGreaterThan(4.0);
    expect(seconds(result.keep[0][1])).toBeLessThan(4.1);
  });

  it('answers empty for an empty buffer', () => {
    const result = findSilence([new Float32Array(0)], RATE, OPTS);

    expect(result.keep).toEqual([]);
    expect(result.removedFrames).toBe(0);
  });

  /**
   * Um silêncio menor que duas margens não vale um corte: encolhido dos dois
   * lados ele desaparece, e cortá-lo seria remover zero quadros e ainda assim
   * criar uma emenda.
   */
  it('does not cut a gap shorter than twice the padding', () => {
    const audio = toneBetween(4, [
      [0, 1.5],
      [2.1, 4],
    ]);

    const result = findSilence([audio], RATE, {
      ...OPTS,
      minSilenceSeconds: 0.4,
      keepPadding: 0.35,
    });

    expect(result.removedFrames).toBe(0);
  });
});
