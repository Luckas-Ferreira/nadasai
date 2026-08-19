import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { WorkspaceService } from './workspace.service';

/**
 * Detects new deploys and downloads them 100% silently in the background.
 *
 * Never blocks the user's screen with a full-screen modal overlay.
 * Updates are staged quietly by ngsw and activated on next page visit,
 * or offered via a non-intrusive notification toast.
 */

export type UpdateState = 'idle' | 'downloading' | 'ready';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly imageState = inject(WorkspaceService);

  readonly state = signal<UpdateState>('idle');
  readonly updateReady = signal<boolean>(false);

  start(): void {
    const sw = this.swUpdate;
    if (!sw?.isEnabled) return;

    sw.versionUpdates.subscribe((event) => {
      switch (event.type) {
        case 'VERSION_DETECTED':
          // Download quietly in the background without blocking the user
          this.state.set('downloading');
          break;

        case 'VERSION_READY':
          this.state.set('ready');
          this.updateReady.set(true);
          // Auto-activate on next idle navigation if no file is being edited
          this.activateSilentlyIfIdle(sw);
          break;

        case 'VERSION_INSTALLATION_FAILED':
          this.state.set('idle');
          break;
      }
    });

    const check = () => void sw.checkForUpdate().catch(() => undefined);

    void navigator.serviceWorker?.ready.then(check, () => undefined);

    setInterval(check, CHECK_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }

  /**
   * Activates the new version silently when the user isn't actively working on a file.
   */
  private activateSilentlyIfIdle(sw: SwUpdate): void {
    // If the user has an active file/edit session open, do not disrupt them
    if (this.imageState.currentFile()) {
      return;
    }

    // Activate the staged Service Worker silently in the background
    void sw.activateUpdate().then(() => {
      console.log('[AppUpdateService] New version activated silently in background.');
    });
  }

  /**
   * Manually trigger reload to use new version if user clicks the optional toast button.
   */
  applyUpdate(): void {
    const sw = this.swUpdate;
    if (!sw?.isEnabled) {
      location.reload();
      return;
    }

    void sw.activateUpdate().then(() => {
      location.reload();
    });
  }
}
