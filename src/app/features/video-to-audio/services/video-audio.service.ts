import { Injectable, inject } from '@angular/core';
import { encodeWav, wavByteLength } from '../../../core/audio/wav';
import { renderAudio } from '../../../core/audio/render';
import {
  extractAudioTrack,
  type ExtractOptions,
  type ExtractedAudio,
} from '../../../core/video/extract-audio';
import { assertUsableVideo, probeVideo, type VideoProbe } from '../../../core/video/video-file.util';
import { AudioConverterService } from '../../convert-audio/services/audio-converter.service';

export type VideoAudioFormat = 'mp3' | 'wav';
export type VideoAudioChannels = 'original' | 'mono';
export type VideoAudioBitrate = '320' | '192' | '128' | '64';

export interface VideoAudioOptions {
  readonly format: VideoAudioFormat;
  readonly channels: VideoAudioChannels;
  /** Hz. `0` mantém a taxa com que o navegador decodificou. */
  readonly sampleRate: number;
  readonly bitrate: VideoAudioBitrate;
}

export interface VideoAudioSource extends ExtractedAudio {
  readonly probe: VideoProbe;
}

export interface EncodeResult {
  readonly blob: Blob;
  readonly ext: string;
}

/**
 * Serviço sem estado da ferramenta vídeo → áudio, na mesma forma dos serviços de
 * PDF: recebe File e opções, devolve Blob, lança AppError, informa progresso por
 * callback. Todo estado de UI fica no componente, para o Angular jogar fora na
 * navegação.
 *
 * A codificação é emprestada de `AudioConverterService` de propósito: o LAME em
 * JavaScript já está no bundle por causa de converter/comprimir áudio, e uma
 * segunda cópia do encoder aqui seria peso puro. É o mesmo empréstimo que
 * `AudioCompressorService` faz.
 */
@Injectable({ providedIn: 'root' })
export class VideoAudioService {
  private readonly converter = inject(AudioConverterService);

  /**
   * Abre o vídeo e extrai a trilha. Mede a duração ANTES de alocar qualquer
   * coisa — um arquivo de três horas é recusado sem nunca ter sido lido inteiro.
   */
  async open(file: File, options: ExtractOptions = {}): Promise<VideoAudioSource> {
    assertUsableVideo(file);
    const probe = await probeVideo(file);
    const extracted = await extractAudioTrack(file, probe, options);
    return { ...extracted, probe };
  }

  /**
   * Bytes que `encode` produziria, sem produzi-los. É o que permite mostrar o
   * tamanho antes de rodar, como em comprimir-áudio: um WAV de 20 minutos passa
   * de 200 MB e ninguém deveria descobrir isso depois do download.
   */
  estimatedBytes(buffer: AudioBuffer, options: VideoAudioOptions): number {
    const channels = options.channels === 'mono' ? 1 : buffer.numberOfChannels;
    const sampleRate = options.sampleRate > 0 ? options.sampleRate : buffer.sampleRate;

    if (options.format === 'wav') {
      return wavByteLength(Math.ceil(buffer.duration * sampleRate), channels);
    }
    return Math.round(((parseInt(options.bitrate, 10) * 1000) / 8) * buffer.duration);
  }

  async encode(
    buffer: AudioBuffer,
    options: VideoAudioOptions,
    onProgress?: (percent: number) => void,
  ): Promise<EncodeResult> {
    onProgress?.(5);

    const processed = await renderAudio(buffer, {
      channels: options.channels === 'mono' ? 1 : 0,
      sampleRate: options.sampleRate,
    });
    onProgress?.(35);

    if (options.format === 'wav') {
      const planar: Float32Array[] = [];
      for (let ch = 0; ch < processed.numberOfChannels; ch++) {
        planar.push(processed.getChannelData(ch));
      }
      const blob = encodeWav(planar, processed.sampleRate);
      onProgress?.(100);
      return { blob, ext: 'wav' };
    }

    const blob = this.converter.encodeToMp3(processed, parseInt(options.bitrate, 10), (pct) =>
      // O encoder informa 40→95 na própria escala; aqui já gastamos 35 na
      // renderização, então o intervalo é remapeado em vez de repetido.
      onProgress?.(35 + Math.round(((pct - 40) / 55) * 60)),
    );
    onProgress?.(100);
    return { blob, ext: 'mp3' };
  }
}
