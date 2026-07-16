import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { ImageStateService } from './image-state.service';

/**
 * Detects a new deploy, downloads it, applies it, reloads.
 *
 * SwUpdate already models the whole lifecycle, so this is thin on purpose:
 *
 *   VERSION_DETECTED           -> a new build exists; ngsw is fetching it  ("downloading")
 *   VERSION_READY              -> fetched and staged                       ("applying")
 *   VERSION_INSTALLATION_FAILED-> give up quietly, keep serving the old one
 *
 * The overlay blocks the screen between DETECTED and the reload because the two
 * versions must not mix: once ngsw has swapped the manifest, the lazy chunk the
 * old page would ask for on the next click may no longer exist, and the user
 * gets a chunk-load error instead of the tool they clicked. Freezing for a few
 * seconds is the cheaper failure.
 *
 * It stays invisible when there is nothing to download — every asset hash matched
 * and ngsw reused the cache — because then detect/stage/reload all happen inside a
 * few milliseconds and there is nothing worth showing anyone. Measured, not
 * assumed: a rebuild of unchanged sources never paints it.
 *
 * First install never shows the overlay: ngsw only emits VERSION_DETECTED when a
 * version is already active, so there is nothing to guard against here.
 *
 * And it never reloads over work in progress — see applyWhenNothingWouldBeLost.
 *
 * The model is untouched by any of this. It lives in the `ai` asset group, keyed
 * by URL and marked lazy, so a new app version does not re-download 42 MB.
 */

export type UpdateState = 'idle' | 'downloading' | 'applying';

/** Long enough to not thrash, short enough that a fix reaches an open tab. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  /**
   * Optional because SwUpdate only exists where provideServiceWorker ran. That
   * is every real build, but not a TestBed that only wanted to render the shell —
   * and a component tree should not fail to instantiate over an absent updater.
   */
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly imageState = inject(ImageStateService);
  readonly state = signal<UpdateState>('idle');

  start(): void {
    // isEnabled is false when the build has no service worker (ng serve): no
    // update can ever be detected, and every call below would throw.
    const sw = this.swUpdate;
    if (!sw?.isEnabled) return;

    sw.versionUpdates.subscribe((event) => {
      switch (event.type) {
        case 'VERSION_DETECTED':
          this.state.set('downloading');
          break;

        case 'VERSION_READY':
          this.applyWhenNothingWouldBeLost(sw);
          break;

        case 'VERSION_INSTALLATION_FAILED':
          this.state.set('idle');
          break;
      }
    });

    const check = () => void sw.checkForUpdate().catch(() => undefined);

    /**
     * Check once as soon as a worker is actually running.
     *
     * Without this the app only noticed a deploy an hour in, or when the tab was
     * hidden and shown again — so the common case (open the site, get the build
     * from yesterday) never updated at all. Verified: the overlay does not fire
     * without it.
     *
     * Gated on `ready` rather than called outright because registration is
     * deferred (registerWhenStable), and checkForUpdate() rejects while there is
     * still no worker to ask.
     */
    void navigator.serviceWorker.ready.then(check, () => undefined);

    setInterval(check, CHECK_INTERVAL_MS);

    // A tab left open for days only notices a deploy when it comes back to life.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }

  /**
   * Applies the update, but never on top of work in progress.
   *
   * Applying means reloading, and EditSession is a plain in-memory signal with no
   * storage behind it. A reload while someone has a file loaded silently throws
   * away their image and their whole edit chain, to deliver a deploy they never
   * asked about. A deploy is never worth someone's work.
   *
   * When a file is loaded we therefore do nothing at all. ngsw keeps the new
   * version staged at no cost, and hands it over on the next load that happens on
   * its own — the next visit, or any reload. Nobody stays on a stale build for
   * long, and nobody loses an edit to get there.
   *
   * An earlier version tried to be cleverer: watch the session and apply the
   * instant it emptied. It is not in here because it could not be shown to work —
   * the deferred update never fired after the session cleared, and an update path
   * that cannot be verified is worse than one that is merely patient.
   */
  private applyWhenNothingWouldBeLost(sw: SwUpdate): void {
    if (this.imageState.currentFile()) {
      this.state.set('idle');
      return;
    }

    this.state.set('applying');
    void sw.activateUpdate().then(
      () => location.reload(),
      // Activation failed: unblock rather than strand the user behind an overlay
      // that will never resolve. The old version still works.
      () => this.state.set('idle'),
    );
  }
}
