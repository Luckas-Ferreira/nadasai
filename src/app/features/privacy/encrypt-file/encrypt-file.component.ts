import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService, type TranslationKey } from '../../../core/services/translation.service';
import { toMessageKey } from '../../../core/errors';
import { WorkspaceService, hydrateFromWorkspace } from '../../../core/services/workspace.service';
import { entropyBits, strengthOf } from '../../../core/password/entropy';
import { saveBlob } from '../../../core/image/download';
import { formatBytes } from '../../../core/image/image-file.util';
import { FileEncryptorService, type EncryptOutcome } from './services/file-encryptor.service';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';
import { SegmentedComponent, type SegmentOption } from '../../../shared/ui/segmented.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

type Mode = 'encrypt' | 'decrypt';

@Component({
  selector: 'app-encrypt-file',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    AlertComponent,
    ActionBarComponent,
    SegmentedComponent,
    IconComponent,
  ],
  templateUrl: './encrypt-file.component.html',
})
export class EncryptFileComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly encryptor = inject(FileEncryptorService);
  protected readonly formatBytes = formatBytes;

  protected readonly file = signal<File | null>(null);
  protected readonly mode = signal<Mode>('encrypt');
  protected readonly password = signal('');

  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly result = signal<EncryptOutcome | null>(null);

  private readonly ranFile = signal<File | null>(null);
  private readonly ranMode = signal<Mode | null>(null);
  private readonly ranPassword = signal<string | null>(null);

  protected readonly modeOptions = computed<readonly SegmentOption<Mode>[]>(() => [
    { value: 'encrypt', label: this.i18n.t()['encrypt.mode_encrypt'] },
    { value: 'decrypt', label: this.i18n.t()['encrypt.mode_decrypt'] },
  ]);

  /**
   * Changing the password has to bring the button back, or a mistyped password
   * leaves the user looking at a result that came from the previous one.
   */
  protected readonly stale = computed(() =>
    !this.result() ||
    this.file() !== this.ranFile() ||
    this.mode() !== this.ranMode() ||
    this.password() !== this.ranPassword(),
  );

  /**
   * AES-256 is not the weak link; a six-character password is. The bits are
   * estimated from the classes actually present, which is the honest reading of
   * a password somebody typed rather than generated.
   */
  private readonly passwordStrength = computed(() => {
    const pw = this.password();
    if (!pw) return null;
    return strengthOf(
      entropyBits(pw.length, {
        upper: /[A-Z]/.test(pw),
        lower: /[a-z]/.test(pw),
        digits: /[0-9]/.test(pw),
        symbols: /[^A-Za-z0-9]/.test(pw),
      }),
    );
  });

  protected readonly passwordHint = computed(() => {
    const t = this.i18n.t();
    switch (this.passwordStrength()) {
      case 'weak': return t['encrypt.pass_weak'];
      case 'medium': return t['encrypt.pass_medium'];
      case 'strong': return t['encrypt.pass_strong'];
      case 'very_strong': return t['encrypt.pass_very_strong'];
      default: return '';
    }
  });

  protected readonly passwordHintClass = computed(() => {
    switch (this.passwordStrength()) {
      case 'weak': return 'text-danger';
      case 'medium': return 'text-warning';
      case 'strong': return 'text-success';
      default: return 'text-accent';
    }
  });

  private readonly workspace = inject(WorkspaceService);

  constructor() {
    // `accepts: ['any']` é o que faz esta ferramenta ser o fim natural de
    // QUALQUER cadeia: o PDF que acabou de ser assinado, o áudio normalizado, o
    // .enc que ela mesma produziu. Um .enc não tem tipo que a cadeia reconheça,
    // e é para isso que existe o tipo `binary` — sem ele a sessão recusaria
    // exatamente o arquivo que esta tela existe para abrir.
    hydrateFromWorkspace('encrypt-file', (file) => this.openFile(file));
  }

  protected onFileSelected(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'encrypt-file');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private openFile(file: File | null): void {
    this.file.set(file);
    this.clearResult();
    if (!file) return;

    // A .enc file is almost certainly here to be opened, not encrypted again.
    if (/\.enc$/i.test(file.name)) this.mode.set('decrypt');
    else this.mode.set('encrypt');
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.clearResult();
  }

  protected async run(): Promise<void> {
    const file = this.file();
    const password = this.password();
    if (!file || !password || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.result.set(null);
    this.progress.set(0);

    const mode = this.mode();
    try {
      const options = {
        file,
        password,
        // The bar tracks the READ. The crypto itself is one indivisible call,
        // so it goes indeterminate rather than lying about the rest.
        onProgress: (p: number) => this.progress.set(p >= 100 ? null : p),
      };

      const outcome = mode === 'encrypt'
        ? await this.encryptor.encrypt(options)
        : await this.encryptor.decrypt(options);

      this.result.set(outcome);
      this.ranFile.set(file);
      this.ranMode.set(mode);
      this.ranPassword.set(password);
    } catch (err) {
      // Every failure used to land on "wrong password" — including a browser
      // with no WebCrypto, and a file that was never one of ours.
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  /**
   * A real download step, rather than saveBlob() firing inside run(). With no
   * held result there was no way to save the output a second time, and nothing
   * for the action bar's `canDownload` to read.
   */
  protected download(): void {
    const r = this.result();
    if (r) saveBlob(r.blob, r.filename);
  }

  protected reset(): void {
    this.workspace.clear();
    this.file.set(null);
    this.password.set('');
    this.mode.set('encrypt');
    this.clearResult();
  }

  private clearResult(): void {
    this.result.set(null);
    this.ranFile.set(null);
    this.ranMode.set(null);
    this.ranPassword.set(null);
    this.errorKey.set(null);
    this.progress.set(null);
  }
}
