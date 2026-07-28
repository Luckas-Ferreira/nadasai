import { AppError } from '../errors';

const HEADER_BYTES = 44;
const BITS_PER_SAMPLE = 16;

/**
 * Encodes planar float PCM into a 16-bit little-endian RIFF/WAVE blob.
 *
 * WAV is the only format this app can write without pulling in an encoder, and
 * that constraint is a licence decision as much as a size one: every JS MP3
 * encoder worth using is a LAME port under the LGPL, which is exactly the kind
 * of copyleft dependency this product already refused once (see the background
 * removal engine). WAV costs the user disk space and costs us nothing else.
 *
 * The asymmetric scaling is not a typo. Two's-complement 16-bit runs from
 * -32768 to +32767, so multiplying both directions by 32767 wastes the most
 * negative code, and multiplying both by 32768 clips every full-scale positive
 * peak into a wrap-around crackle.
 */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number): Blob {
  if (!channels.length) throw new AppError('encode_failed');

  const frames = channels[0].length;
  const channelCount = channels.length;
  const bytesPerFrame = channelCount * (BITS_PER_SAMPLE / 8);
  const dataBytes = frames * bytesPerFrame;

  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');

  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk length
  view.setUint16(20, 1, true); // format 1 = uncompressed PCM
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true); // byte rate
  view.setUint16(32, bytesPerFrame, true); // block align
  view.setUint16(34, BITS_PER_SAMPLE, true);

  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  // Interleaved, because that is what the data chunk is: frame by frame, every
  // channel of a frame side by side.
  const samples = new Int16Array(buffer, HEADER_BYTES, frames * channelCount);
  let out = 0;
  for (let frame = 0; frame < frames; frame++) {
    for (let ch = 0; ch < channelCount; ch++) {
      const sample = channels[ch][frame];
      const clamped = sample > 1 ? 1 : sample < -1 ? -1 : sample;
      samples[out++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/** Bytes `encodeWav` will produce, without producing them. Drives the size readout. */
export function wavByteLength(frames: number, channelCount: number): number {
  return HEADER_BYTES + frames * channelCount * (BITS_PER_SAMPLE / 8);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
