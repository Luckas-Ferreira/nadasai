import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';
import { encodeWav } from '../../../core/audio/wav';
import { baseName } from '../../../core/image/image-file.util';

export interface MergeTrack {
  readonly buffer: AudioBuffer;
  readonly name: string;
}

export interface MergeOptions {
  readonly tracks: readonly MergeTrack[];
  /** Seconds of equal-power overlap between consecutive tracks. */
  readonly crossfade: number;
  /** Seconds of silence between consecutive tracks. Mutually exclusive with crossfade. */
  readonly gap: number;
  readonly fadeIn: number;
  readonly fadeOut: number;
  readonly onProgress?: (percent: number) => void;
}

export interface MergeResult {
  readonly blob: Blob;
  readonly filename: string;
  readonly duration: number;
}

/** Roughly 4 ms of dip either side of a butt join, same as the cutter's. */
const SPLICE_FADE_SECONDS = 0.004;

/**
 * Joins decoded buffers into one file. Stateless, like every other tool service.
 *
 * Two things it has to normalise before any of the arithmetic works, and both
 * are the normal case rather than an edge one:
 *
 * - **Channel count.** Dropping a mono voice note next to a stereo song is the
 *   whole point of a joiner. The output takes the widest track and mono is
 *   duplicated across the channels; taking the NARROWEST instead would silently
 *   fold somebody's stereo mix to mono because one clip was a voice memo.
 * - **Sample rate.** Every buffer here came out of the same AudioContext, so the
 *   rates already match — `decodeAudioData` resamples to the context rate. The
 *   check stays because a mismatch would not throw, it would just play the rest
 *   of the file at the wrong speed, and that is a bug nobody would trace back
 *   here.
 */
@Injectable({ providedIn: 'root' })
export class AudioMergerService {
  async merge(opts: MergeOptions): Promise<MergeResult> {
    const tracks = opts.tracks.filter((track) => track.buffer.length > 0);
    if (tracks.length < 2) throw new AppError('audio_needs_two');

    const sampleRate = tracks[0].buffer.sampleRate;
    if (tracks.some((track) => track.buffer.sampleRate !== sampleRate)) {
      throw new AppError('audio_rate_mismatch');
    }

    const channelCount = Math.max(...tracks.map((track) => track.buffer.numberOfChannels));
    const lengths = tracks.map((track) => track.buffer.length);

    // A crossfade longer than half the shortest track would run past that
    // track's own start, so the clamp is arithmetic, not a preference.
    const overlap =
      opts.crossfade > 0
        ? Math.min(Math.round(opts.crossfade * sampleRate), Math.floor(Math.min(...lengths) / 2))
        : 0;
    // Silence between tracks only makes sense when they are not overlapping.
    const gap = overlap > 0 ? 0 : Math.max(0, Math.round(opts.gap * sampleRate));

    const spacing = gap - overlap;
    const total = lengths.reduce((sum, length) => sum + length, 0) + spacing * (tracks.length - 1);
    if (total <= 0) throw new AppError('audio_empty_selection');

    const out: Float32Array[] = [];
    for (let ch = 0; ch < channelCount; ch++) out.push(new Float32Array(total));

    const joins: number[] = [];
    let offset = 0;

    for (let i = 0; i < tracks.length; i++) {
      const buffer = tracks[i].buffer;
      const length = lengths[i];

      for (let ch = 0; ch < channelCount; ch++) {
        // Mono into stereo: the same data on both sides, not silence on one.
        const source = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
        const target = out[ch];

        if (overlap > 0) {
          const fadeIn = i > 0 ? overlap : 0;
          const fadeOut = i < tracks.length - 1 ? overlap : 0;
          mixEqualPower(target, source, offset, length, fadeIn, fadeOut);
        } else {
          target.set(source.subarray(0, length), offset);
        }
      }

      if (overlap === 0 && gap === 0 && i < tracks.length - 1) joins.push(offset + length);

      offset += length + spacing;
      opts.onProgress?.(Math.round(((i + 1) / (tracks.length + 1)) * 100));
      await nextFrame();
    }

    for (const channel of out) {
      // Only where two tracks butt straight up against each other. A gap has
      // silence at the seam and a crossfade has no seam, so neither clicks.
      for (const join of joins) applySpliceDip(channel, join, sampleRate);

      applyFadeIn(channel, Math.round(opts.fadeIn * sampleRate));
      applyFadeOut(channel, Math.round(opts.fadeOut * sampleRate));
    }

    const blob = encodeWav(out, sampleRate);
    opts.onProgress?.(100);

    return {
      blob,
      // From the FIRST track, the way img-to-pdf names from page one: the merged
      // file is that track continued, and `originalName` means nothing here
      // because there are several originals.
      filename: `${baseName(tracks[0].name)}-merged.wav`,
      duration: total / sampleRate,
    };
  }
}

/**
 * Adds a track into the output under an equal-power ramp, rather than writing
 * over what is there.
 *
 * `set()` would work for a butt join and is wrong the moment tracks overlap: the
 * incoming head has to be SUMMED with the outgoing tail of the previous track,
 * which is already sitting in those samples. Equal power (sin/cos) keeps the sum
 * of squares at 1 across the overlap — two linear ramps crossing sum to 0.5 in
 * amplitude at the midpoint, which is an audible hole in every transition.
 */
function mixEqualPower(
  target: Float32Array,
  source: Float32Array,
  offset: number,
  length: number,
  fadeIn: number,
  fadeOut: number,
): void {
  for (let i = 0; i < length; i++) {
    let gain = 1;
    if (fadeIn > 0 && i < fadeIn) gain = Math.sin((i / fadeIn) * (Math.PI / 2));
    else if (fadeOut > 0 && i >= length - fadeOut) {
      gain = Math.cos(((i - (length - fadeOut)) / fadeOut) * (Math.PI / 2));
    }

    target[offset + i] += source[i] * gain;
  }
}

/** Ramps down into `joinFrame` and back up out of it. */
function applySpliceDip(data: Float32Array, joinFrame: number, sampleRate: number): void {
  const span = Math.max(1, Math.round(SPLICE_FADE_SECONDS * sampleRate));

  const outFrom = Math.max(0, joinFrame - span);
  const outSpan = joinFrame - outFrom;
  for (let i = 0; i < outSpan; i++) data[outFrom + i] *= 1 - (i + 1) / outSpan;

  const inTo = Math.min(data.length, joinFrame + span);
  const inSpan = inTo - joinFrame;
  for (let i = 0; i < inSpan; i++) data[joinFrame + i] *= (i + 1) / inSpan;
}

/**
 * Linear in amplitude, which is what every editor's plain "fade in" does and
 * what the number in the panel claims: two seconds of fade means the level is
 * halfway at one second. A perceptual curve would sound smoother and make the
 * field lie about where the midpoint is. (The CROSSFADE above is equal-power for
 * the opposite reason — there, two curves have to sum to something constant.)
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
