import { ChangeDetectionStrategy, Component, type Signal, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService, type TranslationKey } from '../../../core/services/translation.service';
import { AppError, toMessageKey } from '../../../core/errors';
import { MAX_DIFF_LINES, type DiffResult, diffLines, splitLines, toUnifiedDiff } from '../../../core/text/diff';
import { saveBlob } from '../../../core/image/download';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';

const MAX_TEXT_BYTES = 10 * 1024 * 1024;

/** Sniffed rather than trusted: an extension says nothing about the contents. */
const NUL_SNIFF_BYTES = 8192;

type DiffOutcome =
  | { readonly ok: true; readonly result: DiffResult }
  | { readonly ok: false; readonly key: TranslationKey };

@Component({
  selector: 'app-diff-checker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    AlertComponent,
    ActionBarComponent,
  ],
  templateUrl: './diff-checker.component.html',
})
export class DiffCheckerComponent {
  protected readonly i18n = inject(TranslationService);

  protected readonly TEXT_ACCEPT =
    '.txt,.md,.json,.csv,.js,.ts,.css,.html,.py,.xml,.yml,.yaml,.log,.ini,.sql,text/*';

  protected readonly textOriginal = signal('');
  protected readonly textModified = signal('');

  private readonly loadErrorKey = signal<TranslationKey | null>(null);
  private readonly originalName = signal('original.txt');
  private readonly modifiedName = signal('modified.txt');

  private readonly linesOriginal = computed(() => splitLines(this.textOriginal()));
  private readonly linesModified = computed(() => splitLines(this.textModified()));

  protected readonly originalLines = computed(() => this.linesOriginal().length);
  protected readonly modifiedLines = computed(() => this.linesModified().length);

  /**
   * Both counters and the two text accessors were methods invoked from the
   * template — six calls per pass, all re-running under OnPush.
   */
  protected readonly sides = [
    {
      id: 'orig' as const,
      labelKey: 'diff.original' as const,
      text: this.textOriginal.asReadonly(),
      set: (v: string) => this.textOriginal.set(v),
      lines: this.originalLines,
      chars: computed(() => this.textOriginal().length),
    },
    {
      id: 'mod' as const,
      labelKey: 'diff.modified' as const,
      text: this.textModified.asReadonly(),
      set: (v: string) => this.textModified.set(v),
      lines: this.modifiedLines,
      chars: computed(() => this.textModified().length),
    },
  ] satisfies readonly {
    id: 'orig' | 'mod';
    labelKey: TranslationKey;
    text: Signal<string>;
    set: (v: string) => void;
    lines: Signal<number>;
    chars: Signal<number>;
  }[];

  /**
   * The failure is carried in the return value rather than written to a signal:
   * a computed that assigns to another signal is a change-detection trap, and
   * the "too many lines" case has to surface somewhere the banner can read it.
   */
  private readonly outcome = computed<DiffOutcome | null>(() => {
    const a = this.linesOriginal();
    const b = this.linesModified();
    if (a.length === 0 && b.length === 0) return null;
    try {
      return { ok: true, result: diffLines(a, b) };
    } catch (err) {
      return { ok: false, key: toMessageKey(err) };
    }
  });

  protected readonly diff = computed<DiffResult | null>(() => {
    const o = this.outcome();
    return o?.ok ? o.result : null;
  });

  protected readonly errorKey = computed<TranslationKey | null>(() => {
    const loaded = this.loadErrorKey();
    if (loaded) return loaded;
    const o = this.outcome();
    return o && !o.ok ? o.key : null;
  });

  protected readonly hasDifferences = computed(() => {
    const d = this.diff();
    return !!d && (d.stats.added > 0 || d.stats.removed > 0);
  });

  protected async loadFile(file: File, target: 'orig' | 'mod'): Promise<void> {
    this.loadErrorKey.set(null);
    try {
      if (file.size > MAX_TEXT_BYTES) throw new AppError('too_large');

      // A NUL byte in the first few kB means this is not text, whatever the
      // extension claims. Loading a JPEG into a textarea is not a useful state.
      const head = new Uint8Array(await file.slice(0, NUL_SNIFF_BYTES).arrayBuffer());
      if (head.includes(0)) throw new AppError('unsupported_file');

      const text = await file.text();
      if (splitLines(text).length > MAX_DIFF_LINES) throw new AppError('text_too_large');

      if (target === 'orig') {
        this.textOriginal.set(text);
        this.originalName.set(file.name);
      } else {
        this.textModified.set(text);
        this.modifiedName.set(file.name);
      }
    } catch (err) {
      this.loadErrorKey.set(toMessageKey(err));
    }
  }

  protected downloadPatch(): void {
    const result = this.diff();
    if (!result) return;
    const patch = toUnifiedDiff(result, this.originalName(), this.modifiedName());
    saveBlob(new Blob([patch], { type: 'text/plain;charset=utf-8' }), 'changes.diff');
  }

  protected clear(): void {
    this.textOriginal.set('');
    this.textModified.set('');
    this.originalName.set('original.txt');
    this.modifiedName.set('modified.txt');
    this.loadErrorKey.set(null);
  }
}
