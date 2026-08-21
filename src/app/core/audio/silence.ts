/**
 * Detecção de silêncio: onde o áudio está abaixo de um limiar por tempo
 * suficiente para valer a pena tirar.
 *
 * Puro, sem dependência, testado em unidade — mesma regra do resto de
 * `core/audio/`. Quatro decisões moram aqui, e cada uma é a diferença entre uma
 * ferramenta que serve e uma que pica a gravação:
 *
 *   1. **A medida é RMS numa janela, não amostra a amostra.** Uma onda cruza o
 *      zero a cada ciclo, então um teste por amostra marca silêncio no meio de
 *      qualquer nota. A janela de ~20 ms é curta o bastante para achar a pausa
 *      entre duas palavras e longa o bastante para não confundir zero-crossing
 *      com pausa.
 *   2. **A duração mínima é o que separa pausa de respiro.** Sem ela, cortar
 *      tudo abaixo do limiar remove os intervalos naturais entre sílabas e o
 *      resultado sai atropelado — o defeito clássico de removedor de silêncio.
 *   3. **Sobra uma margem (`keepPadding`) dos dois lados.** Cortar exatamente no
 *      ponto em que o nível sobe come o ataque da consoante, e a fala fica com
 *      início mordido. Deixar 60 ms é o que faz o corte soar como edição e não
 *      como falha.
 *   4. **A janela de análise mistura os canais.** Um trecho só é silêncio se for
 *      silêncio em todos: cortar por causa de um lado mudo apagaria o que está
 *      no outro — que é exatamente o arquivo que traz gente ao separar canais.
 */

export interface SilenceOptions {
  /** Limiar em dBFS. Abaixo disto conta como silêncio. Ex.: -45. */
  readonly thresholdDb: number;
  /** Duração mínima de um silêncio para ele ser removido, em segundos. */
  readonly minSilenceSeconds: number;
  /** Margem preservada nas duas pontas de cada silêncio, em segundos. */
  readonly keepPadding: number;
}

/** Um trecho a MANTER, em quadros [início, fim). */
export type KeepRange = readonly [number, number];

export interface SilenceAnalysis {
  readonly keep: readonly KeepRange[];
  /** Quantos quadros seriam removidos. */
  readonly removedFrames: number;
  /** Quantos trechos de silêncio foram achados. */
  readonly silenceCount: number;
}

/** Janela de análise. 20 ms a 48 kHz são 960 quadros. */
const WINDOW_SECONDS = 0.02;

export function dbToAmplitude(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Devolve os trechos a MANTER — e não os a remover — porque é assim que o
 * copiador de amostras consome, e é a mesma forma que o cortador já usa.
 * Converter entre as duas listas em algum ponto intermediário só criaria um
 * lugar a mais para o off-by-one morar.
 */
export function findSilence(
  channels: readonly Float32Array[],
  sampleRate: number,
  options: SilenceOptions,
): SilenceAnalysis {
  const frames = channels[0]?.length ?? 0;
  if (frames === 0) return { keep: [], removedFrames: 0, silenceCount: 0 };

  const windowFrames = Math.max(1, Math.round(WINDOW_SECONDS * sampleRate));
  const threshold = dbToAmplitude(options.thresholdDb);
  const minSilence = Math.max(1, Math.round(options.minSilenceSeconds * sampleRate));
  const padding = Math.max(0, Math.round(options.keepPadding * sampleRate));

  // 1) Marca cada janela como silenciosa ou não.
  const windows = Math.ceil(frames / windowFrames);
  const quiet = new Uint8Array(windows);

  for (let w = 0; w < windows; w++) {
    const from = w * windowFrames;
    const to = Math.min(frames, from + windowFrames);
    quiet[w] = windowRms(channels, from, to) < threshold ? 1 : 0;
  }

  // 2) Junta janelas silenciosas vizinhas em trechos, e descarta os curtos.
  const silences: Array<[number, number]> = [];
  let runStart = -1;

  for (let w = 0; w <= windows; w++) {
    const isQuiet = w < windows && quiet[w] === 1;

    if (isQuiet && runStart === -1) runStart = w;

    if (!isQuiet && runStart !== -1) {
      const from = runStart * windowFrames;
      const to = Math.min(frames, w * windowFrames);
      if (to - from >= minSilence) silences.push([from, to]);
      runStart = -1;
    }
  }

  if (silences.length === 0) {
    return { keep: [[0, frames]], removedFrames: 0, silenceCount: 0 };
  }

  // 3) Encolhe cada silêncio pela margem e descarta o que sobrar vazio — um
  //    silêncio menor que duas margens não vale um corte.
  //
  //    A margem existe para proteger o ATAQUE do som vizinho: cortar exatamente
  //    onde o nível sobe come a consoante e a fala fica com início mordido. Nas
  //    bordas do arquivo não há vizinho de um dos lados, então lá a margem não
  //    protege nada — ela só preservaria 60 ms de silêncio no começo e no fim,
  //    que é justamente o que quem remove silêncio quer ver sumir.
  const cuts: Array<[number, number]> = [];
  for (const [from, to] of silences) {
    const start = from === 0 ? 0 : from + padding;
    const end = to >= frames ? frames : to - padding;
    if (end > start) cuts.push([start, end]);
  }

  if (cuts.length === 0) {
    return { keep: [[0, frames]], removedFrames: 0, silenceCount: 0 };
  }

  // 4) O complemento dos cortes é o que se mantém.
  const keep: KeepRange[] = [];
  let cursor = 0;

  for (const [from, to] of cuts) {
    if (from > cursor) keep.push([cursor, from]);
    cursor = to;
  }
  if (cursor < frames) keep.push([cursor, frames]);

  const removedFrames = cuts.reduce((sum, [from, to]) => sum + (to - from), 0);

  return { keep, removedFrames, silenceCount: cuts.length };
}

/**
 * RMS da janela, sobre o canal MAIS ALTO em cada amostra.
 *
 * Usar o máximo entre os canais e não a média é o que impede um lado mudo de
 * arrastar a janela inteira para baixo do limiar: um trecho só é silêncio se
 * for silêncio em todos os canais.
 */
function windowRms(channels: readonly Float32Array[], from: number, to: number): number {
  const length = to - from;
  if (length <= 0) return 0;

  let sum = 0;

  for (let i = from; i < to; i++) {
    let peak = 0;
    for (let c = 0; c < channels.length; c++) {
      const v = Math.abs(channels[c][i]);
      if (v > peak) peak = v;
    }
    sum += peak * peak;
  }

  return Math.sqrt(sum / length);
}
