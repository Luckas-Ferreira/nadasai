import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../../core/services/translation.service';
import {
  type CharsetFlags,
  type Strength,
  entropyBits,
  generatePassword,
  poolSize,
  strengthOf,
} from '../../../core/password/entropy';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/**
 * This tool has NO service, deliberately.
 *
 * The rule about a stateless `providedIn: 'root'` service per tool is about work
 * that takes Files and options and returns a Blob. This one returns a string and
 * touches no I/O, so a service would be a wrapper around one pure function —
 * the same reasoning that keeps AudioEngine a plain class. The generation and
 * the entropy maths live in core/password/entropy.ts, where they are tested.
 */
@Component({
  selector: 'app-password-generator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ToolPageComponent, PanelComponent, ButtonDirective, IconComponent],
  templateUrl: './password-generator.component.html',
})
export class PasswordGeneratorComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly length = signal(24);
  protected readonly useUppercase = signal(true);
  protected readonly useLowercase = signal(true);
  protected readonly useNumbers = signal(true);
  protected readonly useSymbols = signal(true);
  protected readonly password = signal('');
  protected readonly copied = signal(false);

  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly charOptions = [
    { key: 'passgen.uppercase' as const, value: this.useUppercase, set: (v: boolean) => this.toggle(this.useUppercase, v) },
    { key: 'passgen.lowercase' as const, value: this.useLowercase, set: (v: boolean) => this.toggle(this.useLowercase, v) },
    { key: 'passgen.numbers' as const, value: this.useNumbers, set: (v: boolean) => this.toggle(this.useNumbers, v) },
    { key: 'passgen.symbols' as const, value: this.useSymbols, set: (v: boolean) => this.toggle(this.useSymbols, v) },
  ];

  private readonly flags = computed<CharsetFlags>(() => ({
    upper: this.useUppercase(),
    lower: this.useLowercase(),
    digits: this.useNumbers(),
    symbols: this.useSymbols(),
  }));

  protected readonly anyClassSelected = computed(() => poolSize(this.flags()) > 0);
  protected readonly entropy = computed(() => entropyBits(this.length(), this.flags()));
  private readonly strength = computed<Strength>(() => strengthOf(this.entropy()));

  /**
   * The bar tops out at 128 bits rather than 100. The old version computed
   * `round((entropy / 100) * 100)`, an identity that pinned everything from 100
   * bits upwards to a full bar — so a 25-character password and a 128-character
   * one looked the same.
   */
  protected readonly strengthPercent = computed(() =>
    Math.min(100, Math.max(4, Math.round((this.entropy() / 128) * 100))),
  );

  protected readonly strengthLabel = computed(() => {
    const t = this.i18n.t();
    switch (this.strength()) {
      case 'weak': return t['passgen.strength_weak'];
      case 'medium': return t['passgen.strength_medium'];
      case 'strong': return t['passgen.strength_strong'];
      default: return t['passgen.strength_very_strong'];
    }
  });

  /**
   * Four bands, four colours. Everything at or above 65 bits used to map to
   * `text-accent`, so "Strong" and "Unbreakable" rendered identically — and the
   * middle band asked for `text-amber-500`, which generates no CSS at all in
   * this design system, leaving the bar transparent exactly where it was meant
   * to warn.
   */
  protected readonly strengthTextClass = computed(() => {
    switch (this.strength()) {
      case 'weak': return 'text-danger';
      case 'medium': return 'text-warning';
      case 'strong': return 'text-success';
      default: return 'text-accent';
    }
  });

  protected readonly strengthBarClass = computed(() => {
    switch (this.strength()) {
      case 'weak': return 'bg-danger';
      case 'medium': return 'bg-warning';
      case 'strong': return 'bg-success';
      default: return 'bg-accent';
    }
  });

  constructor() {
    // Not in the constructor body: generatePassword reaches for
    // crypto.getRandomValues, which does not exist while prerendering in Node
    // and would fail the build for this route.
    afterNextRender(() => this.generate());

    this.destroyRef.onDestroy(() => {
      if (this.copyTimer !== null) clearTimeout(this.copyTimer);
    });
  }

  protected setLength(value: number): void {
    this.length.set(value);
    this.generate();
  }

  protected generate(): void {
    this.password.set(generatePassword(this.length(), this.flags()));
  }

  protected copy(): void {
    const value = this.password();
    if (!value) return;
    void navigator.clipboard.writeText(value);
    this.copied.set(true);
    if (this.copyTimer !== null) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  private toggle(target: { set(v: boolean): void }, value: boolean): void {
    target.set(value);
    this.generate();
  }
}
