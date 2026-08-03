import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService, type TranslationKey } from '../../../core/services/translation.service';
import { toMessageKey } from '../../../core/errors';
import { type HashAlgo, type HashResult, matchAlgo } from '../../../core/hash/hash-file';
import { formatBytes } from '../../../core/image/image-file.util';
import { FileHasherService } from './services/file-hasher.service';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { SegmentedComponent, type SegmentOption } from '../../../shared/ui/segmented.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

type Mode = 'file' | 'text';

const ALGO_LABELS: Record<HashAlgo, string> = {
  sha256: 'SHA-256',
  sha512: 'SHA-512',
  md5: 'MD5',
};

@Component({
  selector: 'app-file-hash',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    AlertComponent,
    ActionBarComponent,
    ButtonDirective,
    SegmentedComponent,
    IconComponent,
  ],
  templateUrl: './file-hash.component.html',
})
export class FileHashComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly hasher = inject(FileHasherService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly formatBytes = formatBytes;

  protected readonly mode = signal<Mode>('file');
  protected readonly file = signal<File | null>(null);
  protected readonly textInput = signal('');
  protected readonly wantSha512 = signal(false);
  protected readonly expectedHash = signal('');

  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly result = signal<HashResult | null>(null);
  protected readonly copiedAlgo = signal<HashAlgo | null>(null);

  /** What the current result was computed from. */
  private readonly ranFile = signal<File | null>(null);
  private readonly ranText = signal<string | null>(null);
  private readonly ranSha512 = signal(false);

  private textDebounce: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.textDebounce !== null) clearTimeout(this.textDebounce);
      if (this.copyTimer !== null) clearTimeout(this.copyTimer);
    });
  }

  /**
   * Built as a computed over `i18n.t()` rather than assigned once. The previous
   * `readonly` array captured the dictionary at construction, so it kept the
   * language the tool was opened in — and it held hardcoded Portuguese anyway,
   * while `hash.mode_file` and `hash.mode_text` sat in both dictionaries unused.
   */
  protected readonly modeOptions = computed<readonly SegmentOption<Mode>[]>(() => [
    { value: 'file', label: this.i18n.t()['hash.mode_file'] },
    { value: 'text', label: this.i18n.t()['hash.mode_text'] },
  ]);

  private readonly algos = computed<readonly HashAlgo[]>(() =>
    this.wantSha512() ? ['sha256', 'md5', 'sha512'] : ['sha256', 'md5'],
  );

  protected readonly hashItems = computed(() => {
    const r = this.result();
    if (!r) return [];
    return (['sha256', 'sha512', 'md5'] as const)
      .filter((algo) => !!r[algo])
      .map((algo) => ({ algo, label: ALGO_LABELS[algo], value: r[algo] as string, isMain: algo === 'sha256' }));
  });

  protected readonly matched = computed(() => {
    const r = this.result();
    const expected = this.expectedHash().trim();
    return r && expected ? matchAlgo(expected, r) : null;
  });

  protected readonly canRun = computed(() =>
    this.mode() === 'file' ? !!this.file() : this.textInput().length > 0,
  );

  /**
   * The button comes back the moment the input or the algorithm set changes,
   * and goes away once pressing it could only reproduce what is on screen.
   */
  protected readonly stale = computed(() => {
    if (!this.result()) return true;
    if (this.wantSha512() !== this.ranSha512()) return true;
    return this.mode() === 'file'
      ? this.file() !== this.ranFile()
      : this.textInput() !== this.ranText();
  });

  protected algoLabel(algo: HashAlgo): string {
    return ALGO_LABELS[algo];
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.clearResult();
  }

  protected setWantSha512(value: boolean): void {
    this.wantSha512.set(value);
  }

  protected onFileSelected(file: File): void {
    this.file.set(file);
    this.clearResult();
    void this.run();
  }

  /**
   * Debounced. Every keystroke used to fire three digests over the whole text.
   */
  protected onTextChanged(value: string): void {
    this.textInput.set(value);
    if (this.textDebounce !== null) clearTimeout(this.textDebounce);
    if (!value) {
      this.clearResult();
      return;
    }
    this.textDebounce = setTimeout(() => void this.run(), 250);
  }

  protected async run(): Promise<void> {
    if (!this.canRun() || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    const algos = this.algos();
    try {
      if (this.mode() === 'file') {
        const f = this.file();
        if (!f) return;
        const result = await this.hasher.hashFile({
          file: f,
          algos,
          onProgress: (p) => this.progress.set(p),
        });
        this.result.set(result);
        this.ranFile.set(f);
        this.ranText.set(null);
      } else {
        const text = this.textInput();
        this.result.set(await this.hasher.hashText(text, algos));
        this.ranText.set(text);
        this.ranFile.set(null);
      }
      this.ranSha512.set(this.wantSha512());
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
      this.result.set(null);
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected copy(algo: HashAlgo, value: string): void {
    void navigator.clipboard.writeText(value);
    this.copiedAlgo.set(algo);
    if (this.copyTimer !== null) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copiedAlgo.set(null), 2000);
  }

  protected clearFile(): void {
    this.file.set(null);
    this.clearResult();
  }

  protected reset(): void {
    this.file.set(null);
    this.textInput.set('');
    this.expectedHash.set('');
    this.clearResult();
  }

  private clearResult(): void {
    this.result.set(null);
    this.ranFile.set(null);
    this.ranText.set(null);
    this.errorKey.set(null);
    this.progress.set(null);
  }
}
