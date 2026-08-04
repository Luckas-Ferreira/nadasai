/**
 * Re-renderiza um AudioBuffer com outra contagem de canais e/ou outra taxa de
 * amostragem, usando o resampler do próprio navegador.
 *
 * A descida para mono é feita pelo destino do OfflineAudioContext, não por um
 * ChannelSplitter somando os canais num ChannelMerger. A diferença é audível e
 * não é sutil: somar L+R no ganho cheio leva qualquer coisa centralizada — a
 * voz, o bumbo, o baixo — a até +2,0 em escala linear, e o WAV grampeia isso em
 * distorção. O downmix da spec é (L+R)/2, e é o que um destino declarado com um
 * canal aplica sozinho, de graça.
 */
export interface RenderAudioOptions {
  /** Quantos canais a saída deve ter. `0` mantém os da entrada. */
  readonly channels?: number;
  /** Taxa de saída em Hz. `0` mantém a da entrada. */
  readonly sampleRate?: number;
}

export async function renderAudio(
  buffer: AudioBuffer,
  options: RenderAudioOptions = {},
): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate && options.sampleRate > 0 ? options.sampleRate : buffer.sampleRate;
  const channels = options.channels && options.channels > 0 ? options.channels : buffer.numberOfChannels;

  // Nada a fazer é a resposta mais barata: devolver o mesmo buffer poupa uma
  // renderização inteira e uma segunda cópia do PCM na memória.
  if (sampleRate === buffer.sampleRate && channels === buffer.numberOfChannels) return buffer;

  const frames = Math.max(1, Math.ceil(buffer.duration * sampleRate));
  const ctx = new OfflineAudioContext(channels, frames, sampleRate);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);

  return ctx.startRendering();
}
