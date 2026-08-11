import { TestBed } from '@angular/core/testing';
import { dbToGain, gainToDb } from '../../../core/audio/loudness';
import { AudioNormalizerService, type NormalizeAudioOptions } from './audio-normalizer.service';

const SAMPLE_RATE = 8000;

function sineBuffer(amp: number, seconds = 1, channels = 1): AudioBuffer {
  const frames = Math.round(seconds * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(channels, frames, SAMPLE_RATE);
  const buffer = ctx.createBuffer(channels, frames, SAMPLE_RATE);
  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < frames; i++) data[i] = amp * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
  }
  return buffer;
}

function silentBuffer(seconds = 1): AudioBuffer {
  const frames = Math.round(seconds * SAMPLE_RATE);
  return new OfflineAudioContext(1, frames, SAMPLE_RATE).createBuffer(1, frames, SAMPLE_RATE);
}

/** Maior amostra do WAV de 16 bits, lida de volta em escala linear. */
async function peakOf(blob: Blob): Promise<number> {
  const view = new DataView(await blob.arrayBuffer());
  const frames = view.getUint32(40, true) / 2;
  let peak = 0;
  for (let i = 0; i < frames; i++) {
    const value = Math.abs(view.getInt16(44 + i * 2, true) / 32767);
    if (value > peak) peak = value;
  }
  return peak;
}

describe('AudioNormalizerService', () => {
  let service: AudioNormalizerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioNormalizerService);
  });

  const base: NormalizeAudioOptions = {
    mode: 'peak',
    target: -1,
    ceiling: -1,
    format: 'wav',
    bitrate: '192',
  };

  it('calcula o ganho de pico como a distância até o alvo', () => {
    const measurement = service.measure(sineBuffer(0.25));
    const gain = service.gainDbFor(measurement, base)!;
    expect(gain).toBeCloseTo(-1 - gainToDb(measurement.peak), 3);
  });

  it('calcula o ganho de loudness como a distância até o alvo em LUFS', () => {
    const measurement = service.measure(sineBuffer(0.25));
    const gain = service.gainDbFor(measurement, { ...base, mode: 'loudness', target: -14 })!;
    expect(gain).toBeCloseTo(-14 - measurement.lufs!, 3);
  });

  /**
   * Um arquivo em silêncio não tem resposta em nenhum dos dois modos, e `null` é
   * a resposta. O componente usa isso para não oferecer um botão que produziria
   * um segundo arquivo silencioso — antes disto a divisão por zero devolvia
   * Infinity e o painel exibia "+∞ dB".
   */
  it('não inventa ganho para silêncio digital', () => {
    const measurement = service.measure(silentBuffer());
    expect(service.gainDbFor(measurement, base)).toBeNull();
    expect(service.gainDbFor(measurement, { ...base, mode: 'loudness', target: -14 })).toBeNull();
  });

  it('leva o pico exatamente ao alvo no modo pico', async () => {
    const buffer = sineBuffer(0.25);
    const result = await service.normalize(buffer, service.measure(buffer), base);

    expect(result.ext).toBe('wav');
    expect(result.reductionDb).toBe(0);
    expect(result.peakDb).toBeCloseTo(-1, 2);
    expect(await peakOf(result.blob)).toBeCloseTo(dbToGain(-1), 3);
  });

  /**
   * O modo loudness pede um ganho que ignora o pico, então é dele que o
   * limitador tem de dar conta. O teto vale para o arquivo escrito, não só para
   * o número relatado — daí a leitura ser feita nos bytes do WAV.
   */
  it('respeita o teto no modo loudness, mesmo quando o alvo pede mais', async () => {
    const buffer = sineBuffer(0.25);
    const measurement = service.measure(buffer);
    // O seno mono a 0,25 lê ~-15 LUFS, então este alvo pede ~12 dB — o bastante
    // para o pico ir parar acima do fundo de escala se ninguém o segurar.
    const options: NormalizeAudioOptions = { ...base, mode: 'loudness', target: -3, ceiling: -1 };

    const result = await service.normalize(buffer, measurement, options);

    expect(result.reductionDb).toBeGreaterThan(0);
    expect(result.peakDb).toBeLessThanOrEqual(-1 + 1e-3);
    expect(await peakOf(result.blob)).toBeLessThanOrEqual(dbToGain(-1) + 1e-3);
  });

  /**
   * Quando o limitador não entra, o loudness do resultado é a soma e sai de
   * graça. Quando entra, ele é remedido — anunciar o alvo depois de tirar
   * energia seria anunciar um número que o arquivo não tem.
   */
  it('relata o loudness do resultado, não o alvo pedido', async () => {
    const buffer = sineBuffer(0.05);
    const measurement = service.measure(buffer);
    const options: NormalizeAudioOptions = { ...base, mode: 'loudness', target: -23 };

    const result = await service.normalize(buffer, measurement, options);

    expect(result.reductionDb).toBe(0);
    expect(result.lufs!).toBeCloseTo(-23, 1);
  });

  it('estima o tamanho do WAV pelo cabeçalho, não por regra de três', () => {
    const buffer = sineBuffer(0.25, 2, 2);
    expect(service.estimatedBytes(buffer, base)).toBe(44 + buffer.length * 2 * 2);
  });

  it('estima o tamanho do MP3 pelo bitrate', () => {
    const buffer = sineBuffer(0.25, 2);
    const bytes = service.estimatedBytes(buffer, { ...base, format: 'mp3', bitrate: '128' });
    expect(bytes).toBe(Math.round((128_000 / 8) * buffer.duration));
  });
});
