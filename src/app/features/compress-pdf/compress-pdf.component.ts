import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { canvasToBlob, formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../core/pdf/pdfjs';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PdfPasswordPromptComponent } from '../../shared/ui/pdf-password-prompt.component';
import { SegmentedComponent } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { CompressLevel, PdfCompressorService } from './services/pdf-compressor.service';

/** Stage preview thumbnail width in CSS pixels */
const PREVIEW_WIDTH = 260;

const LEVEL_HINTS: Record<CompressLevel, TranslationKey> = {
  light: 'cpdf.hint_light',
  balanced: 'cpdf.hint_balanced',
  strong: 'cpdf.hint_strong',
  lossless: 'cpdf.hint_lossless',
};

@Component({
  selector: 'app-compress-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    SegmentedComponent,
    PdfPasswordPromptComponent,
  ],
  templateUrl: './compress-pdf.component.html',
})
export class CompressPdfComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly compressor = inject(PdfCompressorService);
  protected readonly tool = toolById('compress-pdf');

  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly pageCount = signal(0);
  protected readonly previewUrl = signal<string | null>(null);

  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly noticeKey = signal<TranslationKey | null>(null);

  protected readonly level = signal<CompressLevel>('balanced');

  protected readonly levelOptions = computed<{ value: CompressLevel; label: string }[]>(() => [
    { value: 'light', label: this.i18n.t()['cpdf.level_light'] },
    { value: 'balanced', label: this.i18n.t()['cpdf.level_balanced'] },
    { value: 'strong', label: this.i18n.t()['cpdf.level_strong'] },
    { value: 'lossless', label: this.i18n.t()['cpdf.level_lossless'] },
  ]);

  protected readonly levelHint = computed(() => this.i18n.t()[LEVEL_HINTS[this.level()]]);
  protected readonly rasterizes = computed(() => this.level() !== 'lossless');

  protected readonly originalSize = computed(() => {
    const file = this.file();
    return file ? formatBytes(file.size) : null;
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : null;
  });

  protected readonly savedPercent = computed(() => {
    const file = this.file();
    const blob = this.resultBlob();
    if (!file || !blob || blob.size >= file.size) return null;

    return Math.round((1 - blob.size / file.size) * 100);
  });

  private readonly ranLevel = signal<CompressLevel | null>(null);
  protected readonly stale = computed(() => this.ranLevel() !== this.level());

  protected async onFile(file: File, password?: string): Promise<void> {
    this.errorKey.set(null);
    this.noticeKey.set(null);
    this.passwordError.set(null);
    this.pendingFile.set(file);
    this.clearResult();

    try {
      const doc = await openPdf(file, password);

      try {
        const { width } = (await doc.getPage(1)).getViewport({ scale: 1 });
        const canvas = await renderPageToCanvas(doc, 1, PREVIEW_WIDTH / width);
        const thumb = await canvasToBlob(canvas, 'image/jpeg', 0.8);
        releaseCanvas(canvas);

        this.pageCount.set(doc.numPages);
        this.previewUrl.set(this.urls.replace(this.previewUrl(), thumb));
        this.file.set(file);
        this.pdfPassword.set(password ?? null);
        this.pdfProtected.set(false);
      } finally {
        await closePdf(doc);
      }
    } catch (err) {
      console.error('Reading PDF failed:', err);
      const msgKey = toMessageKey(err);
      if (msgKey === 'error.pdf_encrypted') {
        this.pdfProtected.set(true);
        if (password) {
          this.passwordError.set('Senha incorreta. Tente novamente.');
        }
      } else {
        this.errorKey.set(msgKey);
        this.file.set(null);
      }
    }
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.noticeKey.set(null);
    this.progress.set(0);

    try {
      const { blob, keptOriginal } = await this.compressor.compress(
        file,
        this.level(),
        (done: number, total: number) => this.progress.set(Math.round((done / total) * 100)),
        this.pdfPassword() ?? undefined,
      );

      this.resultBlob.set(blob);
      this.ranLevel.set(this.level());

      // No cast here, ever. This read `'cpdf.kept_original' as TranslationKey`,
      // and that key does not exist in either dictionary — the cast is the one
      // thing that can silence the compile error the i18n design is built to
      // produce. `t()[key]` then returned undefined, so the notice rendered as
      // an empty info alert: the compressor correctly kept the original and the
      // user was handed back a byte-identical file with nothing saying why.
      if (keptOriginal) {
        this.noticeKey.set('cpdf.no_gain');
      }
    } catch (err) {
      console.error('Compressing failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const file = this.file();
    if (!blob || !file) return;

    saveBlob(blob, suffixedName(file.name, this.tool.suffix, 'pdf'));
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.file.set(null);
    this.pendingFile.set(null);
    this.pdfProtected.set(false);
    this.pdfPassword.set(null);
    this.passwordError.set(null);
    this.pageCount.set(0);
    this.previewUrl.set(null);
    this.clearResult();
    this.errorKey.set(null);
    this.noticeKey.set(null);
  }

  private clearResult(): void {
    this.resultBlob.set(null);
    this.ranLevel.set(null);
  }
}
