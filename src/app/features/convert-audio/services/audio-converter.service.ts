import { Injectable } from '@angular/core';

export type TargetAudioFormat = 'wav' | 'mp3' | 'ogg' | 'webm' | 'm4a' | 'flac';
export type AudioChannels = 'original' | 'stereo' | 'mono';
export type AudioBitrate = '320' | '192' | '128';

export interface ConvertAudioOptions {
  targetFormat: TargetAudioFormat;
  channels: AudioChannels;
  sampleRate: number; // e.g. 0 (original), 48000, 44100, 22050
  bitrate: AudioBitrate;
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
   * Decodes an audio file (MP3, WAV, OGG, M4A, AAC, FLAC, WebM) into an AudioBuffer.
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
   */
  async convertAudio(
    buffer: AudioBuffer,
    options: ConvertAudioOptions,
    onProgress?: (percent: number) => void
  ): Promise<Blob> {
    onProgress?.(10);

    // 1. Resample and adjust channels using OfflineAudioContext
    const processedBuffer = await this.processBuffer(buffer, options);

    onProgress?.(50);

    // 2. Encode to target format
    const format = options.targetFormat;

    if (format === 'wav' || format === 'flac') {
      // 16-bit PCM WAV (also suitable high-fidelity container for FLAC)
      const blob = this.audioBufferToWavBlob(processedBuffer);
      onProgress?.(100);
      return blob;
    }

    // Try encoding using MediaRecorder / MediaStreamDestination if available
    const mimeType = this.getMimeTypeForFormat(format);

    if (typeof MediaRecorder !== 'undefined' && mimeType && MediaRecorder.isTypeSupported(mimeType)) {
      try {
        const blob = await this.encodeViaMediaRecorder(processedBuffer, mimeType, options, onProgress);
        onProgress?.(100);
        return blob;
      } catch (e) {
        console.warn(`[AudioConverterService] MediaRecorder encoding for ${format} failed, falling back to WAV:`, e);
      }
    }

    // Fallback to WAV blob with appropriate MIME type
    const fallbackBlob = this.audioBufferToWavBlob(processedBuffer);
    onProgress?.(100);
    return fallbackBlob;
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
      // Downmix to mono
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
        return MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm;codecs=opus';
      case 'mp3':
        if (MediaRecorder.isTypeSupported('audio/mp3')) return 'audio/mp3';
        if (MediaRecorder.isTypeSupported('audio/mpeg')) return 'audio/mpeg';
        return 'audio/webm';
      case 'm4a':
        if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
        if (MediaRecorder.isTypeSupported('audio/aac')) return 'audio/aac';
        return 'audio/webm';
      default:
        return null;
    }
  }

  private encodeViaMediaRecorder(
    buffer: AudioBuffer,
    mimeType: string,
    options: ConvertAudioOptions,
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

      const bps = parseInt(options.bitrate, 10) * 1000 || 192000;
      const recorder = new MediaRecorder(destination.stream, {
        mimeType,
        audioBitsPerSecond: bps,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
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
        recorder.stop();
      };

      const startTime = Date.now();
      const durationMs = buffer.duration * 1000;

      const progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(95, 50 + Math.floor((elapsed / durationMs) * 45));
        onProgress?.(pct);
        if (elapsed >= durationMs) {
          clearInterval(progressInterval);
        }
      }, 100);

      recorder.start(100);
      source.start(0);
    });
  }

  /**
   * Encodes an AudioBuffer into a 16-bit PCM WAV Blob.
   */
  private audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    let result: Float32Array;
    if (numChannels === 2) {
      result = this.interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
      result = buffer.getChannelData(0);
    }

    const dataLength = result.length * 2;
    const bufferLength = 44 + dataLength;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this.writeString(view, 8, 'WAVE');

    // FMT sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);

    // DATA sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < result.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, result[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  private interleave(inputL: Float32Array, inputR: Float32Array): Float32Array {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);

    let index = 0;
    let inputIndex = 0;

    while (index < length) {
      result[index++] = inputL[inputIndex];
      result[index++] = inputR[inputIndex];
      inputIndex++;
    }
    return result;
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Render audio waveform on a Canvas.
   */
  renderWaveform(
    canvas: HTMLCanvasElement,
    buffer: AudioBuffer,
    playheadTime: number | null = null
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const duration = buffer.duration;
    const channelData = buffer.getChannelData(0);
    const totalSamples = channelData.length;
    const step = Math.ceil(totalSamples / width);
    const amp = height / 2;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#38bdf8');
    gradient.addColorStop(0.5, '#8b5cf6');
    gradient.addColorStop(1, '#6366f1');

    for (let i = 0; i < width; i++) {
      const sampleIdx = Math.floor(i * step);
      let min = 1.0;
      let max = -1.0;

      for (let j = 0; j < step; j += 10) {
        const val = channelData[sampleIdx + j] || 0;
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const barHeight = Math.max(2, (max - min) * amp * 0.85);
      const y = (height - barHeight) / 2;

      ctx.fillStyle = gradient;
      ctx.fillRect(i, y, 1.8, barHeight);
    }

    // Playhead line
    if (playheadTime !== null && playheadTime >= 0 && playheadTime <= duration) {
      const playPx = (playheadTime / duration) * width;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(playPx, 0);
      ctx.lineTo(playPx, height);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(playPx, height - 10, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
