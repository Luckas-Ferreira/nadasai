import { Injectable } from '@angular/core';

export interface TrimOptions {
  startTime: number;
  endTime: number;
  fadeIn: number;  // in seconds
  fadeOut: number; // in seconds
  format?: 'wav' | 'mp3';
}

@Injectable({
  providedIn: 'root',
})
export class AudioTrimmerService {
  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Decodes an audio file (MP3, WAV, OGG, M4A, AAC, FLAC) into an AudioBuffer.
   */
  async decodeAudio(file: File): Promise<{ buffer: AudioBuffer; duration: number }> {
    const arrayBuffer = await file.arrayBuffer();
    const ctx = this.getAudioContext();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    return {
      buffer,
      duration: buffer.duration,
    };
  }

  /**
   * Draws a professional visual waveform onto a canvas element with high DPI scaling.
   */
  renderWaveform(
    canvas: HTMLCanvasElement,
    buffer: AudioBuffer,
    startTime: number,
    endTime: number,
    playheadTime: number | null = null
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;

    // High DPI Canvas crispness
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

    const startPx = (startTime / duration) * width;
    const endPx = (endTime / duration) * width;

    // Background selection region highlight
    ctx.fillStyle = 'rgba(124, 58, 237, 0.12)';
    ctx.fillRect(startPx, 0, endPx - startPx, height);

    // Draw Waveform bars
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

      const inSelection = i >= startPx && i <= endPx;
      ctx.fillStyle = inSelection ? '#8b5cf6' : 'rgba(148, 163, 184, 0.4)';

      ctx.fillRect(i, y, 1.5, barHeight);
    }

    // Start handle line (Green / Primary)
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(startPx, 0);
    ctx.lineTo(startPx, height);
    ctx.stroke();

    // End handle line (Red / Rose)
    ctx.strokeStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(endPx, 0);
    ctx.lineTo(endPx, height);
    ctx.stroke();

    // Playhead line (White / Amber)
    if (playheadTime !== null && playheadTime >= 0 && playheadTime <= duration) {
      const playPx = (playheadTime / duration) * width;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(playPx, 0);
      ctx.lineTo(playPx, height);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Cuts the AudioBuffer from startTime to endTime, applies Fade In/Out, and exports to a WAV Blob.
   */
  async trimAudio(buffer: AudioBuffer, options: TrimOptions): Promise<Blob> {
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;

    const startSample = Math.floor(options.startTime * sampleRate);
    const endSample = Math.floor(options.endTime * sampleRate);
    const trimmedLength = Math.max(1, endSample - startSample);

    const ctx = this.getAudioContext();
    const trimmedBuffer = ctx.createBuffer(numChannels, trimmedLength, sampleRate);

    const fadeInSamples = Math.floor((options.fadeIn || 0) * sampleRate);
    const fadeOutSamples = Math.floor((options.fadeOut || 0) * sampleRate);

    for (let c = 0; c < numChannels; c++) {
      const srcData = buffer.getChannelData(c);
      const destData = trimmedBuffer.getChannelData(c);

      for (let i = 0; i < trimmedLength; i++) {
        let sample = srcData[startSample + i] || 0;

        // Apply Fade In gain ramp
        if (fadeInSamples > 0 && i < fadeInSamples) {
          sample *= i / fadeInSamples;
        }

        // Apply Fade Out gain ramp
        if (fadeOutSamples > 0 && i > trimmedLength - fadeOutSamples) {
          const remaining = trimmedLength - i;
          sample *= Math.max(0, remaining / fadeOutSamples);
        }

        destData[i] = sample;
      }
    }

    // Encode trimmed AudioBuffer to high-fidelity 16-bit PCM WAV Blob
    return this.audioBufferToWavBlob(trimmedBuffer);
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
    view.setUint32(16, 16, true); // subchunk1size (16 for PCM)
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);

    // DATA sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Write PCM samples
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
}
