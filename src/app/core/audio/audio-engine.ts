import { AppError } from '../errors';

/** A stretch of the source timeline, in seconds. */
export type Segment = readonly [start: number, end: number];

export interface PlayPlan {
  readonly buffer: AudioBuffer;
  /** Played back to back, in order — the same list the cutter concatenates. */
  readonly segments: readonly Segment[];
  readonly fadeIn: number;
  readonly fadeOut: number;
}

/**
 * Scheduling a source "now" is scheduling it slightly in the past by the time
 * the message reaches the audio thread, which drops the first few milliseconds.
 */
const LEAD_SECONDS = 0.03;

/** Matches SPLICE_FADE_SECONDS in the cutter, so the preview clicks where the file would. */
const SPLICE_FADE_SECONDS = 0.004;

/**
 * Decoding and playback for the audio tools.
 *
 * Deliberately a plain class the component instantiates and destroys, not a
 * `providedIn: 'root'` service. Everything in here is per-run state — a live
 * AudioContext, running source nodes, an envelope on a gain node — and the rule
 * this app already learned the hard way on background removal is that per-run
 * state in a singleton outlives the navigation that should have ended it. A
 * root-scoped player would keep a track playing over the tool you moved on to.
 *
 * One caveat worth knowing: `decodeAudioData` resamples to the context's rate,
 * which is the output device's rate. A 44.1 kHz file on a 48 kHz device decodes
 * to 48 kHz, and the exported WAV carries that. There is no API to decode at the
 * file's native rate, so this is a floor, not an oversight.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private sources: AudioBufferSourceNode[] = [];

  /** Context time at which the current playback's result timeline starts. */
  private originTime = 0;
  private playLength = 0;

  async decode(file: File): Promise<AudioBuffer> {
    const bytes = await file.arrayBuffer();
    try {
      return await this.context().decodeAudioData(bytes);
    } catch (err) {
      throw new AppError('audio_decode_failed', err);
    }
  }

  /**
   * Plays the plan and returns once it has been scheduled. `onEnded` fires when
   * the last segment finishes on its own — not when `stop()` cuts it short,
   * because that path already knows.
   */
  async play(plan: PlayPlan, onEnded: () => void): Promise<void> {
    this.stop();

    const segments = plan.segments.filter(([from, to]) => to - from > 0.001);
    if (!segments.length) return;

    const ctx = this.context();
    // Autoplay policy leaves a context created outside a gesture suspended, and
    // a suspended context schedules everything and plays none of it, silently.
    if (ctx.state === 'suspended') await ctx.resume();

    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    this.gain = gain;

    const total = segments.reduce((sum, [from, to]) => sum + (to - from), 0);
    const origin = ctx.currentTime + LEAD_SECONDS;
    this.originTime = origin;
    this.playLength = total;

    let offset = 0;
    for (const [from, to] of segments) {
      const node = ctx.createBufferSource();
      node.buffer = plan.buffer;
      node.connect(gain);
      node.start(origin + offset, from, to - from);
      this.sources.push(node);
      offset += to - from;
    }

    applyEnvelope(gain.gain, origin, total, plan.fadeIn, plan.fadeOut, joinTimes(segments));

    const last = this.sources[this.sources.length - 1];
    last.onended = () => {
      // A node stopped by `stop()` also fires onended; the reset there clears
      // the handler first, so reaching here means playback ran to the end.
      this.teardownNodes();
      onEnded();
    };
  }

  stop(): void {
    this.teardownNodes();
  }

  /** Seconds into the *result* timeline, or null when nothing is playing. */
  elapsed(): number | null {
    if (!this.ctx || !this.sources.length) return null;
    const elapsed = this.ctx.currentTime - this.originTime;
    if (elapsed < 0) return 0;
    return Math.min(elapsed, this.playLength);
  }

  close(): void {
    this.teardownNodes();
    void this.ctx?.close();
    this.ctx = null;
  }

  private context(): AudioContext {
    if (!this.ctx) {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    return this.ctx;
  }

  private teardownNodes(): void {
    for (const node of this.sources) {
      node.onended = null;
      try {
        node.stop();
      } catch {
        // Already stopped, or never started. Nothing to undo either way.
      }
      node.disconnect();
    }
    this.sources = [];
    this.gain?.disconnect();
    this.gain = null;
  }
}

/** Result-time offsets where two segments meet. */
function joinTimes(segments: readonly Segment[]): number[] {
  const joins: number[] = [];
  let offset = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    offset += segments[i][1] - segments[i][0];
    joins.push(offset);
  }
  return joins;
}

/**
 * Fades and splice dips as one sorted breakpoint list.
 *
 * Writing them as three independent groups of automation calls is how you get a
 * fade that never completes: the Web Audio automation timeline is a single
 * ordered sequence, so a `linearRampToValueAtTime` inserted before an earlier
 * event ramps from the wrong anchor. Collapsing everything into breakpoints and
 * dropping any that would move backwards keeps the envelope monotonic in time,
 * whatever combination of long fades and short segments the user lands on.
 */
function applyEnvelope(
  gain: AudioParam,
  origin: number,
  total: number,
  fadeIn: number,
  fadeOut: number,
  joins: readonly number[],
): void {
  const points: Array<[time: number, value: number]> = [];

  if (fadeIn > 0) {
    points.push([0, 0], [Math.min(fadeIn, total), 1]);
  } else {
    points.push([0, 1]);
  }

  for (const join of joins) {
    points.push([join - SPLICE_FADE_SECONDS, 1], [join, 0], [join + SPLICE_FADE_SECONDS, 1]);
  }

  if (fadeOut > 0) {
    points.push([Math.max(0, total - fadeOut), 1], [total, 0]);
  }

  points.sort((a, b) => a[0] - b[0]);

  let previous = -Infinity;
  let first = true;
  for (const [time, value] of points) {
    if (time <= previous || time < 0 || time > total) continue;
    previous = time;

    if (first) {
      gain.setValueAtTime(value, origin + time);
      first = false;
    } else {
      gain.linearRampToValueAtTime(value, origin + time);
    }
  }
}
