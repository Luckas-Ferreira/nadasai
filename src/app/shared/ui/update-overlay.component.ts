import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AppUpdateService } from '../../core/services/app-update.service';
import { TranslationService } from '../../core/services/translation.service';
import { IconComponent } from './icon/icon.component';

/**
 * Discrete, non-blocking toast notification shown when a new app version is ready in the background.
 * Never blocks the user's screen or workflow.
 */
@Component({
  selector: 'app-update-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (update.updateReady() && !dismissed()) {
      <div
        role="status"
        aria-live="polite"
        class="fixed bottom-5 right-5 z-40 flex max-w-sm items-center gap-3 rounded-xl border border-accent/20 bg-surface/95 p-3.5 shadow-pop backdrop-blur transition-all"
      >
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <app-icon name="sparkles" [size]="18" />
        </div>

        <div class="flex flex-col gap-0.5 text-xs text-text">
          <span class="font-semibold text-text">{{ i18n.t()['update.available'] }}</span>
          <span class="text-2xs text-muted">{{ i18n.t()['update.ready'] }}</span>
        </div>

        <div class="ml-auto flex items-center gap-1">
          <button
            type="button"
            (click)="update.applyUpdate()"
            class="rounded-lg bg-accent px-2.5 py-1.5 text-2xs font-semibold text-white shadow-sm hover:bg-accent-hover transition-all"
          >
            {{ i18n.t()['update.apply'] }}
          </button>
          <button
            type="button"
            (click)="dismissed.set(true)"
            class="rounded-lg p-1 text-muted hover:bg-raised hover:text-text transition-all"
            [attr.aria-label]="i18n.t()['common.dismiss']"
          >
            <app-icon name="close" [size]="14" />
          </button>
        </div>
      </div>
    }
  `,
})
export class UpdateOverlayComponent {
  protected readonly update = inject(AppUpdateService);
  protected readonly i18n = inject(TranslationService);
  protected readonly dismissed = signal(false);
}
