import { Injectable, inject } from '@angular/core';
import { AppError } from '../../../core/errors';
import { findSilence, type KeepRange, type SilenceOptions } from '../../../core/audio/silence';
import { encodeWav } from '../../../core/audio/wav';
import { AudioConverterService } from '../../convert-audio/services/audio-converter.service';

export type SilenceOutputFormat = 'wav' | 'mp3';

export interface RemoveSilenceOptions extends SilenceOptions {
  readonly buffer: AudioBuffer;
  readonly format: SilenceOutputFormat;
  readonly bitrate: number;
  readonly onProgress?: (percent: number) => void;
}

export interface RemoveSilenceResult {
  readonly blob: Blob;
  readonly ext: string;
  readonly removedSeconds: number;
  readonly newDuration: number;
  readonly cuts: number;
}

/**
 * ~4 ms de queda de cada lado de uma emenda.
 *
 * Idêntico ao do cortador, e pelo mesmo motivo: remover um silêncio junta dois
 * pedaços que nunca foram vizinhos, e a forma de onda salta de uma amplitude
 * para outra numa amostra só — o que é um clique, alto no fone. Aqui o problema
 * é PIOR que no cortador, porque uma gravação de meia hora pode ter cinquenta
 * emendas em vez de uma.
 */
const SPLICE_FADE_SECONDS = 0.004;

@Injectable({ providedIn: 'root' })
export class RemoveSilenceService {
  private readonly converter = inject(AudioConverterService);

  /** Só a análise, para o painel mostrar o que vai acontecer antes de acontecer. */
  analyse(buffer: AudioBuffer, options: SilenceOptions) {
    return findSilence(channelsOf(buffer), buffer.sampleRate, options);
  }

  async remove(options: RemoveSilenceOptions): Promise<RemoveSilenceResult> {
    const { buffer, onProgress } = options;
    const sampleRate = buffer.sampleRate;

    const analysis = findSilence(channelsOf(buffer), sampleRate, options);
    const keep = analysis.keep;

    const total = keep.reduce((sum, [from, to]) => sum + (to - from), 0);
    if (total === 0) throw new AppError('audio_empty_selection');

    const out: Float32Array[] = [];

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const source = buffer.getChannelData(ch);
      const target = new Float32Array(total);

      const joins = copyRanges(source, target, keep, total);

      // Depois da cópia, nunca durante — a mesma armadilha que o cortador
      // documenta: aplicar a queda dentro do laço rampa amostras que o `set()`
      // seguinte ainda não escreveu, a metade de entrada é sobrescrita, e o
      // clique volta só de um lado da emenda.
      for (const join of joins) applySpliceDip(target, join, sampleRate);

      out.push(target);
      onProgress?.(Math.round(((ch + 1) / (buffer.numberOfChannels + 1)) * 100));

      // Copiar dezenas de milhões de floats trava o quadro. Ceder entre canais
      // é o que deixa a barra de progresso se mexer.
      await nextFrame();
    }

    const blob =
      options.format === 'mp3'
        ? this.converter.encodeToMp3(toAudioBuffer(out, sampleRate), options.bitrate)
        : encodeWav(out, sampleRate);

    onProgress?.(100);

    return {
      blob,
      ext: options.format === 'mp3' ? 'mp3' : 'wav',
      removedSeconds: analysis.removedFrames / sampleRate,
      newDuration: total / sampleRate,
      cuts: analysis.silenceCount,
    };
  }
}

function channelsOf(buffer: AudioBuffer): Float32Array[] {
  const out: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) out.push(buffer.getChannelData(c));
  return out;
}

/** Copia os trechos mantidos e devolve os deslocamentos onde eles se encontram. */
function copyRanges(
  source: Float32Array,
  target: Float32Array,
  keep: readonly KeepRange[],
  total: number,
): number[] {
  const joins: number[] = [];
  let offset = 0;

  for (const [from, to] of keep) {
    target.set(source.subarray(from, to), offset);
    offset += to - from;
    if (offset < total) joins.push(offset);
  }

  return joins;
}

function applySpliceDip(target: Float32Array, at: number, sampleRate: number): void {
  const fade = Math.max(1, Math.round(SPLICE_FADE_SECONDS * sampleRate));

  const from = Math.max(0, at - fade);
  for (let i = from; i < at; i++) target[i] *= (at - i) / fade;

  const to = Math.min(target.length, at + fade);
  for (let i = at; i < to; i++) target[i] *= (i - at) / fade;
}

function toAudioBuffer(channels: readonly Float32Array[], sampleRate: number): AudioBuffer {
  const length = Math.max(1, channels[0]?.length ?? 0);
  const ctx = new OfflineAudioContext(channels.length, length, sampleRate);
  const buffer = ctx.createBuffer(channels.length, length, sampleRate);

  for (let c = 0; c < channels.length; c++) buffer.copyToChannel(channels[c], c);
  return buffer;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
