import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppUpdateService } from '../../core/services/app-update.service';
import { TranslationService } from '../../core/services/translation.service';

/**
 * Blocks the screen while a new version is downloaded and applied.
 *
 * Purely presentational — AppUpdateService owns the lifecycle and the reload.
 * It renders nothing at all in the common case, which is every load where no
 * deploy happened since the tab opened.
 */
@Component({
  selector: 'app-update-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (update.state() !== 'idle') {
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-title"
        aria-describedby="update-message"
        class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-base px-6"
      >
        <img src="logo.webp" alt="" class="h-14 w-14 object-contain" />

        <!-- aria-hidden: the state is already announced by the live text below. -->
        <div
          class="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-accent"
          aria-hidden="true"
        ></div>

        <div class="flex max-w-xs flex-col items-center gap-2 text-center">
          <h2 id="update-title" class="text-lg font-semibold">{{ i18n.t()['update.title'] }}</h2>

          <p id="update-message" class="text-sm text-muted" aria-live="polite">
            {{
              update.state() === 'applying'
                ? i18n.t()['update.applying']
                : i18n.t()['update.downloading']
            }}
          </p>

          <p class="mt-1 text-xs text-faint">{{ i18n.t()['update.hint'] }}</p>
        </div>
      </div>
    }
  `,
})
export class UpdateOverlayComponent {
  protected readonly update = inject(AppUpdateService);
  protected readonly i18n = inject(TranslationService);
}
