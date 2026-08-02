import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../../core/services/translation.service';
import { toolById } from '../../../core/tools/tools';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

@Component({
  selector: 'app-password-generator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ToolPageComponent, PanelComponent, ButtonDirective, IconComponent],
  template: `
    <app-tool-page [toolId]="'password-generator'" [forceLoaded]="true">

      <!-- STAGE: password display + strength + entropy -->
      <div stage class="space-y-5">
        <!-- Password display card -->
        <app-panel>
          <div class="space-y-4">
            <div class="flex min-h-[80px] items-center justify-between gap-4 rounded-lg border border-line bg-raised p-4">
              <span class="min-w-0 break-all font-mono text-xl font-bold tracking-wider select-all text-text">
                {{ currentPassword() || '…' }}
              </span>
              <button
                type="button"
                appButton
                variant="primary"
                size="md"
                (click)="copyPassword()"
                class="shrink-0"
              >
                <app-icon [name]="copied() ? 'check' : 'copy'" [size]="16" />
                <span>{{ copied() ? i18n.t()['passgen.copied'] : i18n.t()['passgen.copy'] }}</span>
              </button>
            </div>

            <!-- Strength meter -->
            <div class="space-y-1.5">
              <div class="flex justify-between text-xs text-muted">
                <span>{{ i18n.t()['passgen.entropy'] }}: <span class="font-mono font-bold text-text">{{ entropy() }} bits</span></span>
                <span [class]="strengthColorClass()" class="font-semibold">{{ strengthText() }}</span>
              </div>
              <div class="h-2 w-full overflow-hidden rounded-full bg-raised border border-line">
                <div
                  class="h-full transition-all duration-300"
                  [class]="strengthBgClass()"
                  [style.width.%]="strengthPercent()"
                ></div>
              </div>
            </div>
          </div>
        </app-panel>
      </div>

      <!-- PANEL: controls -->
      <div panel class="flex flex-col gap-4">
        <app-panel [heading]="i18n.t()['passgen.title']">
          <div class="space-y-5">
            <!-- Length slider -->
            <div class="space-y-2">
              <div class="flex justify-between text-xs font-semibold text-text">
                <span>{{ i18n.t()['passgen.length'] }}</span>
                <span class="font-mono text-accent font-bold text-sm">{{ length() }}</span>
              </div>
              <input
                type="range"
                min="8"
                max="128"
                [ngModel]="length()"
                (ngModelChange)="length.set($event); generate()"
                class="w-full accent-accent cursor-pointer"
              />
            </div>

            <!-- Character set toggles -->
            <div class="grid grid-cols-1 gap-2 text-xs font-medium">
              @for (opt of charOptions; track opt.key) {
                <label class="flex cursor-pointer items-center gap-2.5 rounded-md border border-line bg-raised p-3 hover:border-line-strong transition">
                  <input
                    type="checkbox"
                    [ngModel]="opt.value()"
                    (ngModelChange)="opt.set($event); generate()"
                    class="h-4 w-4 rounded accent-accent"
                  />
                  <span class="text-text">{{ i18n.t()[opt.key] }}</span>
                </label>
              }
            </div>

            <button
              type="button"
              appButton
              variant="secondary"
              size="lg"
              block
              (click)="generate()"
            >
              <app-icon name="refresh" [size]="18" />
              <span>{{ i18n.t()['passgen.generate'] }}</span>
            </button>
          </div>
        </app-panel>
      </div>

    </app-tool-page>
  `,
})
export class PasswordGeneratorComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('password-generator');

  protected readonly length = signal(24);
  protected readonly useUppercase = signal(true);
  protected readonly useLowercase = signal(true);
  protected readonly useNumbers = signal(true);
  protected readonly useSymbols = signal(true);
  protected readonly currentPassword = signal('');
  protected readonly copied = signal(false);

  protected readonly charOptions = [
    { key: 'passgen.uppercase' as const, value: this.useUppercase, set: (v: boolean) => this.useUppercase.set(v) },
    { key: 'passgen.lowercase' as const, value: this.useLowercase, set: (v: boolean) => this.useLowercase.set(v) },
    { key: 'passgen.numbers' as const, value: this.useNumbers, set: (v: boolean) => this.useNumbers.set(v) },
    { key: 'passgen.symbols' as const, value: this.useSymbols, set: (v: boolean) => this.useSymbols.set(v) },
  ];

  constructor() {
    this.generate();
  }

  protected generate(): void {
    let chars = '';
    if (this.useUppercase()) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (this.useLowercase()) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (this.useNumbers()) chars += '0123456789';
    if (this.useSymbols()) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!chars) { this.currentPassword.set(''); return; }

    const randomValues = new Uint32Array(this.length());
    window.crypto.getRandomValues(randomValues);
    let password = '';
    for (let i = 0; i < this.length(); i++) {
      password += chars[randomValues[i] % chars.length];
    }
    this.currentPassword.set(password);
  }

  protected readonly entropy = computed(() => {
    let poolSize = 0;
    if (this.useUppercase()) poolSize += 26;
    if (this.useLowercase()) poolSize += 26;
    if (this.useNumbers()) poolSize += 10;
    if (this.useSymbols()) poolSize += 28;
    if (poolSize === 0) return 0;
    return Math.round(this.length() * Math.log2(poolSize));
  });

  protected readonly strengthPercent = computed(() => {
    return Math.min(100, Math.max(5, Math.round((this.entropy() / 100) * 100)));
  });

  protected strengthText(): string {
    const e = this.entropy();
    const t = this.i18n.t();
    if (e < 40) return t['passgen.strength_weak'];
    if (e < 65) return t['passgen.strength_medium'];
    if (e < 90) return t['passgen.strength_strong'];
    return t['passgen.strength_very_strong'];
  }

  protected strengthColorClass(): string {
    const e = this.entropy();
    if (e < 40) return 'text-danger';
    if (e < 65) return 'text-amber-500';
    return 'text-accent';
  }

  protected strengthBgClass(): string {
    const e = this.entropy();
    if (e < 40) return 'bg-danger';
    if (e < 65) return 'bg-amber-500';
    return 'bg-accent';
  }

  protected copyPassword(): void {
    if (!this.currentPassword()) return;
    navigator.clipboard.writeText(this.currentPassword());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
