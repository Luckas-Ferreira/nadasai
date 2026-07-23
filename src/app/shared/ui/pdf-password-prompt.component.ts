import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon/icon.component';

@Component({
  selector: 'app-pdf-password-prompt',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent, ButtonDirective],
  template: `
    <div class="flex flex-col items-center justify-center p-6 bg-surface rounded-xl border border-line shadow-panel max-w-md mx-auto text-center gap-4">
      <div class="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
        <app-icon name="lock" [size]="24" />
      </div>

      <div>
        <h3 class="text-lg font-bold text-text">PDF Protegido por Senha</h3>
        <p class="mt-1 text-xs text-muted">
          O arquivo <span class="font-medium text-text">{{ fileName() }}</span> precisa de senha para ser aberto.
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
            [type]="showPassword() ? 'text' : 'password'"
            [value]="password()"
            (input)="password.set($any($event.target).value)"
            placeholder="Digite a senha do PDF"
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
            Cancelar
          </button>

          <button
            type="submit"
            appButton
            variant="primary"
            size="sm"
            class="flex-1"
            [disabled]="!password().trim()"
          >
            Desbloquear PDF
          </button>
        </div>
      </form>
    </div>
  `,
})
export class PdfPasswordPromptComponent {
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
