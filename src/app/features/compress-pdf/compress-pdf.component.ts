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
import { SegmentedComponent } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { PdfCompressorService, type CompressLevel } from './services/pdf-compressor.service';

/** Preview width in CSS pixels. The stage is ~800px at its widest. */
const PREVIEW_WIDTH = 640;

const LEVEL_HINTS: Record<CompressLevel, TranslationKey> = {
  light: 'cpdf.hint_light',
  balanced: 'cpdf.hint_balanced',
  strong: 'cpdf.hint_strong',
  lossless: 'cpdf.hint_lossless',
};

/**
 * Shrink a PDF locally.
 *
 * Off the editing chain for the same reason as the other PDF tools:
 * `ImageStateService` holds one image and rejects anything that is not
 * `image/*`, which is exactly the guard that keeps PDFs out of it.
 */
@Component({
  selector: 'app-compress-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    SegmentedComponent,
    ActionBarComponent,
    AlertComponent,
  ],
  templateUrl: './compress-pdf.component.html',
})
export class CompressPdfComponent {
  private readonly compressor = inject(PdfCompressorService);
  private readonly urls = inject(ObjectUrlScope);
  private readonly tool = toolById('compress-pdf');

  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  /** First page, rendered on load — an empty stage reads as "nothing happened". */
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly pageCount = signal(0);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  /** Set when the result would have been bigger and the original was kept. */
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

  /** Null while there is nothing to compare, or when nothing was saved. */
  protected readonly savedPercent = computed(() => {
    const file = this.file();
    const blob = this.resultBlob();
    if (!file || !blob || blob.size >= file.size) return null;

    return Math.round((1 - blob.size / file.size) * 100);
  });

  /** The only setting `run()` reads. */
  private readonly ranLevel = signal<CompressLevel | null>(null);

  protected readonly stale = computed(() => this.ranLevel() !== this.level());

  protected async onFile(file: File): Promise<void> {
    this.errorKey.set(null);
    this.noticeKey.set(null);
    this.clearResult();

    // Opening it here is also the validation: a file that is not a readable PDF
    // fails now, with a message, rather than after the user presses Compress.
    try {
      const doc = await openPdf(file);

      try {
        const { width } = (await doc.getPage(1)).getViewport({ scale: 1 });
        const canvas = await renderPageToCanvas(doc, 1, PREVIEW_WIDTH / width);
        const thumb = await canvasToBlob(canvas, 'image/jpeg', 0.8);
        releaseCanvas(canvas);

        this.pageCount.set(doc.numPages);
        this.previewUrl.set(this.urls.replace(this.previewUrl(), thumb));
        this.file.set(file);
      } finally {
        await closePdf(doc);
      }
    } catch (err) {
      console.error('Reading PDF failed:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
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
      const level = this.level();

      const { blob, keptOriginal } = await this.compressor.compress(file, level, (done, total) =>
        this.progress.set(Math.round((done / total) * 100)),
      );

      this.resultBlob.set(blob);
      this.ranLevel.set(level);
      if (keptOriginal) this.noticeKey.set('cpdf.no_gain');
    } catch (err) {
      console.error('Compress PDF failed:', err);
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
    this.previewUrl.set(null);
    this.pageCount.set(0);
    this.file.set(null);
    this.level.set('balanced');
    this.errorKey.set(null);
    this.noticeKey.set(null);
    this.clearResult();
  }

  private clearResult(): void {
    this.resultBlob.set(null);
    this.ranLevel.set(null);
  }
}
