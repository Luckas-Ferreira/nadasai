/**
 * VELOCIDADE E TOM, e por que são a mesma máquina.
 *
 * Mudar a velocidade de um áudio é duas operações diferentes que as pessoas
 * chamam pelo mesmo nome:
 *
 * - **Reamostrar** lê as mesmas amostras num passo diferente. É o que um disco
 *   de vinil faz quando se troca a rotação: fica mais rápido E mais agudo. Sai
 *   quase de graça, e é EXATAMENTE o que quem procura "nightcore" ou "slowed"
 *   quer — a mudança de tom é o efeito, não um defeito.
 * - **Esticar no tempo** mantém o tom e muda só a duração. É o que se quer numa
 *   aula gravada ou num podcast, e não existe de graça: é preciso repetir e
 *   sobrepor pedaços da onda sem que a emenda apareça.
 *
 * As duas se compõem, e é isso que deixa a máquina única. Para uma saída com
 * velocidade `v` e tom multiplicado por `p`, basta esticar por `v / p` e depois
 * reamostrar por `p`:
 *
 *   duração = (entrada / (v/p)) / p = entrada / v      ✓
 *   tom     = 1 × p = p                                ✓
 *
 * Com `p = v` o esticamento vira identidade e sobra só a reamostragem — o
 * caminho barato. Com `p = 1` não há reamostragem e sobra só o esticamento. Os
 * dois modos do painel são esses dois valores de `p`, não dois códigos.
 */

/** Limites do que é útil: fora disso o resultado é irreconhecível. */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

export interface SpeedOptions {
  /** 2 = o dobro da velocidade; 0,5 = metade. */
  readonly speed: number;
  /** Multiplicador do tom. 1 mantém, 2 sobe uma oitava, 0,5 desce uma. */
  readonly pitchRatio: number;
}

export function clampSpeed(value: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));
}

/** Semitons para multiplicador de frequência: doze semitons são uma oitava. */
export function semitonesToRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/**
 * REAMOSTRAGEM LINEAR.
 *
 * `ratio > 1` encurta e agudiza. A interpolação é linear e não cúbica de
 * propósito: a diferença audível aparece em material sintético de banda cheia,
 * e o custo em código e em tempo não se paga num produto que já entrega o
 * arquivo em segundos.
 */
export function resampleLinear(input: Float32Array, ratio: number): Float32Array {
  if (ratio === 1) return input.slice();

  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const at = i * ratio;
    const left = Math.floor(at);
    const right = Math.min(left + 1, input.length - 1);
    const frac = at - left;
    out[i] = input[left] * (1 - frac) + input[right] * frac;
  }

  return out;
}

/** Quadro de análise, em segundos. 60 ms é o compromisso usual do WSOLA. */
const FRAME_SECONDS = 0.06;
/** Até onde procurar a melhor emenda, em segundos. */
const SEARCH_SECONDS = 0.01;

/**
 * ESTICAMENTO NO TEMPO POR WSOLA, mantendo o tom.
 *
 * `factor > 1` encurta. O algoritmo copia quadros da entrada e os sobrepõe na
 * saída com passo fixo; o que o torna WSOLA — e não um simples corta-e-cola — é
 * a BUSCA: antes de copiar cada quadro, ele desliza a origem numa janela de
 * ±10 ms procurando o trecho que melhor continua o que já foi escrito.
 *
 * Sem essa busca, a emenda cai em fase arbitrária e o resultado ganha um
 * ronco metálico em toda voz sustentada — o defeito clássico do vocoder mal
 * feito. A correlação cruzada é o que alinha os ciclos da onda.
 *
 * A sobreposição usa Hann e passo de meio quadro, então as janelas somam 1 e
 * não é preciso normalizar depois.
 */
export function timeStretch(
  input: Float32Array,
  factor: number,
  sampleRate: number,
): Float32Array {
  if (factor === 1 || input.length === 0) return input.slice();

  const frame = Math.max(64, Math.round(FRAME_SECONDS * sampleRate));
  const synthesisHop = Math.floor(frame / 2);
  const search = Math.max(1, Math.round(SEARCH_SECONDS * sampleRate));

  const window = hann(frame);
  const outLength = Math.max(1, Math.round(input.length / factor));
  const out = new Float32Array(outLength + frame);

  // O trecho que a saída "espera" ouvir a seguir, para a busca comparar contra.
  let expected = input.subarray(0, Math.min(frame, input.length));
  let analysisAt = 0;
  let writeAt = 0;

  while (writeAt < outLength) {
    const offset = bestOffset(input, expected, analysisAt, search, frame);
    const start = Math.max(0, Math.min(input.length - frame, analysisAt + offset));
    if (start < 0 || input.length < frame) break;

    for (let i = 0; i < frame; i++) {
      out[writeAt + i] += input[start + i] * window[i];
    }

    // A continuação natural daquele quadro é o que o próximo deve emendar.
    const nextExpectedAt = start + synthesisHop;
    expected = input.subarray(nextExpectedAt, Math.min(nextExpectedAt + frame, input.length));
    if (expected.length < frame) break;

    writeAt += synthesisHop;
    analysisAt = Math.round(writeAt * factor);
    if (analysisAt + frame >= input.length) break;
  }

  /**
   * A CAUDA, que o laço não alcança.
   *
   * Ele para quando não há mais um quadro inteiro à frente, e sem isto a saída
   * terminava com até 60 ms de zeros — silêncio no lugar do fim do áudio. A
   * primeira metade entra pela janela ASCENDENTE, para somar 1 com a metade
   * descendente que o último quadro já escreveu; daí em diante é cópia crua,
   * porque não há mais nada sobreposto.
   */
  if (writeAt < outLength && analysisAt < input.length) {
    const remaining = Math.min(outLength - writeAt, input.length - analysisAt);
    for (let i = 0; i < remaining; i++) {
      out[writeAt + i] += input[analysisAt + i] * (i < synthesisHop ? window[i] : 1);
    }
  }

  return out.subarray(0, outLength).slice();
}

/**
 * Onde, dentro da janela de busca, o sinal melhor continua o que já foi escrito.
 *
 * Correlação cruzada crua, sem normalizar: o que se compara são candidatos do
 * MESMO sinal a poucos milissegundos de distância, então a energia entre eles
 * mal varia e dividir por ela só custaria tempo.
 */
function bestOffset(
  input: Float32Array,
  expected: Float32Array,
  around: number,
  search: number,
  frame: number,
): number {
  if (expected.length < frame) return 0;

  let best = 0;
  let bestScore = -Infinity;

  for (let offset = -search; offset <= search; offset++) {
    const start = around + offset;
    if (start < 0 || start + frame > input.length) continue;

    let score = 0;
    // Passo de 4 amostras: a correlação é suave nessa escala, e olhar uma em
    // cada quatro corta o custo da busca em 75% sem mudar o vencedor.
    for (let i = 0; i < frame; i += 4) score += input[start + i] * expected[i];

    if (score > bestScore) {
      bestScore = score;
      best = offset;
    }
  }

  return best;
}

function hann(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  return w;
}

/**
 * A composição: estica por `speed / pitchRatio`, depois reamostra por
 * `pitchRatio`. É a única função que os consumidores precisam chamar.
 */
export function applySpeed(
  input: Float32Array,
  sampleRate: number,
  { speed, pitchRatio }: SpeedOptions,
): Float32Array {
  const stretched = timeStretch(input, speed / pitchRatio, sampleRate);
  return resampleLinear(stretched, pitchRatio);
}

/** Quanto tempo o resultado vai ter, para o painel dizer antes de processar. */
export function durationAfter(seconds: number, speed: number): number {
  return seconds / speed;
}
