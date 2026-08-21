import {
  applyChannelOperation,
  downmix,
  outputChannelCount,
  phaseCancellation,
} from './channels';

const ramp = (n: number, f: (i: number) => number): Float32Array =>
  Float32Array.from({ length: n }, (_, i) => f(i));

describe('channels', () => {
  describe('downmix', () => {
    /**
     * A conta é MÉDIA, não soma. Somar dois canais com o mesmo material dobra a
     * amplitude e estoura tudo que já estava acima de -6 dBFS — que é a maior
     * parte da música masterizada. Este teste é o que impede alguém de "simplificar"
     * a função tirando a divisão.
     */
    it('mixes by averaging, so identical channels keep their level', () => {
      const a = ramp(64, (i) => Math.sin(i / 5) * 0.8);
      const mono = downmix([a, a]);

      for (let i = 0; i < a.length; i++) {
        expect(mono[i]).toBeCloseTo(a[i], 6);
      }
    });

    // `toBeCloseTo` e não `toEqual`: Float32Array arredonda para precisão
    // simples, então 1/3 volta como 0,33333334 e uma comparação exata falha por
    // um detalhe do tipo, não da conta.
    it('averages across more than two channels', () => {
      const one = new Float32Array([1, 1, 1]);
      const zero = new Float32Array([0, 0, 0]);

      for (const value of downmix([one, zero, zero])) {
        expect(value).toBeCloseTo(1 / 3, 6);
      }
    });

    it('hands a single channel back untouched', () => {
      const only = new Float32Array([0.1, 0.2]);
      expect(downmix([only])).toBe(only);
    });
  });

  describe('applyChannelOperation', () => {
    const left = new Float32Array([1, 1, 1]);
    const right = new Float32Array([-1, -1, -1]);

    it('extracts one side without touching the samples', () => {
      expect(applyChannelOperation([left, right], 'left-only')).toEqual([left]);
      expect(applyChannelOperation([left, right], 'right-only')).toEqual([right]);
    });

    it('swaps the two sides', () => {
      expect(applyChannelOperation([left, right], 'swap')).toEqual([right, left]);
    });

    /**
     * Um mono virando estéreo é o MESMO sinal dos dois lados. Inventar
     * diferença entre eles seria inventar uma imagem estéreo que a gravação não
     * tem — e é o que "melhoradores de estéreo" fazem, mudando o som sem avisar.
     */
    it('widens mono by duplicating, never by inventing a difference', () => {
      const out = applyChannelOperation([left], 'to-stereo');

      expect(out.length).toBe(2);
      expect(out[0]).toBe(left);
      expect(out[1]).toBe(left);
    });

    it('leaves stereo alone when asked for stereo', () => {
      const out = applyChannelOperation([left, right], 'to-stereo');
      expect(out).toEqual([left, right]);
    });

    it('swapping a mono file is a no-op rather than an error', () => {
      expect(applyChannelOperation([left], 'swap')).toEqual([left]);
    });

    it('mixes to mono', () => {
      const out = applyChannelOperation([left, right], 'to-mono');
      expect(out.length).toBe(1);
      expect(Array.from(out[0])).toEqual([0, 0, 0]);
    });
  });

  describe('outputChannelCount', () => {
    it('reports what each operation produces', () => {
      expect(outputChannelCount('to-mono', 2)).toBe(1);
      expect(outputChannelCount('left-only', 2)).toBe(1);
      expect(outputChannelCount('right-only', 2)).toBe(1);
      expect(outputChannelCount('to-stereo', 1)).toBe(2);
      expect(outputChannelCount('swap', 2)).toBe(2);
      expect(outputChannelCount('swap', 1)).toBe(1);
    });
  });

  describe('phaseCancellation', () => {
    /**
     * O aviso existe porque o cancelamento é propriedade do SINAL, não da
     * conta: dois canais opostos em fase somem ao virar mono, e nenhuma
     * correção que a ferramenta fizesse seria honesta com os outros arquivos.
     * Dizer antes é a única saída.
     */
    it('reports total cancellation for opposite channels', () => {
      const a = ramp(4096, (i) => Math.sin(i / 7));
      const b = ramp(4096, (i) => -Math.sin(i / 7));

      expect(phaseCancellation([a, b])).toBeGreaterThan(0.99);
    });

    it('reports none for identical channels', () => {
      const a = ramp(4096, (i) => Math.sin(i / 7));

      expect(phaseCancellation([a, a])).toBeLessThan(0.01);
    });

    it('reports something in between for partially correlated channels', () => {
      const a = ramp(4096, (i) => Math.sin(i / 7));
      const b = ramp(4096, (i) => Math.sin(i / 11));

      const value = phaseCancellation([a, b]);
      expect(value).toBeGreaterThan(0.05);
      expect(value).toBeLessThan(0.95);
    });

    it('is zero for mono and for silence', () => {
      expect(phaseCancellation([new Float32Array(16)])).toBe(0);
      expect(phaseCancellation([new Float32Array(16), new Float32Array(16)])).toBe(0);
    });
  });
});
