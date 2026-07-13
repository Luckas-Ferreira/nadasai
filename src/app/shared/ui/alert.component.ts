import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input, output } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon/icon.component';

export type AlertTone = 'error' | 'info';

const TONES: Record<AlertTone, string> = {
  error: 'border-danger-line bg-danger-soft text-danger',
  info: 'border-line bg-raised text-muted',
};

/**
 * Every failure path renders through this. Before it existed, errors went to the
 * console and the user was left staring at an empty box with no explanation.
 */
@Component({
  selector: 'app-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, IconComponent],
  template: `
    <div role="alert" class="flex items-center gap-2.5 rounded-lg border px-3.5 py-3" [class]="toneClass()">
      <app-icon name="alert" [size]="16" class="shrink-0" />

      <p class="flex-1 text-sm">{{ message() }}</p>

      @if (actionLabel()) {
        <button appButton variant="secondary" size="sm" (click)="action.emit()">
          <app-icon name="refresh" [size]="14" />
          {{ actionLabel() }}
        </button>
      }

      @if (dismissible()) {
        <button
          appButton
          variant="ghost"
          size="sm"
          [attr.aria-label]="i18n.t()['common.dismiss']"
          (click)="dismiss.emit()"
        >
          <app-icon name="close" [size]="14" />
        </button>
      }
    </div>
  `,
})
export class AlertComponent {
  protected readonly i18n = inject(TranslationService);

  readonly message = input.required<string>();
  readonly tone = input<AlertTone>('error');
  readonly actionLabel = input<string | null>(null);
  readonly dismissible = input(false, { transform: booleanAttribute });

  readonly action = output<void>();
  readonly dismiss = output<void>();

  protected readonly toneClass = computed(() => TONES[this.tone()]);
}
