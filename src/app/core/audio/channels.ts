/**
 * Aritmética de canais: separar, juntar, trocar e dobrar.
 *
 * Tudo aqui é Float32 puro e sem dependência — mesma regra do resto de
 * `core/audio/`. O que existe de decisão está em dois pontos, e os dois têm
 * consequência audível:
 *
 *   1. **A mistura para mono divide por 2, não soma.** Somar dois canais que
 *      carregam o mesmo material dobra a amplitude e estoura tudo o que já
 *      estava acima de -6 dBFS — que é a maioria da música masterizada. Dividir
 *      preserva o nível percebido e é o que qualquer console faz.
 *   2. **Cancelamento de fase é um risco real e não dá para evitar.** Se os dois
 *      canais tiverem material igual em oposição de fase, a média os apaga. Isso
 *      é propriedade do sinal, não da conta: a ferramenta avisa em vez de
 *      inventar uma correção que mudaria o som de todos os outros arquivos.
 */

export type ChannelOperation =
  | 'to-mono'
  | 'to-stereo'
  | 'left-only'
  | 'right-only'
  | 'swap';

/** Quantos canais a operação produz, dado o que entrou. */
export function outputChannelCount(operation: ChannelOperation, sourceChannels: number): number {
  switch (operation) {
    case 'to-mono':
    case 'left-only':
    case 'right-only':
      return 1;
    case 'to-stereo':
      return 2;
    case 'swap':
      return sourceChannels;
  }
}

/**
 * Aplica a operação e devolve os canais resultantes.
 *
 * Os arrays devolvidos são NOVOS em toda operação que muda o conteúdo, e para
 * as que não mudam (extrair um canal, trocar dois) são os mesmos objetos — não
 * há razão para copiar dezenas de megabytes de PCM para entregar o que já
 * existe. Quem escreve o WAV só lê.
 */
export function applyChannelOperation(
  channels: readonly Float32Array[],
  operation: ChannelOperation,
): readonly Float32Array[] {
  if (channels.length === 0) return channels;

  const left = channels[0];
  const right = channels[1] ?? channels[0];

  switch (operation) {
    case 'to-mono':
      return [downmix(channels)];

    case 'to-stereo':
      // Um mono virando estéreo é o MESMO sinal nos dois lados, e é o certo:
      // inventar diferença entre eles seria inventar uma imagem estéreo que a
      // gravação não tem. Já sendo estéreo, nada muda.
      return channels.length >= 2 ? channels.slice(0, 2) : [left, left];

    case 'left-only':
      return [left];

    case 'right-only':
      return [right];

    case 'swap':
      // Só faz sentido com dois canais; num mono, trocar é não fazer nada.
      return channels.length >= 2 ? [channels[1], channels[0], ...channels.slice(2)] : channels;
  }
}

/** Média de todos os canais, amostra a amostra. */
export function downmix(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];

  const length = channels[0].length;
  const out = new Float32Array(length);
  const count = channels.length;

  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < count; c++) sum += channels[c][i];
    out[i] = sum / count;
  }

  return out;
}

/**
 * Quanto os dois primeiros canais se cancelariam ao virar mono, de 0 a 1.
 *
 * 0 quer dizer "a mistura preserva o nível"; perto de 1 quer dizer que os dois
 * canais são quase opostos em fase e o mono vai sair muito mais baixo — ou
 * mudo. Acontece de verdade em faixa com efeito de alargamento estéreo, em
 * gravação com microfone fora de fase e em karaokê feito por subtração.
 *
 * A medida é a razão entre a energia da MÉDIA e a média das energias: se os
 * canais forem idênticos dá 1 (nenhum cancelamento); se forem opostos dá 0.
 * Devolve `1 - razão` para que o número cresça com o problema, que é como o
 * painel o apresenta.
 *
 * Amostra em passo largo de propósito: isto é um aviso na tela, não uma medição
 * de laboratório, e varrer 80 milhões de amostras para desenhar um alerta seria
 * gastar segundos para não mudar a resposta.
 */
export function phaseCancellation(channels: readonly Float32Array[]): number {
  if (channels.length < 2) return 0;

  const [a, b] = channels;
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;

  const step = Math.max(1, Math.floor(length / 200_000));

  let energyMix = 0;
  let energyEach = 0;

  for (let i = 0; i < length; i += step) {
    const mid = (a[i] + b[i]) / 2;
    energyMix += mid * mid;
    energyEach += (a[i] * a[i] + b[i] * b[i]) / 2;
  }

  if (energyEach === 0) return 0;

  const ratio = energyMix / energyEach;
  return Math.min(1, Math.max(0, 1 - ratio));
}
