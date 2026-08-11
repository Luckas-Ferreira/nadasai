import { Injectable, inject } from '@angular/core';
import {
  applyGain,
  dbToGain,
  gainToDb,
  measureLoudness,
  type LoudnessMeasurement,
} from '../../../core/audio/loudness';
import { encodeWav, wavByteLength } from '../../../core/audio/wav';
import { AudioConverterService } from '../../convert-audio/services/audio-converter.service';

export type NormalizeMode = 'peak' | 'loudness';
export type NormalizeFormat = 'wav' | 'mp3';
export type NormalizeBitrate = '320' | '192' | '128';

export interface NormalizeAudioOptions {
  readonly mode: NormalizeMode;
  /** dBFS no modo pico, LUFS no modo loudness. */
  readonly target: number;
  /** Teto de pico do resultado, em dBFS. Vale nos dois modos. */
  readonly ceiling: number;
  readonly format: NormalizeFormat;
  readonly bitrate: NormalizeBitrate;
}

export interface NormalizeResult {
  readonly blob: Blob;
  readonly ext: string;
  /** Ganho efetivamente aplicado, em dB. */
  readonly gainDb: number;
  /** Quanto o limitador segurou no pior ponto, em dB. 0 = não entrou. */
  readonly reductionDb: number;
  /** Pico do resultado, em dBFS. */
  readonly peakDb: number;
  /** Loudness do resultado, em LUFS, ou null quando não é medível. */
  readonly lufs: number | null;
}

/**
 * Normalização de volume: mede, calcula o ganho e escreve o arquivo.
 *
 * Sem estado, como todo serviço de ferramenta aqui — recebe o `AudioBuffer` que
 * o componente decodificou, devolve um Blob. A medição sai separada do resto
 * (`measure`) porque ela é cara e vale por arquivo, enquanto o ganho muda a cada
 * clique no painel: refazer a análise a cada troca de alvo custaria uma passada
 * pelo arquivo inteiro para responder uma subtração.
 */
@Injectable({ providedIn: 'root' })
export class AudioNormalizerService {
  private readonly converter = inject(AudioConverterService);

  /** Uma passada pelo arquivo. Cara — o resultado é para ser guardado. */
  measure(buffer: AudioBuffer): LoudnessMeasurement {
    return measureLoudness(channelsOf(buffer), buffer.sampleRate);
  }

  /**
   * O ganho que leva a medida ao alvo, em dB, ou `null` quando não existe
   * resposta: um arquivo em silêncio digital não tem pico para escalar nem
   * loudness para corrigir, e multiplicar zero por qualquer coisa continua zero.
   */
  gainDbFor(measurement: LoudnessMeasurement, options: NormalizeAudioOptions): number | null {
    if (options.mode === 'peak') {
      if (measurement.peak <= 0) return null;
      return options.target - gainToDb(measurement.peak);
    }
    if (measurement.lufs === null) return null;
    return options.target - measurement.lufs;
  }

  /** Tamanho do arquivo de saída, sem produzi-lo. Alimenta o número do painel. */
  estimatedBytes(buffer: AudioBuffer, options: NormalizeAudioOptions): number {
    if (options.format === 'wav') {
      return wavByteLength(buffer.length, buffer.numberOfChannels);
    }
    return Math.round(((parseInt(options.bitrate, 10) * 1000) / 8) * buffer.duration);
  }

  async normalize(
    buffer: AudioBuffer,
    measurement: LoudnessMeasurement,
    options: NormalizeAudioOptions,
    onProgress?: (percent: number) => void,
  ): Promise<NormalizeResult> {
    onProgress?.(5);

    const gainDb = this.gainDbFor(measurement, options) ?? 0;
    const ceiling = dbToGain(options.ceiling);

    // O trabalho daqui para baixo é síncrono e longo. Sem esta pausa o overlay
    // de "processando" só apareceria depois de tudo pronto, que é o mesmo que
    // não aparecer.
    await nextFrame();

    const applied = applyGain(channelsOf(buffer), dbToGain(gainDb), ceiling, buffer.sampleRate);
    onProgress?.(55);

    /**
     * O loudness do resultado é a soma quando o limitador não entrou, e só é
     * remedido quando entrou — limitar tira energia, então anunciar `alvo` ali
     * seria anunciar um número que o arquivo não tem. A remedição custa outra
     * passada, e é por isso que ela é condicional em vez de padrão.
     */
    let resultLufs: number | null = null;
    if (measurement.lufs !== null) {
      resultLufs =
        applied.reductionDb > 0
          ? measureLoudness(applied.channels, buffer.sampleRate).lufs
          : measurement.lufs + gainDb;
    }
    onProgress?.(70);

    const blob =
      options.format === 'wav'
        ? encodeWav(applied.channels, buffer.sampleRate)
        : this.converter.encodeToMp3(
            toAudioBuffer(applied.channels, buffer.sampleRate),
            parseInt(options.bitrate, 10),
          );

    onProgress?.(100);

    return {
      blob,
      ext: options.format,
      gainDb,
      reductionDb: applied.reductionDb,
      peakDb: gainToDb(applied.peak),
      lufs: resultLufs,
    };
  }
}

function channelsOf(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
  return channels;
}

/**
 * O caminho MP3 precisa de um `AudioBuffer` porque `encodeToMp3` recebe um — e
 * ele é do convert-audio, que é o dono do encoder. O caminho WAV não passa por
 * aqui: `encodeWav` já escreve a partir dos Float32Array direto, e desviá-lo por
 * um AudioBuffer só para uniformizar custaria uma cópia inteira do arquivo.
 */
function toAudioBuffer(channels: readonly Float32Array[], sampleRate: number): AudioBuffer {
  const buffer = new AudioBuffer({
    length: channels[0].length,
    numberOfChannels: channels.length,
    sampleRate,
  });
  for (let ch = 0; ch < channels.length; ch++) buffer.copyToChannel(channels[ch], ch);
  return buffer;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
