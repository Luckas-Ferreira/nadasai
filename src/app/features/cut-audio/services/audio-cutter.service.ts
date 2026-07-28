import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';
import { encodeWav } from '../../../core/audio/wav';
import { suffixedName } from '../../../core/image/image-file.util';

export type CutMode = 'keep' | 'remove';

export interface CutOptions {
  readonly buffer: AudioBuffer;
  readonly originalName: string;
  /** Selection bounds in seconds, on the source timeline. */
  readonly start: number;
  readonly end: number;
  readonly mode: CutMode;
  readonly fadeIn: number;
  readonly fadeOut: number;
  readonly onProgress?: (percent: number) => void;
}

export interface CutResult {
  readonly blob: Blob;
  readonly filename: string;
  readonly duration: number;
}

/**
 * Roughly 4 ms of dip either side of a splice.
 *
 * `remove` joins two pieces of audio that were never adjacent, so the waveform
 * almost always steps from one amplitude to another in a single sample — which
 * is a click, and a loud one on headphones. Ramping the last few milliseconds of
 * the head down and the first few of the tail up hides it; the cost is 4 ms of
 * level on either side of a join the user asked for anyway.
 */
const SPLICE_FADE_SECONDS = 0.004;

/**
 * Cuts a decoded buffer and encodes the result. Stateless, like every other
 * tool service: it takes the buffer and the settings, hands back a Blob, and
 * keeps no signals of its own so Angular can drop the component on navigation.
 *
 * The work is plain sample copying rather than an OfflineAudioContext render.
 * A render would mean a second full copy of the audio living inside the audio
 * thread while ours is still resident, for gain ramps that are four lines of
 * arithmetic here — and it would resample the output to the context rate, which
 * is exactly the quality loss this tool exists to avoid.
 */
@Injectable({ providedIn: 'root' })
export class AudioCutterService {
  async cut(opts: CutOptions): Promise<CutResult> {
    const buffer = opts.buffer;
    const sampleRate = buffer.sampleRate;
    const frames = buffer.length;

    const startFrame = clampFrame(Math.round(opts.start * sampleRate), frames);
    const endFrame = clampFrame(Math.round(opts.end * sampleRate), frames);
    if (endFrame <= startFrame) throw new AppError('audio_empty_selection');

    const segments: Array<[number, number]> =
      opts.mode === 'keep'
        ? [[startFrame, endFrame]]
        : [
            [0, startFrame],
            [endFrame, frames],
          ];

    const kept = segments.filter(([from, to]) => to > from);
    const total = kept.reduce((sum, [from, to]) => sum + (to - from), 0);
    if (total === 0) throw new AppError('audio_empty_selection');

    const channelCount = buffer.numberOfChannels;
    const out: Float32Array[] = [];

    for (let ch = 0; ch < channelCount; ch++) {
      const source = buffer.getChannelData(ch);
      const target = new Float32Array(total);

      const joins: number[] = [];
      let offset = 0;
      for (const [from, to] of kept) {
        target.set(source.subarray(from, to), offset);
        offset += to - from;
        // Every join except the one at the very end of the result.
        if (offset < total) joins.push(offset);
      }

      // After the copy, never during it. Dipping inside the loop ramps samples
      // the next `set()` has not written yet — the fade-out side of the join
      // survives, the fade-in side is overwritten by the segment that follows,
      // and the click the dip exists to kill comes back on the second half.
      for (const join of joins) applySpliceDip(target, join, sampleRate);

      applyFadeIn(target, Math.round(opts.fadeIn * sampleRate));
      applyFadeOut(target, Math.round(opts.fadeOut * sampleRate));

      out.push(target);
      opts.onProgress?.(Math.round(((ch + 1) / (channelCount + 1)) * 100));

      // Copying tens of millions of floats blocks the frame. Yielding between
      // channels is what lets the progress bar under the waveform actually move
      // instead of jumping from 0 to gone.
      await nextFrame();
    }

    const blob = encodeWav(out, sampleRate);
    opts.onProgress?.(100);

    return {
      blob,
      filename: suffixedName(opts.originalName, 'cut', 'wav'),
      duration: total / sampleRate,
    };
  }
}

function clampFrame(frame: number, frames: number): number {
  return Math.max(0, Math.min(frames, frame));
}

/** Ramps down into `joinFrame` and back up out of it. */
function applySpliceDip(data: Float32Array, joinFrame: number, sampleRate: number): void {
  const span = Math.max(1, Math.round(SPLICE_FADE_SECONDS * sampleRate));

  const outFrom = Math.max(0, joinFrame - span);
  const outSpan = joinFrame - outFrom;
  for (let i = 0; i < outSpan; i++) {
    data[outFrom + i] *= 1 - (i + 1) / outSpan;
  }

  const inTo = Math.min(data.length, joinFrame + span);
  const inSpan = inTo - joinFrame;
  for (let i = 0; i < inSpan; i++) {
    data[joinFrame + i] *= (i + 1) / inSpan;
  }
}

/**
 * Linear in amplitude, which is what every editor's plain "fade in" does and
 * what the number in the panel claims: two seconds of fade means the level is
 * halfway at one second. A perceptual curve would sound smoother and make the
 * field lie about where the midpoint is.
 */
function applyFadeIn(data: Float32Array, span: number): void {
  const length = Math.min(span, data.length);
  for (let i = 0; i < length; i++) data[i] *= i / length;
}

function applyFadeOut(data: Float32Array, span: number): void {
  const length = Math.min(span, data.length);
  const from = data.length - length;
  for (let i = 0; i < length; i++) data[from + i] *= 1 - i / length;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
