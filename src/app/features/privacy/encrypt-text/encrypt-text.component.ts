import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService, type TranslationKey } from '../../../core/services/translation.service';
import { toMessageKey } from '../../../core/errors';
import { saveBlob } from '../../../core/image/download';
import { TextEncryptorService } from './services/text-encryptor.service';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';
import { SegmentedComponent, type SegmentOption } from '../../../shared/ui/segmented.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

type Mode = 'encrypt' | 'decrypt';

@Component({
  selector: 'app-encrypt-text',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ToolPageComponent,
    PanelComponent,
    AlertComponent,
    ActionBarComponent,
    SegmentedComponent,
    IconComponent,
  ],
  templateUrl: './encrypt-text.component.html',
})
export class EncryptTextComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly encryptor = inject(TextEncryptorService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly mode = signal<Mode>('encrypt');
  protected readonly input = signal('');
  protected readonly password = signal('');
  protected readonly output = signal<string | null>(null);

  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly copied = signal(false);

  private readonly ranInput = signal<string | null>(null);
  private readonly ranPassword = signal<string | null>(null);
  private readonly ranMode = signal<Mode | null>(null);
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.copyTimer !== null) clearTimeout(this.copyTimer);
    });
  }

  protected readonly modeOptions = computed<readonly SegmentOption<Mode>[]>(() => [
    { value: 'encrypt', label: this.i18n.t()['encrypt.mode_encrypt'] },
    { value: 'decrypt', label: this.i18n.t()['encrypt.mode_decrypt'] },
  ]);

  protected readonly canRun = computed(() => !!this.input().trim() && !!this.password());

  protected readonly stale = computed(() =>
    !this.output() ||
    this.input() !== this.ranInput() ||
    this.password() !== this.ranPassword() ||
    this.mode() !== this.ranMode(),
  );

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.output.set(null);
    this.errorKey.set(null);
  }

  protected async run(): Promise<void> {
    if (!this.canRun() || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.output.set(null);

    const mode = this.mode();
    const text = this.input();
    const password = this.password();

    try {
      this.output.set(
        mode === 'encrypt'
          ? await this.encryptor.encrypt(text, password)
          : await this.encryptor.decrypt(text, password),
      );
      this.ranInput.set(text);
      this.ranPassword.set(password);
      this.ranMode.set(mode);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected copy(text: string): void {
    void navigator.clipboard.writeText(text);
    this.copied.set(true);
    if (this.copyTimer !== null) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  protected download(): void {
    const text = this.output();
    if (!text) return;
    const name = this.mode() === 'encrypt' ? 'message.txt.asc' : 'message.txt';
    saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
  }

  protected reset(): void {
    this.input.set('');
    this.password.set('');
    this.output.set(null);
    this.ranInput.set(null);
    this.ranPassword.set(null);
    this.ranMode.set(null);
    this.errorKey.set(null);
  }
}
