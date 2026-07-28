import { TestBed } from '@angular/core/testing';
import { AppError } from '../../../core/errors';
import { AudioCutterService } from './audio-cutter.service';

const SAMPLE_RATE = 8000;

/**
 * A buffer that ramps from 0 to 0.9 across its whole length, so any sample in
 * the output identifies the frame of the source it came from. It has to stay
 * inside [-1, 1]: a ramp that runs past full scale is clamped by the encoder and
 * every later sample reads back as 1, which tells you nothing.
 */
function rampBuffer(seconds: number, channels = 1): AudioBuffer {
  const frames = Math.round(seconds * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(channels, frames, SAMPLE_RATE);
  const buffer = ctx.createBuffer(channels, frames, SAMPLE_RATE);

  for (let ch = 0; ch < channels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < frames; i++) data[i] = valueAt(i, frames);
  }
  return buffer;
}

function valueAt(frame: number, totalFrames: number): number {
  return (frame / totalFrames) * 0.9;
}

/** Reads the 16-bit PCM back out of the encoded WAV. */
async function samplesOf(blob: Blob, channelCount = 1): Promise<Float32Array> {
  const view = new DataView(await blob.arrayBuffer());
  const frames = view.getUint32(40, true) / (channelCount * 2);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = view.getInt16(44 + i * channelCount * 2, true) / 32767;
  return out;
}

describe('AudioCutterService', () => {
  let service: AudioCutterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AudioCutterService);
  });

  const base = {
    originalName: 'podcast.mp3',
    mode: 'keep' as const,
    fadeIn: 0,
    fadeOut: 0,
  };

  it('keeps only the selection', async () => {
    const result = await service.cut({ ...base, buffer: rampBuffer(4), start: 1, end: 3 });

    expect(result.duration).toBeCloseTo(2, 3);
    expect(result.filename).toBe('podcast-cut.wav');

    const samples = await samplesOf(result.blob);
    expect(samples.length).toBe(2 * SAMPLE_RATE);
    // First sample of the result is the sample at 1 second in the source.
    expect(samples[0]).toBeCloseTo(valueAt(SAMPLE_RATE, 4 * SAMPLE_RATE), 3);
  });

  it('names the output from the ORIGINAL file, with the real extension', async () => {
    const result = await service.cut({
      ...base,
      buffer: rampBuffer(2),
      start: 0,
      end: 1,
      originalName: 'my.voice.note.m4a',
    });

    expect(result.filename).toBe('my.voice.note-cut.wav');
  });

  it('drops the selection and joins what is left', async () => {
    const result = await service.cut({
      ...base,
      mode: 'remove',
      buffer: rampBuffer(4),
      start: 1,
      end: 3,
    });

    expect(result.duration).toBeCloseTo(2, 3);

    const frames = 4 * SAMPLE_RATE;
    const samples = await samplesOf(result.blob);
    // Well clear of the splice on both sides: head, then tail.
    expect(samples[100]).toBeCloseTo(valueAt(100, frames), 3);
    expect(samples[SAMPLE_RATE + 200]).toBeCloseTo(valueAt(3 * SAMPLE_RATE + 200, frames), 3);
  });

  it('dips BOTH sides of a splice, not just the one before it', async () => {
    // The regression this pins: the dip used to be applied while the segments
    // were still being copied, so the ramp written after the join was
    // overwritten by the next segment and only the fade-out half survived —
    // which leaves exactly the click the dip exists to remove.
    const result = await service.cut({
      ...base,
      mode: 'remove',
      buffer: rampBuffer(4),
      start: 1,
      end: 3,
    });

    const samples = await samplesOf(result.blob);
    const join = SAMPLE_RATE; // one second of head

    const beforeJoin = Math.abs(samples[join - 1]);
    const atJoin = Math.abs(samples[join]);
    const settled = Math.abs(samples[join + 200]);

    expect(beforeJoin).toBeLessThan(0.05); // ramped down into the join
    expect(atJoin).toBeLessThan(settled); // and back up out of it
    expect(settled).toBeGreaterThan(0.1);
  });

  it('applies a linear fade in and out to the result', async () => {
    const flat = rampBuffer(2);
    flat.getChannelData(0).fill(1);

    const result = await service.cut({
      ...base,
      buffer: flat,
      start: 0,
      end: 2,
      fadeIn: 0.5,
      fadeOut: 0.5,
    });

    const samples = await samplesOf(result.blob);
    const quarter = Math.round(0.25 * SAMPLE_RATE);

    expect(samples[0]).toBeCloseTo(0, 2);
    expect(samples[quarter]).toBeCloseTo(0.5, 1); // halfway through a 0.5s fade
    expect(samples[Math.round(SAMPLE_RATE)]).toBeCloseTo(1, 2); // untouched middle
    expect(samples[samples.length - 1]).toBeCloseTo(0, 2);
  });

  it('preserves every channel', async () => {
    const result = await service.cut({ ...base, buffer: rampBuffer(2, 2), start: 0, end: 1 });
    const view = new DataView(await result.blob.arrayBuffer());

    expect(view.getUint16(22, true)).toBe(2);
  });

  it('refuses a selection that would save nothing', async () => {
    await expectAsync(
      service.cut({ ...base, buffer: rampBuffer(2), start: 1, end: 1 }),
    ).toBeRejectedWith(jasmine.any(AppError));

    // Removing everything is the same dead end from the other direction.
    await expectAsync(
      service.cut({ ...base, mode: 'remove', buffer: rampBuffer(2), start: 0, end: 2 }),
    ).toBeRejectedWith(jasmine.any(AppError));
  });

  it('reports progress it can be trusted to finish', async () => {
    const seen: number[] = [];
    await service.cut({
      ...base,
      buffer: rampBuffer(1, 2),
      start: 0,
      end: 1,
      onProgress: (percent) => seen.push(percent),
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(100);
  });
});
