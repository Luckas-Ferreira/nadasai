import { Injectable, inject } from '@angular/core';
import { channelsOf, toAudioBuffer } from '../../../core/audio/render';
import { applySpeed, durationAfter, type SpeedOptions } from '../../../core/audio/speed';
import { encodeWav } from '../../../core/audio/wav';
import { AudioConverterService } from '../../convert-audio/services/audio-converter.service';

export type SpeedOutputFormat = 'wav' | 'mp3';

export interface AudioSpeedRequest extends SpeedOptions {
  readonly buffer: AudioBuffer;
  readonly format: SpeedOutputFormat;
  readonly bitrate: number;
  readonly onProgress?: (percent: number) => void;
}

export interface AudioSpeedResult {
  readonly blob: Blob;
  readonly ext: string;
  readonly duration: number;
}

/**
 * Aplica velocidade e tom canal a canal.
 *
 * Toda a decisão está em `core/audio/speed.ts` — aqui só se percorre os canais,
 * se cede a thread entre eles e se escolhe o encoder. O WAV é o padrão pelo
 * mesmo motivo de sempre: recodificar para MP3 é uma segunda geração de perda
 * em cima da que o arquivo já trouxe, e quem quer MP3 pede MP3.
 */
@Injectable({ providedIn: 'root' })
export class AudioSpeedService {
  private readonly converter = inject(AudioConverterService);

  async apply(request: AudioSpeedRequest): Promise<AudioSpeedResult> {
    const { buffer, speed, pitchRatio, onProgress } = request;
    const sampleRate = buffer.sampleRate;

    const channels = channelsOf(buffer);
    const out: Float32Array[] = [];

    for (let c = 0; c < channels.length; c++) {
      out.push(applySpeed(channels[c], sampleRate, { speed, pitchRatio }));
      onProgress?.(Math.round(((c + 1) / (channels.length + 1)) * 100));

      // Esticar dezenas de milhões de amostras trava o quadro. Ceder entre os
      // canais é o que mantém a barra de progresso viva — mesma regra do
      // remover-silêncio.
      await nextFrame();
    }

    const blob =
      request.format === 'mp3'
        ? this.converter.encodeToMp3(toAudioBuffer(out, sampleRate), request.bitrate)
        : encodeWav(out, sampleRate);

    onProgress?.(100);

    return {
      blob,
      ext: request.format === 'mp3' ? 'mp3' : 'wav',
      duration: durationAfter(buffer.duration, speed),
    };
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
