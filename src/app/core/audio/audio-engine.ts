import { AppError } from '../errors';

/** A stretch of the source timeline, in seconds. */
export type Segment = readonly [start: number, end: number];

/** A piece of audio to play, from any buffer. */
export interface PlayClip {
  readonly buffer: AudioBuffer;
  readonly from: number;
  readonly to: number;
}

export interface PlayPlan {
  readonly buffer: AudioBuffer;
  /** Played back to back, in order — the same list the cutter concatenates. */
  readonly segments: readonly Segment[];
  readonly fadeIn: number;
  readonly fadeOut: number;
}

export interface ClipPlan {
  readonly clips: readonly PlayClip[];
  readonly fadeIn: number;
  readonly fadeOut: number;
  /** Seconds of equal-power overlap between consecutive clips. 0 = butt join. */
  readonly crossfade?: number;
}

/**
 * Scheduling a source "now" is scheduling it slightly in the past by the time
 * the message reaches the audio thread, which drops the first few milliseconds.
 */
const LEAD_SECONDS = 0.03;

/** Matches SPLICE_FADE_SECONDS in the cutter, so the preview clicks where the file would. */
const SPLICE_FADE_SECONDS = 0.004;

/** Points in an equal-power ramp. More is pointless; fewer is audibly steppy. */
const CURVE_POINTS = 64;

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
  private nodes: AudioNode[] = [];
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

  /** Segments of ONE buffer, played back to back. What the cutter previews. */
  async play(plan: PlayPlan, onEnded: () => void): Promise<void> {
    await this.playClips(
      {
        clips: plan.segments.map(([from, to]) => ({ buffer: plan.buffer, from, to })),
        fadeIn: plan.fadeIn,
        fadeOut: plan.fadeOut,
      },
      onEnded,
    );
  }

  /**
   * Plays the clips and returns once they are scheduled. `onEnded` fires when
   * the last one finishes on its own — not when `stop()` cuts it short, because
   * that path already knows.
   *
   * Every clip gets its OWN gain node, and that is what makes a crossfade
   * possible at all: the overlap needs one clip ramping down while another ramps
   * up, which a single shared envelope cannot express. With no crossfade the
   * clip gains sit at 1 and the master carries everything, exactly as before.
   */
  async playClips(plan: ClipPlan, onEnded: () => void): Promise<void> {
    this.stop();

    const clips = plan.clips.filter((clip) => clip.to - clip.from > 0.001);
    if (!clips.length) return;

    const ctx = this.context();
    // Autoplay policy leaves a context created outside a gesture suspended, and
    // a suspended context schedules everything and plays none of it, silently.
    if (ctx.state === 'suspended') await ctx.resume();

    const lengths = clips.map((clip) => clip.to - clip.from);
    const overlap = clampCrossfade(plan.crossfade ?? 0, lengths);
    const total = lengths.reduce((sum, length) => sum + length, 0) - overlap * (clips.length - 1);

    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.nodes.push(master);

    const origin = ctx.currentTime + LEAD_SECONDS;
    this.originTime = origin;
    this.playLength = total;

    const joins: number[] = [];
    let offset = 0;
    let lastNode: AudioBufferSourceNode | null = null;
    let lastEnd = -Infinity;

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const length = lengths[i];

      const gain = ctx.createGain();
      gain.connect(master);
      this.nodes.push(gain);

      const node = ctx.createBufferSource();
      node.buffer = clip.buffer;
      node.connect(gain);
      node.start(origin + offset, clip.from, length);
      this.sources.push(node);

      // NOT simply the last clip scheduled: with a crossfade every clip ends at
      // a different time, and "finished" means the one that ends last.
      if (offset + length > lastEnd) {
        lastEnd = offset + length;
        lastNode = node;
      }

      if (overlap > 0) {
        if (i > 0) rampIn(gain.gain, origin + offset, overlap);
        if (i < clips.length - 1) rampOut(gain.gain, origin + offset + length - overlap, overlap);
      } else if (i < clips.length - 1) {
        joins.push(offset + length);
      }

      offset += length - (i < clips.length - 1 ? overlap : 0);
    }

    // With a crossfade there is no discontinuity left to hide, so no dips.
    applyEnvelope(master.gain, origin, total, plan.fadeIn, plan.fadeOut, joins);

    if (!lastNode) return;
    lastNode.onended = () => {
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

    for (const node of this.nodes) node.disconnect();
    this.nodes = [];
  }
}

/**
 * An overlap longer than half the shortest clip would make that clip's fade-in
 * and fade-out collide, and two `setValueCurveAtTime` calls that overlap on one
 * param throw. Clamping is also what the user means: you cannot cross-fade two
 * seconds of a one-second jingle.
 */
function clampCrossfade(requested: number, lengths: readonly number[]): number {
  if (requested <= 0 || lengths.length < 2) return 0;
  return Math.max(0, Math.min(requested, Math.min(...lengths) / 2));
}

/**
 * Equal power, not linear.
 *
 * Two linear ramps crossing sum to 0.5 at the midpoint in amplitude, which is
 * about -6 dB of power — an audible hole in the middle of every transition.
 * sin/cos keeps the sum of squares at 1 the whole way across, which is what
 * makes a crossfade sound like one continuous track.
 */
function rampIn(param: AudioParam, at: number, seconds: number): void {
  param.setValueCurveAtTime(curve((t) => Math.sin((t * Math.PI) / 2)), at, seconds);
}

function rampOut(param: AudioParam, at: number, seconds: number): void {
  param.setValueCurveAtTime(curve((t) => Math.cos((t * Math.PI) / 2)), at, seconds);
}

function curve(shape: (t: number) => number): Float32Array {
  const values = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i++) values[i] = shape(i / (CURVE_POINTS - 1));
  return values;
}

/** Result-time offsets where two segments meet. */
export function joinTimes(segments: readonly Segment[]): number[] {
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
