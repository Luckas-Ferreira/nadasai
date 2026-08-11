/**
 * Medição de loudness (ITU-R BS.1770-4 / EBU R128) e o estágio de ganho que age
 * sobre ela. Aritmética pura sobre Float32, como o resto de `core/audio/` — o
 * módulo continua sem dependência nenhuma para isto.
 *
 * Por que loudness e não só pico: normalizar por pico só garante que a amostra
 * mais alta encoste no teto, e isso não é o que ninguém quer dizer com "aumentar
 * o volume". Uma gravação de voz com um estalo de mesa já tem pico em 0 dBFS e
 * mesmo assim está inaudível — normalizar por pico dela não muda absolutamente
 * nada. O que se percebe como volume é a energia média ponderada pelo ouvido, e
 * é isso que o BS.1770 mede.
 *
 * O pico aqui é o pico de AMOSTRA, não o true peak. O true peak exige
 * sobreamostrar 4× antes de medir, porque o sinal reconstruído entre duas
 * amostras pode passar do que qualquer uma delas mostra. É por isso que o teto
 * padrão é -1 dBFS e não 0: aquele decibel é a folga que cobre o intersample
 * peak sem um banco de filtros só para medi-lo.
 */

export interface LoudnessMeasurement {
  /** Maior amostra em valor absoluto, linear. 1.0 = fundo de escala. */
  readonly peak: number;
  /**
   * Loudness integrado em LUFS, ou `null` quando não há o que medir: silêncio
   * digital, ou um arquivo mais curto que um bloco de 400 ms. Null é uma
   * resposta, não uma falha — quem chama decide o que fazer com ela.
   */
  readonly lufs: number | null;
}

/** Bloco de análise e passo entre blocos: 400 ms com 75% de sobreposição. */
const BLOCK_SECONDS = 0.4;
const STEP_SECONDS = 0.1;
const STEPS_PER_BLOCK = Math.round(BLOCK_SECONDS / STEP_SECONDS);

/** Portas do gating, e o offset que ancora a escala LUFS (BS.1770-4, §5.1). */
const ABSOLUTE_GATE_LUFS = -70;
const RELATIVE_GATE_LU = -10;
const SCALE_OFFSET = -0.691;

interface Biquad {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

/**
 * Os dois estágios da ponderação K, derivados para a taxa do arquivo em vez de
 * copiados da tabela do anexo.
 *
 * A tabela do BS.1770 traz os coeficientes só a 48 kHz, e aplicá-los a um
 * arquivo de 44,1 kHz desloca as duas frequências de corte em ~9% — o erro é
 * pequeno mas é sistemático, e cai justamente em cima da medida que a ferramenta
 * mostra como número. Estas são as fórmulas da libebur128, a implementação de
 * referência: o mesmo protótipo analógico transformado por bilinear na taxa que
 * o arquivo tem.
 */
function preFilter(sampleRate: number): Biquad {
  const f0 = 1681.974450955533;
  const gainDb = 3.999843853973347;
  const q = 0.7071752369554196;

  const k = Math.tan((Math.PI * f0) / sampleRate);
  const vh = Math.pow(10, gainDb / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const a0 = 1 + k / q + k * k;

  return {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
}

function rlbFilter(sampleRate: number): Biquad {
  const f0 = 38.13547087602444;
  const q = 0.5003270373238773;

  const k = Math.tan((Math.PI * f0) / sampleRate);
  const a0 = 1 + k / q + k * k;

  return {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  };
}

/**
 * Peso de cada canal (BS.1770-4, tabela 4).
 *
 * A ordem canônica de 5.1 na Web Audio é L, R, C, LFE, SL, SR. O LFE fica fora
 * da medida — peso zero, não 1 — e os dois surrounds entram com +1,5 dB. Somar o
 * LFE junto inflaria a leitura de qualquer material com grave forte e faria a
 * ferramenta baixar um filme que já estava no alvo.
 */
function channelWeights(count: number): readonly number[] {
  if (count === 6) return [1, 1, 1, 0, 1.41, 1.41];
  return new Array<number>(count).fill(1);
}

function toLoudness(meanSquare: number): number {
  return meanSquare > 0 ? SCALE_OFFSET + 10 * Math.log10(meanSquare) : -Infinity;
}

/**
 * Uma passada por canal: filtra, acumula a energia por passo de 100 ms e vai
 * anotando o pico do sinal ORIGINAL no caminho.
 *
 * O sinal filtrado nunca é materializado. Guardar a saída da ponderação K
 * custaria uma segunda cópia do arquivo inteiro em memória — 165 MB por canal
 * numa faixa de 30 minutos a 48 kHz — e ela seria lida uma vez só, para elevar
 * ao quadrado. Somar direto no balde do passo é a mesma conta sem a cópia.
 */
export function measureLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
): LoudnessMeasurement {
  const frames = channels[0]?.length ?? 0;
  if (!frames || sampleRate <= 0) return { peak: 0, lufs: null };

  const stepFrames = Math.max(1, Math.round(sampleRate * STEP_SECONDS));
  const stepCount = Math.floor(frames / stepFrames);
  const blockCount = stepCount - STEPS_PER_BLOCK + 1;

  const shelf = preFilter(sampleRate);
  const rlb = rlbFilter(sampleRate);

  let peak = 0;
  const energy: Float64Array[] = [];

  for (const data of channels) {
    const steps = new Float64Array(Math.max(0, stepCount));

    let x1 = 0, x2 = 0, y1 = 0, y2 = 0; // pré-filtro
    let u1 = 0, u2 = 0, v1 = 0, v2 = 0; // RLB

    let step = 0;
    let boundary = stepFrames;

    for (let i = 0; i < frames; i++) {
      const x = data[i];
      const magnitude = x < 0 ? -x : x;
      if (magnitude > peak) peak = magnitude;

      const y = shelf.b0 * x + shelf.b1 * x1 + shelf.b2 * x2 - shelf.a1 * y1 - shelf.a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;

      const v = rlb.b0 * y + rlb.b1 * u1 + rlb.b2 * u2 - rlb.a1 * v1 - rlb.a2 * v2;
      u2 = u1; u1 = y; v2 = v1; v1 = v;

      if (i >= boundary) { step++; boundary += stepFrames; }
      if (step < stepCount) steps[step] += v * v;
    }

    energy.push(steps);
  }

  if (blockCount <= 0) return { peak, lufs: null };

  /**
   * A grandeza por bloco é a soma ponderada dos canais, e não a lista por canal,
   * porque o gating só precisa dela: o limiar relativo do BS.1770 é
   * `Σ_c G_c · média_j(z_jc)`, e somatório e média comutam — a média da soma
   * ponderada dá exatamente o mesmo número. Guardar por canal seria carregar uma
   * dimensão que nada mais lê.
   */
  const blockFrames = stepFrames * STEPS_PER_BLOCK;
  const weights = channelWeights(channels.length);
  const blocks = new Float64Array(blockCount);

  for (let j = 0; j < blockCount; j++) {
    let acc = 0;
    for (let ch = 0; ch < energy.length; ch++) {
      let sum = 0;
      for (let k = 0; k < STEPS_PER_BLOCK; k++) sum += energy[ch][j + k];
      acc += weights[ch] * (sum / blockFrames);
    }
    blocks[j] = acc;
  }

  // Porta absoluta: o silêncio entre as faixas não conta como parte da faixa.
  let sum = 0;
  let count = 0;
  for (let j = 0; j < blockCount; j++) {
    if (toLoudness(blocks[j]) > ABSOLUTE_GATE_LUFS) { sum += blocks[j]; count++; }
  }
  if (!count) return { peak, lufs: null };

  // Porta relativa: 10 LU abaixo da média do que sobrou. É o que impede que uma
  // pausa longa num podcast puxe a leitura da fala para baixo.
  const relativeGate = toLoudness(sum / count) + RELATIVE_GATE_LU;

  sum = 0;
  count = 0;
  for (let j = 0; j < blockCount; j++) {
    const level = toLoudness(blocks[j]);
    if (level > ABSOLUTE_GATE_LUFS && level > relativeGate) { sum += blocks[j]; count++; }
  }
  if (!count) return { peak, lufs: null };

  return { peak, lufs: toLoudness(sum / count) };
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : -Infinity;
}

export interface GainResult {
  readonly channels: Float32Array[];
  /** Quanto o limitador teve de segurar no pior ponto, em dB. 0 = nunca entrou. */
  readonly reductionDb: number;
  /** Maior amostra do resultado, linear. Nunca passa do teto pedido. */
  readonly peak: number;
}

/** Ataque e relaxamento do limitador, em segundos. */
const ATTACK_SECONDS = 0.005;
const RELEASE_SECONDS = 0.12;

/**
 * Aplica `gain` e segura o que passar de `ceiling`.
 *
 * O limitador é feed-forward com look-ahead, montado em duas passadas sobre a
 * envoltória de ganho em vez de um seguidor de envelope por amostra:
 *
 *  1. de trás para frente, limitando o quanto a envoltória pode SUBIR por
 *     amostra — o que, lido no sentido do tempo, é a rampa de ataque descendo
 *     antes do pico chegar;
 *  2. de frente para trás, com a taxa de subida do relaxamento.
 *
 * As duas passadas só abaixam valores, e a envoltória começa já em "o que cabe
 * no teto", então o teto é garantido por construção — não por tentativa. Um
 * seguidor comum não garante: ele reage depois de ver o pico, e o pico já saiu.
 * E cortar duro (`Math.min(x, ceiling)`) é distorção pura, que é exatamente o
 * som que uma ferramenta de "aumentar volume" não pode produzir.
 *
 * A envoltória é UMA só para todos os canais. Ganho por canal mexeria na imagem
 * estéreo cada vez que o limitador entrasse: um pico só no canal esquerdo
 * puxaria o esquerdo para baixo e a fonte central andaria para a direita.
 */
export function applyGain(
  channels: readonly Float32Array[],
  gain: number,
  ceiling: number,
  sampleRate: number,
): GainResult {
  const frames = channels[0]?.length ?? 0;
  const out = channels.map(() => new Float32Array(frames));
  if (!frames) return { channels: out, reductionDb: 0, peak: 0 };

  let sourcePeak = 0;
  for (const data of channels) {
    for (let i = 0; i < frames; i++) {
      const magnitude = data[i] < 0 ? -data[i] : data[i];
      if (magnitude > sourcePeak) sourcePeak = magnitude;
    }
  }

  // Caminho rápido, e é o caminho normal no modo pico: se nada passa do teto não
  // há envoltória a construir, e a multiplicação é exata em toda a faixa.
  if (sourcePeak * gain <= ceiling + 1e-9) {
    for (let ch = 0; ch < channels.length; ch++) {
      const src = channels[ch];
      const dst = out[ch];
      for (let i = 0; i < frames; i++) dst[i] = src[i] * gain;
    }
    return { channels: out, reductionDb: 0, peak: sourcePeak * gain };
  }

  const envelope = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let magnitude = 0;
    for (const data of channels) {
      const value = data[i] < 0 ? -data[i] : data[i];
      if (value > magnitude) magnitude = value;
    }
    const amplified = magnitude * gain;
    envelope[i] = amplified > ceiling ? ceiling / amplified : 1;
  }

  const attackStep = 1 / Math.max(1, Math.round(ATTACK_SECONDS * sampleRate));
  for (let i = frames - 2; i >= 0; i--) {
    const capped = envelope[i + 1] + attackStep;
    if (envelope[i] > capped) envelope[i] = capped;
  }

  const releaseStep = 1 / Math.max(1, Math.round(RELEASE_SECONDS * sampleRate));
  let lowest = 1;
  for (let i = 1; i < frames; i++) {
    const capped = envelope[i - 1] + releaseStep;
    if (envelope[i] > capped) envelope[i] = capped;
    if (envelope[i] < lowest) lowest = envelope[i];
  }

  let peak = 0;
  for (let ch = 0; ch < channels.length; ch++) {
    const src = channels[ch];
    const dst = out[ch];
    for (let i = 0; i < frames; i++) {
      const value = src[i] * gain * envelope[i];
      dst[i] = value;
      const magnitude = value < 0 ? -value : value;
      if (magnitude > peak) peak = magnitude;
    }
  }

  return { channels: out, reductionDb: -gainToDb(lowest), peak };
}
