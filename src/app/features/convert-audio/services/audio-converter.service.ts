import { Injectable } from '@angular/core';
import { Mp3Encoder } from '@breezystack/lamejs';

export type TargetAudioFormat = 'wav' | 'mp3' | 'ogg' | 'webm' | 'm4a' | 'flac';
export type AudioChannels = 'original' | 'stereo' | 'mono';
export type AudioBitrate = '320' | '192' | '128';

export interface ConvertAudioOptions {
  targetFormat: TargetAudioFormat;
  channels: AudioChannels;
  sampleRate: number; // e.g. 0 (original), 48000, 44100, 22050
  bitrate: AudioBitrate;
}

export interface ConvertResult {
  blob: Blob;
  /** Actual file extension to use */
  ext: string;
}

@Injectable({
  providedIn: 'root',
})
export class AudioConverterService {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Decodes an audio file into an AudioBuffer.
   */
  async decodeAudio(file: File): Promise<{ buffer: AudioBuffer; duration: number; format: string }> {
    const arrayBuffer = await file.arrayBuffer();
    const ctx = this.getAudioContext();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const format = file.name.split('.').pop()?.toLowerCase() || 'audio';

    return {
      buffer,
      duration: buffer.duration,
      format,
    };
  }

  /**
   * Converts the input AudioBuffer to the requested target format & options.
   *
   * Fast, in-memory encoding:
   * - MP3: Pure JS LAME encoder (instant, 100% compliant MP3)
   * - WAV / FLAC: Instant 16-bit PCM WAV Blob
   * - OGG / WebM / M4A: Native MediaRecorder if supported, otherwise instant MP3 fallback
   */
  async convertAudio(
    buffer: AudioBuffer,
    options: ConvertAudioOptions,
    onProgress?: (percent: number) => void
  ): Promise<ConvertResult> {
    onProgress?.(10);

    const processedBuffer = await this.processBuffer(buffer, options);
    onProgress?.(40);

    const format = options.targetFormat;
    const kbps = parseInt(options.bitrate, 10) || 192;

    // ── 1. MP3 Format (Fast Pure JS LAME Encoding)
    if (format === 'mp3') {
      const blob = this.encodeToMp3(processedBuffer, kbps, onProgress);
      onProgress?.(100);
      return { blob, ext: 'mp3' };
    }

    // ── 2. WAV / FLAC (Instant PCM WAV Encoding)
    if (format === 'wav' || format === 'flac') {
      const blob = this.audioBufferToWavBlob(processedBuffer);
      onProgress?.(100);
      return { blob, ext: format };
    }

    // ── 3. OGG / WebM / M4A (Try Native MediaRecorder if available)
    const nativeMime = this.getMimeTypeForFormat(format);
    if (nativeMime && typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(nativeMime)) {
      try {
        const bps = kbps * 1000;
        const blob = await this.encodeViaMediaRecorder(processedBuffer, nativeMime, bps, onProgress);
        onProgress?.(100);
        return { blob, ext: format };
      } catch (e) {
        console.warn(`[AudioConverterService] MediaRecorder native encoding for ${format} failed:`, e);
      }
    }

    // ── Fallback for missing native formats: Instant MP3
    const fallbackBlob = this.encodeToMp3(processedBuffer, kbps, onProgress);
    onProgress?.(100);
    return { blob: fallbackBlob, ext: 'mp3' };
  }

  /**
   * Encodes AudioBuffer into a true MP3 Blob using LAME (pure JS, instant).
   */
  encodeToMp3(
    buffer: AudioBuffer,
    kbps: number,
    onProgress?: (percent: number) => void
  ): Blob {
    const channels = buffer.numberOfChannels === 1 ? 1 : 2;
    const sampleRate = buffer.sampleRate;
    const encoder = new Mp3Encoder(channels, sampleRate, kbps);

    const left = buffer.getChannelData(0);
    const right = channels > 1 ? buffer.getChannelData(1) : left;
    const sampleCount = left.length;

    const leftInt16 = new Int16Array(sampleCount);
    const rightInt16 = channels > 1 ? new Int16Array(sampleCount) : leftInt16;

    for (let i = 0; i < sampleCount; i++) {
      const l = Math.max(-1, Math.min(1, left[i]));
      leftInt16[i] = l < 0 ? l * 0x8000 : l * 0x7fff;
      if (channels > 1) {
        const r = Math.max(-1, Math.min(1, right[i]));
        rightInt16[i] = r < 0 ? r * 0x8000 : r * 0x7fff;
      }
    }

    const mp3Chunks: Uint8Array[] = [];
    const blockSize = 1152;
    for (let i = 0; i < sampleCount; i += blockSize) {
      const lChunk = leftInt16.subarray(i, i + blockSize);
      let buf: Int8Array | Uint8Array;
      if (channels === 1) {
        buf = encoder.encodeBuffer(lChunk);
      } else {
        const rChunk = rightInt16.subarray(i, i + blockSize);
        buf = encoder.encodeBuffer(lChunk, rChunk);
      }
      if (buf.length > 0) {
        mp3Chunks.push(new Uint8Array(buf));
      }
      if (onProgress && i % (blockSize * 50) === 0) {
        onProgress(40 + Math.floor((i / sampleCount) * 55));
      }
    }

    const end = encoder.flush();
    if (end.length > 0) {
      mp3Chunks.push(new Uint8Array(end));
    }

    return new Blob(mp3Chunks, { type: 'audio/mp3' });
  }

  /**
   * Process channel count and sample rate adjustments via OfflineAudioContext
   */
  private async processBuffer(buffer: AudioBuffer, options: ConvertAudioOptions): Promise<AudioBuffer> {
    const targetSampleRate = options.sampleRate > 0 ? options.sampleRate : buffer.sampleRate;
    let targetNumChannels = buffer.numberOfChannels;

    if (options.channels === 'mono') {
      targetNumChannels = 1;
    } else if (options.channels === 'stereo') {
      targetNumChannels = 2;
    }

    const offlineCtx = new OfflineAudioContext(
      targetNumChannels,
      Math.ceil(buffer.duration * targetSampleRate),
      targetSampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;

    if (options.channels === 'mono' && buffer.numberOfChannels > 1) {
      const merger = offlineCtx.createChannelMerger(1);
      const splitter = offlineCtx.createChannelSplitter(buffer.numberOfChannels);

      source.connect(splitter);
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        splitter.connect(merger, i, 0);
      }
      merger.connect(offlineCtx.destination);
    } else {
      source.connect(offlineCtx.destination);
    }

    source.start(0);
    return await offlineCtx.startRendering();
  }

  private getMimeTypeForFormat(format: TargetAudioFormat): string | null {
    switch (format) {
      case 'webm':
        return 'audio/webm;codecs=opus';
      case 'ogg':
        return MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : null;
      case 'm4a':
        if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
        if (MediaRecorder.isTypeSupported('audio/aac')) return 'audio/aac';
        return null;
      default:
        return null;
    }
  }

  private encodeViaMediaRecorder(
    buffer: AudioBuffer,
    mimeType: string,
    bps: number,
    onProgress?: (percent: number) => void
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx({ sampleRate: buffer.sampleRate });

      const destination = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(destination.stream, {
          mimeType,
          audioBitsPerSecond: bps,
        });
      } catch (e) {
        void ctx.close();
        reject(e);
        return;
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        void ctx.close();
        const finalBlob = new Blob(chunks, { type: mimeType });
        resolve(finalBlob);
      };

      recorder.onerror = (e) => {
        void ctx.close();
        reject(e);
      };

      source.onended = () => {
        if (recorder.state === 'recording') recorder.stop();
      };

      const startTime = Date.now();
      const durationMs = buffer.duration * 1000;

      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(95, 40 + Math.floor((elapsed / durationMs) * 55));
        onProgress?.(pct);
        if (elapsed >= durationMs) clearInterval(progressInterval);
      }, 100);

      recorder.start(100);
      source.start(0);
    });
  }

  /**
   * Encodes an AudioBuffer into a 16-bit PCM WAV Blob (instant, synchronous).
   */
  audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;

    let interleaved: Float32Array;
    if (numChannels === 2) {
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      interleaved = new Float32Array(left.length + right.length);
      for (let i = 0; i < left.length; i++) {
        interleaved[i * 2] = left[i];
        interleaved[i * 2 + 1] = right[i];
      }
    } else {
      interleaved = buffer.getChannelData(0);
    }

    const dataLength = interleaved.length * 2;
    const bufferArray = new ArrayBuffer(44 + dataLength);
    const view = new DataView(bufferArray);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < interleaved.length; i++, offset += 2) {
      const sample = Math.max(-1, Math.min(1, interleaved[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    return new Blob([bufferArray], { type: 'audio/wav' });
  }
}
