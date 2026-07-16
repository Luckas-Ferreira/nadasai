import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ModelPrefetchService } from '../../core/services/model-prefetch.service';
import { TranslationService } from '../../core/services/translation.service';

/**
 * Bottom-right progress for the model downloading in the background.
 *
 * Deliberately not a modal, not a blocker, and not dismissible: the download is
 * opportunistic and the user never asked for it, so it reports and gets out of
 * the way. It vanishes on its own when the download finishes.
 *
 * Sits above the mobile tab bar rather than under it — `bottom-24` clears the
 * fixed nav on small screens, `md:bottom-4` drops it back to the corner once
 * that nav is gone.
 */
@Component({
  selector: 'app-model-download-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (prefetch.downloading()) {
      <div
        class="fixed right-4 bottom-24 z-40 w-64 rounded-panel border border-line bg-surface p-3 md:bottom-4"
        role="status"
        aria-live="polite"
      >
        <div class="flex items-baseline justify-between gap-2">
          <p class="text-xs font-medium">{{ i18n.t()['model.downloading'] }}</p>
          <span class="font-mono tabular text-xs text-muted">{{ prefetch.progress() }}%</span>
        </div>

        <!-- The number above is the accessible value; the track is decoration. -->
        <div class="mt-2 h-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
          <div
            class="h-full rounded-full bg-accent-fill transition-[width] duration-300"
            [style.width.%]="prefetch.progress()"
          ></div>
        </div>

        <p class="mt-2 text-2xs text-faint">{{ i18n.t()['model.hint'] }}</p>
      </div>
    }
  `,
})
export class ModelDownloadBarComponent {
  protected readonly prefetch = inject(ModelPrefetchService);
  protected readonly i18n = inject(TranslationService);
}
