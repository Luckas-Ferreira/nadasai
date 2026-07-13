import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input, output } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon/icon.component';

/**
 * Apply / Download / Keep editing / Start over, previously duplicated in all
 * five tools.
 *
 * The primary button stays visible and enabled after a run — the old templates
 * hid it behind `*ngIf="!result()"`, so trying a different quality or format
 * meant starting over and re-uploading the file.
 */
@Component({
  selector: 'app-action-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, IconComponent],
  template: `
    <div class="flex flex-col gap-2">
      @if (primaryLabel(); as label) {
        <button
          appButton
          variant="primary"
          size="lg"
          block
          [busy]="busy()"
          [disabled]="primaryDisabled() || busy()"
          (click)="primary.emit()"
        >
          @if (busy()) {
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"></span>
            {{ i18n.t()['common.processing'] }}
          } @else {
            {{ label }}
          }
        </button>
      }

      @if (canDownload()) {
        <button appButton variant="secondary" size="lg" block (click)="download.emit()">
          <app-icon name="download" [size]="16" />
          {{ i18n.t()['common.download'] }}
        </button>

        @if (canContinue()) {
          <button appButton variant="ghost" block (click)="continueEdit.emit()">
            <app-icon name="arrowRight" [size]="15" />
            {{ i18n.t()['common.continue'] }}
          </button>
        }

        <p class="mt-0.5 text-center text-xs text-faint">{{ i18n.t()['common.download_hint'] }}</p>
      }

      <button appButton variant="ghost" size="sm" block (click)="reset.emit()">
        {{ i18n.t()['common.reset'] }}
      </button>
    </div>
  `,
})
export class ActionBarComponent {
  protected readonly i18n = inject(TranslationService);

  readonly primaryLabel = input<string | null>(null);
  readonly primaryDisabled = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly canDownload = input(false, { transform: booleanAttribute });
  readonly canContinue = input(false, { transform: booleanAttribute });

  readonly primary = output<void>();
  readonly download = output<void>();
  readonly continueEdit = output<void>();
  readonly reset = output<void>();
}
