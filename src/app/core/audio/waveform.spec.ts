import { computePeaks, rulerStep } from './waveform';

describe('computePeaks', () => {
  it('reports the extremes of each bucket, not a sampled value', () => {
    // One spike hidden inside an otherwise silent bucket. A strided sampler
    // misses it and draws a flat line where the audio actually clips.
    const data = new Float32Array(100);
    data[37] = 0.9;
    data[38] = -0.4;

    const { min, max } = computePeaks([data], 10);

    expect(max[3]).toBeCloseTo(0.9);
    expect(min[3]).toBeCloseTo(-0.4);
    expect(max[0]).toBe(0);
    expect(min[9]).toBe(0);
  });

  it('folds every channel into one shape', () => {
    const left = new Float32Array([0.5, 0.5]);
    const right = new Float32Array([-0.8, -0.8]);

    const { min, max } = computePeaks([left, right], 1);

    expect(max[0]).toBeCloseTo(0.5);
    expect(min[0]).toBeCloseTo(-0.8);
  });

  it('gives the last bucket the remainder, so no tail sample is dropped', () => {
    // 10 frames over 3 buckets: the third has to reach frame 9.
    const data = new Float32Array(10);
    data[9] = 1;

    const { max } = computePeaks([data], 3);

    expect(max[2]).toBe(1);
  });

  it('never asks for more buckets than it returns', () => {
    const { min, max } = computePeaks([new Float32Array(5)], 8);

    expect(min.length).toBe(8);
    expect(max.length).toBe(8);
  });

  it('survives an empty buffer', () => {
    const { min, max } = computePeaks([new Float32Array(0)], 4);

    expect(max.length).toBe(4);
    expect(min.every((value) => value === 0)).toBe(true);
  });
});

describe('rulerStep', () => {
  it('picks a step that keeps the labels apart', () => {
    // 900px / 64px = 14 labels max, so a 60s clip cannot tick every second.
    expect(rulerStep(60, 900)).toBeGreaterThanOrEqual(5);
  });

  it('scales from a few seconds to a few hours', () => {
    expect(rulerStep(4, 900)).toBeLessThanOrEqual(1);
    expect(rulerStep(7200, 900)).toBeGreaterThanOrEqual(300);
  });

  it('always returns a round number a reader can add up', () => {
    const steps = [3, 30, 300, 3000].map((duration) => rulerStep(duration, 800));
    for (const step of steps) {
      expect([0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]).toContain(step);
    }
  });
});
