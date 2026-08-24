import {
  applySpeed,
  clampSpeed,
  durationAfter,
  resampleLinear,
  semitonesToRatio,
  timeStretch,
} from './speed';

const RATE = 8000;

function sine(seconds: number, hz: number, rate = RATE): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

/**
 * A frequência medida por cruzamentos de zero ASCENDENTES, no MIOLO do sinal.
 *
 * Ascendentes porque contar todos daria o dobro — é o erro que faz um teste de
 * tom passar com uma oitava de diferença. E no miolo porque as pontas de um
 * esticamento por sobreposição têm meia janela de subida e outra de descida:
 * incluí-las mede um sinal que ainda não chegou ao regime, e o resultado sai
 * alguns por cento abaixo do real.
 */
function frequencyOf(signal: Float32Array, rate = RATE): number {
  const from = Math.floor(signal.length * 0.1);
  const to = Math.ceil(signal.length * 0.9);
  const span = signal.subarray(from, to);

  let crossings = 0;
  for (let i = 1; i < span.length; i++) {
    if (span[i - 1] <= 0 && span[i] > 0) crossings++;
  }

  return (crossings * rate) / span.length;
}

function rms(signal: Float32Array): number {
  let sum = 0;
  for (const v of signal) sum += v * v;
  return Math.sqrt(sum / Math.max(1, signal.length));
}

describe('speed', () => {
  describe('resampleLinear', () => {
    it('shortens and raises the pitch together, like a record played fast', () => {
      const out = resampleLinear(sine(1, 200), 2);

      expect(out.length).toBe(RATE / 2);
      expect(frequencyOf(out)).toBeCloseTo(400, -1);
    });

    it('lengthens and lowers the pitch together', () => {
      const out = resampleLinear(sine(1, 400), 0.5);

      expect(out.length).toBe(RATE * 2);
      expect(frequencyOf(out)).toBeCloseTo(200, -1);
    });

    it('is a copy at ratio 1, not the same array', () => {
      const input = sine(0.1, 300);
      const out = resampleLinear(input, 1);

      expect(out).not.toBe(input);
      expect(Array.from(out)).toEqual(Array.from(input));
    });
  });

  describe('timeStretch', () => {
    /** O ponto inteiro do WSOLA: a duração muda e o TOM não. */
    it('shortens the signal while keeping the pitch', () => {
      const out = timeStretch(sine(2, 300), 2, RATE);

      expect(out.length).toBe(RATE);
      expect(frequencyOf(out)).toBeCloseTo(300, -1);
    });

    it('lengthens the signal while keeping the pitch', () => {
      const out = timeStretch(sine(1, 300), 0.5, RATE);

      expect(out.length).toBe(RATE * 2);
      expect(frequencyOf(out)).toBeCloseTo(300, -1);
    });

    /**
     * A sobreposição é Hann com meio quadro de passo, então as janelas somam 1
     * e o nível não pode afundar. Um erro de normalização apareceria aqui como
     * um sinal mais fraco que a entrada.
     */
    it('keeps the level: overlapping Hann windows sum to one', () => {
      const input = sine(2, 300);
      const out = timeStretch(input, 1.5, RATE);

      expect(rms(out)).toBeCloseTo(rms(input), 1);
    });

    it('is a copy at factor 1', () => {
      const input = sine(0.5, 300);
      const out = timeStretch(input, 1, RATE);

      expect(out).not.toBe(input);
      expect(out.length).toBe(input.length);
    });
  });

  describe('applySpeed', () => {
    /** Modo "o tom acompanha": pitchRatio = speed, e sobra só a reamostragem. */
    it('with pitch following speed, both duration and pitch move', () => {
      const out = applySpeed(sine(2, 300), RATE, { speed: 2, pitchRatio: 2 });

      expect(out.length).toBe(RATE);
      expect(frequencyOf(out)).toBeCloseTo(600, -1);
    });

    /** Modo "tom preservado": pitchRatio = 1, e sobra só o esticamento. */
    it('with pitch held, the duration moves and the pitch does not', () => {
      const out = applySpeed(sine(2, 300), RATE, { speed: 2, pitchRatio: 1 });

      expect(out.length).toBe(RATE);
      expect(frequencyOf(out)).toBeCloseTo(300, -1);
    });

    /**
     * E o caso que só a composição resolve: mudar o TOM sem mudar a duração.
     * Ele cai fora dos dois modos do painel e sai de graça da mesma função.
     */
    it('can move the pitch alone, leaving the duration', () => {
      const input = sine(2, 300);
      const out = applySpeed(input, RATE, { speed: 1, pitchRatio: 2 });

      expect(out.length).toBeCloseTo(input.length, -2);
      expect(frequencyOf(out)).toBeCloseTo(600, -1);
    });
  });

  describe('helpers', () => {
    it('turns twelve semitones into an octave', () => {
      expect(semitonesToRatio(12)).toBeCloseTo(2, 6);
      expect(semitonesToRatio(-12)).toBeCloseTo(0.5, 6);
      expect(semitonesToRatio(0)).toBe(1);
    });

    it('clamps the speed to what stays recognisable', () => {
      expect(clampSpeed(10)).toBe(4);
      expect(clampSpeed(0.01)).toBe(0.25);
      expect(clampSpeed(1.5)).toBe(1.5);
    });

    it('predicts the resulting duration', () => {
      expect(durationAfter(120, 2)).toBe(60);
      expect(durationAfter(60, 0.5)).toBe(120);
    });
  });
});
