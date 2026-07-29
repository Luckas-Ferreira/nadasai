import { TestBed } from '@angular/core/testing';
import { AppError } from '../../../core/errors';
import { AudioMergerService, type MergeTrack } from './audio-merger.service';

const SAMPLE_RATE = 8000;

/** A buffer holding one constant value, so the output says which track it came from. */
function flatBuffer(seconds: number, value: number, channels = 1, rate = SAMPLE_RATE): AudioBuffer {
  const frames = Math.round(seconds * rate);
  const ctx = new OfflineAudioContext(channels, frames, rate);
  const buffer = ctx.createBuffer(channels, frames, rate);

  for (let ch = 0; ch < channels; ch++) buffer.getChannelData(ch).fill(value);
  return buffer;
}

function track(buffer: AudioBuffer, name = 'a.mp3'): MergeTrack {
  return { buffer, name };
}

async function samplesOf(blob: Blob, channelCount = 1): Promise<Float32Array> {
  const view = new DataView(await blob.arrayBuffer());
  const frames = view.getUint32(40, true) / (channelCount * 2);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = view.getInt16(44 + i * channelCount * 2, true) / 32767;
  return out;
}

describe('AudioMergerService', () => {
  let service: AudioMergerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioMergerService);
  });

  const base = { crossfade: 0, gap: 0, fadeIn: 0, fadeOut: 0 };

  it('joins tracks end to end, in order', async () => {
    const result = await service.merge({
      ...base,
      tracks: [track(flatBuffer(1, 0.5)), track(flatBuffer(2, 0.9))],
    });

    expect(result.duration).toBeCloseTo(3, 3);

    const samples = await samplesOf(result.blob);
    expect(samples[100]).toBeCloseTo(0.5, 2);
    expect(samples[SAMPLE_RATE + 500]).toBeCloseTo(0.9, 2);
  });

  it('dips the seam of a straight join, so it does not click', async () => {
    const result = await service.merge({
      ...base,
      tracks: [track(flatBuffer(1, 0.9)), track(flatBuffer(1, -0.9))],
    });

    // +0.9 stepping straight to -0.9 in one sample is the loudest click there
    // is; the ramp takes the seam through zero instead.
    const samples = await samplesOf(result.blob);
    const seam = SAMPLE_RATE;

    expect(Math.abs(samples[seam - 1])).toBeLessThan(0.05);
    expect(Math.abs(samples[seam])).toBeLessThan(0.05);
    expect(Math.abs(samples[seam + 200])).toBeGreaterThan(0.8);
  });

  it('names the output from the FIRST track', async () => {
    const result = await service.merge({
      ...base,
      tracks: [track(flatBuffer(1, 0.5), 'intro.mp3'), track(flatBuffer(1, 0.5), 'outro.wav')],
    });

    expect(result.filename).toBe('intro-merged.wav');
  });

  it('inserts silence between tracks when asked', async () => {
    const result = await service.merge({
      ...base,
      gap: 1,
      tracks: [track(flatBuffer(1, 0.8)), track(flatBuffer(1, 0.8))],
    });

    expect(result.duration).toBeCloseTo(3, 3);

    const samples = await samplesOf(result.blob);
    expect(Math.abs(samples[Math.round(1.5 * SAMPLE_RATE)])).toBeLessThan(0.01);
  });

  it('overlaps tracks for a crossfade, so the result is SHORTER than the sum', async () => {
    const result = await service.merge({
      ...base,
      crossfade: 1,
      tracks: [track(flatBuffer(2, 0.8)), track(flatBuffer(2, 0.8))],
    });

    // 2 + 2, overlapping by 1.
    expect(result.duration).toBeCloseTo(3, 3);
  });

  it('holds the level across a crossfade instead of dipping in the middle', async () => {
    // The reason the curves are equal-power. Two LINEAR ramps crossing sum to
    // 0.5 in amplitude at the midpoint — an audible hole in every transition.
    // sin/cos keeps the sum of squares at 1, so a constant tone stays constant.
    const result = await service.merge({
      ...base,
      crossfade: 1,
      tracks: [track(flatBuffer(2, 0.7)), track(flatBuffer(2, 0.7))],
    });

    const samples = await samplesOf(result.blob);
    const middle = Math.round(1.5 * SAMPLE_RATE); // dead centre of the overlap

    expect(samples[middle]).toBeGreaterThan(0.9 * 0.7);
    expect(samples[middle]).toBeLessThan(1.05);
  });

  it('clamps a crossfade longer than half the shortest track', async () => {
    // 10s asked for, but the second track is only 1s: the overlap cannot exceed
    // 0.5s or the fade-in and fade-out of that track would collide.
    const result = await service.merge({
      ...base,
      crossfade: 10,
      tracks: [track(flatBuffer(4, 0.6)), track(flatBuffer(1, 0.6))],
    });

    expect(result.duration).toBeCloseTo(4.5, 2);
  });

  it('widens mono up to the widest track rather than folding stereo down', async () => {
    const result = await service.merge({
      ...base,
      tracks: [track(flatBuffer(1, 0.5, 1)), track(flatBuffer(1, 0.5, 2))],
    });

    const view = new DataView(await result.blob.arrayBuffer());
    expect(view.getUint16(22, true)).toBe(2);

    // The mono track plays on BOTH channels; silence on one would be a bug you
    // only hear on headphones.
    expect(view.getInt16(44, true)).toBeCloseTo(view.getInt16(46, true), -2);
  });

  it('refuses fewer than two tracks', async () => {
    await expectAsync(
      service.merge({ ...base, tracks: [track(flatBuffer(1, 0.5))] }),
    ).toBeRejectedWith(jasmine.any(AppError));
  });

  it('refuses mismatched sample rates rather than playing them at the wrong speed', async () => {
    await expectAsync(
      service.merge({
        ...base,
        tracks: [track(flatBuffer(1, 0.5, 1, 8000)), track(flatBuffer(1, 0.5, 1, 16000))],
      }),
    ).toBeRejectedWith(jasmine.any(AppError));
  });

  it('applies the fades to the joined result, not to each track', async () => {
    const result = await service.merge({
      ...base,
      fadeIn: 0.5,
      fadeOut: 0.5,
      tracks: [track(flatBuffer(1, 1)), track(flatBuffer(1, 1))],
    });

    const samples = await samplesOf(result.blob);

    expect(samples[0]).toBeCloseTo(0, 2);
    expect(samples[Math.round(0.25 * SAMPLE_RATE)]).toBeCloseTo(0.5, 1);
    // Between the fades the level is untouched. Probed at 0.75s, NOT at the 1s
    // seam: the anti-click dip deliberately takes that exact frame to zero.
    expect(samples[Math.round(0.75 * SAMPLE_RATE)]).toBeCloseTo(1, 1);
    expect(samples[samples.length - 1]).toBeCloseTo(0, 2);
  });

  it('reports progress it can be trusted to finish', async () => {
    const seen: number[] = [];
    await service.merge({
      ...base,
      tracks: [track(flatBuffer(0.2, 0.5)), track(flatBuffer(0.2, 0.5))],
      onProgress: (percent) => seen.push(percent),
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(100);
  });
});
