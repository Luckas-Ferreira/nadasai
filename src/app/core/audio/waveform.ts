/**
 * The overview drawn on the stage: one min/max pair per column of pixels.
 *
 * Sampling every Nth sample instead — which is the obvious shortcut — draws a
 * lie. A 3-minute track at 48 kHz is ~8 million samples across ~900 columns, so
 * a stride of 9000 reports whatever single sample it happens to land on: quiet
 * passages sprout spikes, loud ones read as silence, and the shape flickers as
 * the window resizes because the stride moves. Scanning the whole bucket for its
 * extremes costs one pass over the buffer and is the only version that stays put.
 */
export interface Peaks {
  /** Most negative sample in each bucket, in [-1, 0]. */
  readonly min: Float32Array;
  /** Most positive sample in each bucket, in [0, 1]. */
  readonly max: Float32Array;
}

/**
 * Collapses every channel into one shape. Channels are folded together rather
 * than stacked because the selection is what this stage is for: two lanes of
 * waveform halve the vertical room the drag targets have, and nobody trims a
 * podcast by reading the right channel separately.
 */
export function computePeaks(channels: readonly Float32Array[], buckets: number): Peaks {
  const count = Math.max(1, Math.floor(buckets));
  const min = new Float32Array(count);
  const max = new Float32Array(count);

  const frames = channels[0]?.length ?? 0;
  if (!frames) return { min, max };

  const framesPerBucket = frames / count;

  for (let bucket = 0; bucket < count; bucket++) {
    const from = Math.floor(bucket * framesPerBucket);
    // The last bucket takes the remainder, so no tail sample is skipped by rounding.
    const to = bucket === count - 1 ? frames : Math.max(from + 1, Math.floor((bucket + 1) * framesPerBucket));

    let lo = 0;
    let hi = 0;
    for (const data of channels) {
      for (let i = from; i < to; i++) {
        const sample = data[i];
        if (sample < lo) lo = sample;
        else if (sample > hi) hi = sample;
      }
    }

    min[bucket] = lo;
    max[bucket] = hi;
  }

  return { min, max };
}

export interface ThumbOptions {
  readonly width: number;
  readonly height: number;
  readonly color: string;
  readonly background: string;
}

/**
 * Paints peaks into a standalone canvas — the thumbnail a track shows in the
 * reorderable strip.
 *
 * It exists so `app-page-grid` can be reused unchanged: that component knows
 * nothing about Files or audio, only a label and an image URL, so giving a track
 * a picture of itself is all it takes to get the same drag-and-drop, the same
 * arrow buttons and the same page-sheet styling the PDF tools have. A bespoke
 * track list would have been a second implementation of all of it.
 */
export function renderPeaksToCanvas(peaks: Peaks, opts: ThumbOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(opts.width));
  canvas.height = Math.max(1, Math.round(opts.height));

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const mid = canvas.height / 2;
  const scale = mid * 0.86;
  const total = peaks.max.length;
  const perColumn = total / canvas.width;

  ctx.fillStyle = opts.color;
  for (let column = 0; column < canvas.width; column++) {
    const from = Math.floor(column * perColumn);
    const to = Math.max(from + 1, Math.floor((column + 1) * perColumn));

    let lo = 0;
    let hi = 0;
    for (let i = from; i < to && i < total; i++) {
      if (peaks.min[i] < lo) lo = peaks.min[i];
      if (peaks.max[i] > hi) hi = peaks.max[i];
    }

    const top = mid - hi * scale;
    ctx.fillRect(column, top, 1, Math.max(1, mid - lo * scale - top));
  }

  return canvas;
}

/**
 * Tick spacing for the ruler: the largest "round" interval that keeps labels
 * from colliding. Hardcoding, say, 10s turns a 2-hour file into a grey smear of
 * ticks and a 4-second clip into a ruler with one mark on it.
 */
const NICE_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

export function rulerStep(durationSeconds: number, widthPx: number, minLabelPx = 64): number {
  const maxLabels = Math.max(1, Math.floor(widthPx / minLabelPx));
  const rawStep = durationSeconds / maxLabels;
  return NICE_STEPS.find((step) => step >= rawStep) ?? NICE_STEPS[NICE_STEPS.length - 1];
}
