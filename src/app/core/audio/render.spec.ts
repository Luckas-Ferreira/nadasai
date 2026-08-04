import { renderAudio } from './render';

function buffer(channels: number[][], sampleRate = 48_000): AudioBuffer {
  const ctx = new OfflineAudioContext(channels.length, channels[0].length, sampleRate);
  const out = ctx.createBuffer(channels.length, channels[0].length, sampleRate);
  for (let ch = 0; ch < channels.length; ch++) {
    out.copyToChannel(Float32Array.from(channels[ch]), ch);
  }
  return out;
}

function peak(data: Float32Array): number {
  let highest = 0;
  for (let i = 0; i < data.length; i++) highest = Math.max(highest, Math.abs(data[i]));
  return highest;
}

describe('renderAudio', () => {
  /**
   * A razão de esta função existir.
   *
   * Somar L+R num ChannelMerger, que é o caminho intuitivo — e o que
   * convert-audio e compress-audio fazem inline —, leva qualquer coisa
   * centralizada a +2,0 e o WAV grampeia isso em distorção. O downmix da spec é
   * (L+R)/2, e é o que um destino declarado com UM canal aplica sozinho.
   */
  it('averages a centred stereo signal instead of summing it into clipping', async () => {
    const loud = new Array(2048).fill(0.9);
    const mono = await renderAudio(buffer([loud, loud]), { channels: 1 });

    expect(mono.numberOfChannels).toBe(1);
    expect(peak(mono.getChannelData(0))).toBeCloseTo(0.9, 2);
  });

  it('keeps both channels when only the sample rate changes', async () => {
    const left = new Array(4800).fill(0.5);
    const right = new Array(4800).fill(-0.5);

    const out = await renderAudio(buffer([left, right], 48_000), { sampleRate: 24_000 });

    expect(out.numberOfChannels).toBe(2);
    expect(out.sampleRate).toBe(24_000);
    // Meia taxa, metade dos quadros para a mesma duração.
    expect(out.length).toBeCloseTo(2400, -1);
  });

  /**
   * Devolver o mesmo objeto quando não há nada a fazer não é microtimização: a
   * renderização alternativa duplicaria o PCM inteiro na memória, e meia hora de
   * estéreo já são ~690 MB.
   */
  it('returns the very same buffer when nothing would change', async () => {
    const source = buffer([new Array(128).fill(0.1), new Array(128).fill(0.1)]);

    await expectAsync(renderAudio(source, { channels: 0, sampleRate: 0 })).toBeResolvedTo(source);
    await expectAsync(renderAudio(source, { channels: 2, sampleRate: 48_000 })).toBeResolvedTo(source);
  });
});
