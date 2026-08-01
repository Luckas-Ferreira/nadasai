import { Injectable } from '@angular/core';
import { AudioConverterService } from '../../convert-audio/services/audio-converter.service';

export type CompressBitrate = '320' | '192' | '128' | '64' | '32';
export type CompressChannels = 'original' | 'stereo' | 'mono';

export interface CompressAudioOptions {
  bitrate: CompressBitrate;
  channels: CompressChannels;
  sampleRate: number; // 0 = original
  sourceFormat: string; // e.g. 'mp3', 'wav'
}

export interface CompressResult {
  blob: Blob;
  /** Actual extension of the output file */
  ext: string;
}

@Injectable({ providedIn: 'root' })
export class AudioCompressorService {
  constructor(private readonly converter: AudioConverterService) {}

  /**
   * Estimated output size in bytes based on the target bitrate.
   */
  estimatedBytes(buffer: AudioBuffer, options: CompressAudioOptions): number {
    const bps = parseInt(options.bitrate, 10) * 1000;
    return Math.round((bps / 8) * buffer.duration);
  }

  /**
   * Compresses `buffer` by re-encoding it at the specified bitrate.
   * Uses fast pure JS LAME MP3 encoding so it finishes instantly in memory
   * and produces 100% playable MP3 files.
   */
  async compress(
    buffer: AudioBuffer,
    options: CompressAudioOptions,
    onProgress?: (pct: number) => void
  ): Promise<CompressResult> {
    onProgress?.(10);

    const targetSr = options.sampleRate > 0 ? options.sampleRate : buffer.sampleRate;
    let targetCh = buffer.numberOfChannels;
    if (options.channels === 'mono') targetCh = 1;
    else if (options.channels === 'stereo') targetCh = 2;

    const frames = Math.ceil(buffer.duration * targetSr);
    const offCtx = new OfflineAudioContext(targetCh, frames, targetSr);
    const src = offCtx.createBufferSource();
    src.buffer = buffer;

    if (options.channels === 'mono' && buffer.numberOfChannels > 1) {
      const splitter = offCtx.createChannelSplitter(buffer.numberOfChannels);
      const merger = offCtx.createChannelMerger(1);
      src.connect(splitter);
      for (let i = 0; i < buffer.numberOfChannels; i++) splitter.connect(merger, i, 0);
      merger.connect(offCtx.destination);
    } else {
      src.connect(offCtx.destination);
    }

    src.start(0);
    const processedBuffer = await offCtx.startRendering();
    onProgress?.(40);

    const kbps = parseInt(options.bitrate, 10) || 128;
    const blob = this.converter.encodeToMp3(processedBuffer, kbps, onProgress);
    onProgress?.(100);

    return { blob, ext: 'mp3' };
  }
}
