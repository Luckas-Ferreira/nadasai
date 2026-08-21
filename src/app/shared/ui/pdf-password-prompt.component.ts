import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../core/services/translation.service';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon/icon.component';

/**
 * Shared by every PDF tool that can meet an encrypted file. It used to hold
 * hardcoded Portuguese, so half the site rendered it in the wrong language —
 * and `bg-amber-500/10 text-amber-500`, which generates no CSS at all here
 * (`--color-*: initial` deletes Tailwind's amber ramp), leaving the lock icon
 * to inherit whatever colour its parent had.
 */
@Component({
  selector: 'app-pdf-password-prompt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent, ButtonDirective],
  template: `
    <div class="mx-auto flex max-w-md flex-col items-center justify-center gap-4 rounded-xl border border-line bg-surface p-6 text-center shadow-panel">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
        <app-icon name="lock" [size]="24" />
      </div>

      <div>
        <h3 class="text-lg font-semibold text-text">{{ i18n.t()['pdfpass.title'] }}</h3>
        <p class="mt-1 text-xs text-muted">
          <span class="font-medium text-text">{{ fileName() }}</span> — {{ i18n.t()['pdfpass.needs_password'] }}
        </p>
      </div>

      @if (errorMsg()) {
        <p class="text-xs font-medium text-danger bg-danger-soft px-3 py-1.5 rounded-md w-full">
          {{ errorMsg() }}
        </p>
      }

      <form (ngSubmit)="submit()" class="w-full flex flex-col gap-3">
        <div class="relative flex items-center">
          <input
            [attr.aria-label]="i18n.t()['pdfpass.placeholder']"
            [type]="showPassword() ? 'text' : 'password'"
            [value]="password()"
            (input)="password.set($any($event.target).value)"
            [placeholder]="i18n.t()['pdfpass.placeholder']"
            class="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-text outline-none focus:border-accent"
            autofocus
          />
          <button
            type="button"
            class="absolute right-2 text-muted hover:text-text cursor-pointer p-1"
            (click)="showPassword.set(!showPassword())"
            tabindex="-1"
          >
            <app-icon [name]="showPassword() ? 'unlock' : 'lock'" [size]="16" />
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button
            type="button"
            appButton
            variant="ghost"
            size="sm"
            class="flex-1"
            (click)="cancel.emit()"
          >
            {{ i18n.t()['common.cancel'] }}
          </button>

          <button
            type="submit"
            appButton
            variant="primary"
            size="sm"
            class="flex-1"
            [disabled]="!password().trim()"
          >
            {{ i18n.t()['pdfpass.unlock'] }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class PdfPasswordPromptComponent {
  protected readonly i18n = inject(TranslationService);

  readonly fileName = input.required<string>();
  readonly errorMsg = input<string | null>(null);

  readonly unlock = output<string>();
  readonly cancel = output<void>();

  protected readonly password = signal('');
  protected readonly showPassword = signal(false);

  protected submit(): void {
    const pwd = this.password().trim();
    if (pwd) {
      this.unlock.emit(pwd);
    }
  }
}
