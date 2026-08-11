import { applyGain, dbToGain, gainToDb, measureLoudness } from './loudness';

const RATE = 48000;

/**
 * Seno de `freq` Hz com amplitude de PICO `amp`, replicado em `channels` canais.
 *
 * Amplitude de pico, e não RMS, porque é assim que os sinais de teste da EBU
 * declaram o nível: "seno a -23 dBFS" ali quer dizer pico em 10^(-23/20), cujo
 * RMS é 3 dB mais baixo. Confundir os dois desloca toda a bateria em 3,01 LU e
 * faz a implementação certa parecer errada.
 */
function sine(freq: number, amp: number, seconds: number, rate = RATE, channels = 2): Float32Array[] {
  const frames = Math.round(seconds * rate);
  const out: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const data = new Float32Array(frames);
    for (let i = 0; i < frames; i++) data[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
    out.push(data);
  }
  return out;
}

describe('measureLoudness', () => {
  /**
   * EBU Tech 3341, caso de teste 1: seno estéreo de 1 kHz a -23 dBFS lê
   * -23,0 LUFS, com tolerância de ±0,1 do próprio documento.
   *
   * Este é o único teste aqui que ancora a escala em algo externo. Todos os
   * outros medem relações — dobrar, somar canais, portas — e relações continuam
   * valendo mesmo que a constante de offset esteja errada. Se o BS.1770 for
   * reimplementado, é este que diz se ainda é BS.1770.
   */
  it('lê o sinal de referência da EBU dentro da tolerância dela', () => {
    const measurement = measureLoudness(sine(1000, dbToGain(-23), 3), RATE);
    expect(measurement.lufs!).toBeCloseTo(-23, 1);
  });

  it('lê um seno estéreo de fundo de escala em 0 LUFS', () => {
    const measurement = measureLoudness(sine(1000, 1, 3), RATE);
    expect(measurement.lufs!).toBeCloseTo(0, 1);
    expect(measurement.peak).toBeCloseTo(1, 3);
  });

  it('sobe 6,02 LU quando a amplitude dobra', () => {
    const quiet = measureLoudness(sine(1000, 0.1, 3), RATE).lufs!;
    const loud = measureLoudness(sine(1000, 0.2, 3), RATE).lufs!;
    expect(loud - quiet).toBeCloseTo(6.02, 2);
  });

  /**
   * O mesmo conteúdo nos dois canais soma potência e lê 3,01 LU acima do canal
   * sozinho. Não é um detalhe de implementação: é o que faz um arquivo mono e a
   * versão dual-mono dele receberem ganhos diferentes, e o que o peso por canal
   * do BS.1770 manda acontecer.
   */
  it('soma os canais em potência', () => {
    const mono = measureLoudness(sine(1000, 0.1, 3, RATE, 1), RATE).lufs!;
    const stereo = measureLoudness(sine(1000, 0.1, 3, RATE, 2), RATE).lufs!;
    expect(stereo - mono).toBeCloseTo(3.01, 2);
  });

  /**
   * A tabela de coeficientes do anexo do BS.1770 só existe a 48 kHz. Derivar os
   * filtros na taxa do arquivo é o que mantém a leitura estável entre formatos —
   * copiar a tabela desloca os cortes em ~9% num arquivo de 44,1 kHz.
   */
  it('lê o mesmo nível em qualquer taxa de amostragem', () => {
    const at48 = measureLoudness(sine(1000, 0.1, 3, 48000), 48000).lufs!;
    for (const rate of [44100, 32000, 22050, 8000]) {
      const value = measureLoudness(sine(1000, 0.1, 3, rate), rate).lufs!;
      expect(value).withContext(`${rate} Hz`).toBeCloseTo(at48, 1);
    }
  });

  /**
   * Sem o gating, meio minuto de silêncio depois da faixa derrubaria a leitura
   * em 10 dB e a ferramenta responderia com um ganho absurdo. É a porta absoluta
   * de -70 LUFS que impede isso, e é por isso que ela é testada com um arquivo
   * que é 90% nada.
   */
  it('ignora o silêncio em volta do conteúdo', () => {
    const burst = sine(1000, 0.1, 3);
    const padded = burst.map((data) => {
      const out = new Float32Array(data.length * 10);
      out.set(data, 0);
      return out;
    });

    const alone = measureLoudness(burst, RATE).lufs!;
    expect(measureLoudness(padded, RATE).lufs!).toBeCloseTo(alone, 0);
  });

  it('devolve lufs nulo para silêncio digital, e o pico zerado junto', () => {
    const silence = [new Float32Array(RATE), new Float32Array(RATE)];
    expect(measureLoudness(silence, RATE)).toEqual({ peak: 0, lufs: null });
  });

  /**
   * Nada mais curto que um bloco de 400 ms tem loudness definido. O pico continua
   * saindo, porque ele é medido amostra a amostra e não depende de bloco nenhum —
   * é o que permite o modo pico funcionar num arquivo que o modo loudness recusa.
   */
  it('devolve lufs nulo abaixo de um bloco, sem perder o pico', () => {
    const measurement = measureLoudness(sine(1000, 0.5, 0.2), RATE);
    expect(measurement.lufs).toBeNull();
    expect(measurement.peak).toBeCloseTo(0.5, 2);
  });

  it('mede o pico pelo valor absoluto, não pelo lado positivo', () => {
    const data = new Float32Array([0.2, -0.85, 0.3]);
    expect(measureLoudness([data], RATE).peak).toBeCloseTo(0.85, 6);
  });

  it('trata um arquivo vazio sem estourar', () => {
    expect(measureLoudness([], RATE)).toEqual({ peak: 0, lufs: null });
    expect(measureLoudness([new Float32Array(0)], RATE)).toEqual({ peak: 0, lufs: null });
  });
});

describe('applyGain', () => {
  const CEILING = dbToGain(-1);

  it('multiplica exato quando nada passa do teto', () => {
    const input = [new Float32Array([0.1, -0.2, 0.3])];
    const result = applyGain(input, 2, CEILING, RATE);

    expect(Array.from(result.channels[0])).toEqual([0.2, -0.4, 0.6].map(toFloat32));
    expect(result.reductionDb).toBe(0);
    expect(result.peak).toBeCloseTo(0.6, 6);
  });

  /**
   * A garantia da ferramenta inteira: pedir um ganho que estoura não produz um
   * arquivo estourado. O teto vale para o resultado, sempre — o limitador é
   * construído para que isso seja verdade por construção, não por sorte.
   */
  it('nunca deixa o resultado passar do teto, por mais ganho que se peça', () => {
    const input = sine(200, 0.5, 1);
    input[0][RATE / 2] = 0.99;
    input[1][RATE / 2] = 0.99;

    for (const gain of [1.5, 4, 20]) {
      const result = applyGain(input, gain, CEILING, RATE);
      expect(result.peak).withContext(`ganho ${gain}×`).toBeLessThanOrEqual(CEILING + 1e-6);
      for (const channel of result.channels) {
        for (const sample of channel) {
          expect(Math.abs(sample)).toBeLessThanOrEqual(CEILING + 1e-6);
        }
      }
    }
  });

  /**
   * O que separa este limitador de um `Math.min(x, teto)` é justamente a rampa:
   * a envoltória desce antes do pico e sobe devagar depois dele, em vez de
   * saltar. Um degrau na envoltória é um clique audível em cima de cada pico —
   * o defeito que a ferramenta existe para não ter.
   *
   * A envoltória é lida direto porque o sinal é constante: fora do impulso,
   * `saída / (0,1 · ganho)` É a envoltória. Os limites abaixo são folgados em
   * relação ao ataque de 5 ms e ao relaxamento de 120 ms; se as constantes
   * mudarem de ordem de grandeza, este teste deve mudar junto, de propósito.
   */
  it('rampa a envoltória em vez de saltar, e relaxa bem mais devagar do que ataca', () => {
    const frames = RATE;
    const data = new Float32Array(frames).fill(0.1);
    data[frames / 2] = 1;

    const gain = 2;
    const result = applyGain([data], gain, CEILING, RATE);
    const envelope = Array.from(result.channels[0], (value) => value / (0.1 * gain));

    let maxFall = 0;
    let maxRise = 0;
    for (let i = 1; i < frames; i++) {
      if (i === frames / 2 || i === frames / 2 + 1) continue; // o impulso não é envoltória
      const delta = envelope[i] - envelope[i - 1];
      if (delta > maxRise) maxRise = delta;
      if (-delta > maxFall) maxFall = -delta;
    }

    expect(maxFall).toBeLessThan(0.005);
    expect(maxRise).toBeLessThan(0.0005);
    expect(maxRise).toBeGreaterThan(0); // relaxou de volta, não ficou preso embaixo
  });

  it('não segura o arquivo inteiro por causa de um pico isolado', () => {
    const frames = RATE;
    const data = new Float32Array(frames).fill(0.1);
    data[frames - 1] = 1;

    const result = applyGain([data], 2, CEILING, RATE);
    // Meio segundo antes do pico o ganho ainda é o pedido, inteiro.
    expect(result.channels[0][0]).toBeCloseTo(0.2, 5);
  });

  /**
   * Uma envoltória por canal moveria a imagem estéreo cada vez que o limitador
   * entrasse: um pico só à esquerda puxaria o esquerdo para baixo e a fonte
   * central andaria para a direita. A razão entre os canais tem de sobreviver.
   */
  it('mantém a razão entre os canais durante a limitação', () => {
    const left = new Float32Array(RATE).fill(0.6);
    const right = new Float32Array(RATE).fill(0.2);
    left[RATE / 2] = 1;

    const result = applyGain([left, right], 1.5, CEILING, RATE);
    for (let i = 0; i < RATE; i += 137) {
      if (i === RATE / 2) continue;
      expect(result.channels[0][i] / result.channels[1][i]).toBeCloseTo(3, 4);
    }
  });

  it('relata a redução aplicada em dB', () => {
    const data = new Float32Array(RATE).fill(0.1);
    data[RATE / 2] = 1;

    const result = applyGain([data], 2, CEILING, RATE);
    // No pior ponto a envoltória vale teto / (1 · 2), ou seja -7,02 dB.
    expect(result.reductionDb).toBeCloseTo(-gainToDb(CEILING / 2), 2);
  });
});

describe('dbToGain / gainToDb', () => {
  it('são inversos', () => {
    for (const db of [-23, -14, -6, 0, 6]) {
      expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 9);
    }
  });

  it('ancora os valores conhecidos', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6.0206)).toBeCloseTo(0.5, 5);
    expect(gainToDb(0)).toBe(-Infinity);
  });
});

function toFloat32(value: number): number {
  return Math.fround(value);
}
