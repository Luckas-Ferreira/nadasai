import { Injectable, computed, inject, signal } from '@angular/core';
import { BackgroundRemovalService } from './background-removal.service';

/**
 * Pulls the 42 MB of model weights down while the user is doing something else,
 * so the first background removal is inference-only instead of a two-minute wait.
 *
 * Why this is a separate service from BackgroundRemovalService: that one is
 * deliberately free of UI signals, because it once held them as a root singleton
 * and two concurrent runs fought over the same progress signal. That reasoning is
 * about *per-run* state, which still belongs to the component. A download is the
 * opposite kind of thing — it is global, idempotent, and outlives navigation, so
 * it needs a home that also outlives navigation. Keeping it here means the rule
 * over there stays intact.
 *
 * The download itself is not duplicated: this calls the same memoised session
 * promise the real run awaits, so a prefetch in flight *is* the first run's
 * download, not a second copy of it.
 */

/** Chrome-only, and absent in Firefox/Safari — hence the hand-rolled shape. */
interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

export type PrefetchState = 'idle' | 'downloading' | 'ready' | 'skipped';

@Injectable({ providedIn: 'root' })
export class ModelPrefetchService {
  private readonly removal = inject(BackgroundRemovalService);

  private readonly state = signal<PrefetchState>('idle');
  private readonly percent = signal(0);

  readonly downloading = computed(() => this.state() === 'downloading');
  readonly progress = computed(() => this.percent());

  private started = false;

  /**
   * Kicks the download off once the browser is idle.
   *
   * Idle, not eager: the model must never compete with the first paint or with a
   * lazy tool chunk the user is actually waiting on. requestIdleCallback is the
   * whole reason this is polite — the fallback timer exists for Safari, which
   * still does not ship it.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    if (this.shouldSkip()) {
      this.state.set('skipped');
      return;
    }

    const run = () => void this.download();
    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 10_000 });
    } else {
      setTimeout(run, 3_000);
    }
  }

  /**
   * Someone is paying for these bytes, and it is not us.
   *
   * 42 MB pushed onto a metered phone that only came to crop a photo is a real
   * cost to a real person. When the browser says the user asked for data saving,
   * or that the link is 2g/3g, we do not spend it — the model still downloads on
   * demand, which is exactly the behaviour that existed before this service.
   */
  private shouldSkip(): boolean {
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!conn) return false;
    if (conn.saveData) return true;
    return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g';
  }

  private async download(): Promise<void> {
    this.state.set('downloading');
    await this.removal.prefetch((fraction) => this.percent.set(Math.round(fraction * 100)));

    // prefetch() resolves either way — it swallows its own errors, because an
    // opportunistic download must not raise an alarm the user did not ask for.
    // Either way the bar goes away; a failed one just re-downloads on demand.
    this.percent.set(100);
    this.state.set('ready');
  }
}
