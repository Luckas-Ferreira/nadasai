import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../core/pdf/pdfjs';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { ImageOutputFormat, PdfToImgResult, PdfToImgService } from './services/pdf-to-img.service';

/** Preview width in CSS pixels for stage thumbnails */
const THUMB_WIDTH = 240;

export interface PageThumb {
  index: number; // 1-based
  url: string;
}

@Component({
  selector: 'app-pdf-to-img',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    AlertComponent,
    IconComponent,
    SegmentedComponent,
    ActionBarComponent,
    ButtonDirective,
  ],
  templateUrl: './pdf-to-img.component.html',
})
export class PdfToImgComponent {
  private readonly pdfToImgService = inject(PdfToImgService);
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('pdf-to-img');
  protected readonly i18n = inject(TranslationService);

  // File & document state
  protected readonly file = signal<File | null>(null);
  protected readonly pageCount = signal(0);
  protected readonly thumbs = signal<PageThumb[]>([]);
  protected readonly renderingThumbs = signal(false);

  // Options
  protected readonly format = signal<ImageOutputFormat>('jpeg');
  protected readonly scale = signal<number>(2); // Default 2x resolution
  protected readonly selectedPages = signal<Set<number>>(new Set());

  // Task & Execution state
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly result = signal<PdfToImgResult | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly formatOptions = computed<SegmentOption<ImageOutputFormat>[]>(() => [
    { value: 'jpeg', label: 'JPG' },
    { value: 'png', label: 'PNG' },
    { value: 'webp', label: 'WEBP' },
  ]);

  protected readonly scaleOptions = computed<SegmentOption<number>[]>(() => [
    { value: 1, label: '1x (72 DPI)' },
    { value: 2, label: '2x HD (144 DPI)' },
    { value: 3, label: '3x Ultra (216 DPI)' },
  ]);

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : null;
  });

  protected readonly selectedCount = computed(() => this.selectedPages().size);
  protected readonly resultBlob = computed(() => this.result()?.blob ?? null);
  protected readonly stale = computed(() => !this.result());

  protected async onFile(file: File): Promise<void> {
    this.errorKey.set(null);
    this.result.set(null);

    try {
      const doc = await openPdf(file);
      try {
        const count = doc.numPages;
        this.pageCount.set(count);
        this.file.set(file);

        // Select all pages initially
        const allSelected = new Set<number>();
        for (let i = 1; i <= count; i++) allSelected.add(i);
        this.selectedPages.set(allSelected);
      } finally {
        await closePdf(doc);
      }

      // Load page thumbnails
      void this.loadThumbnails(file);
    } catch (err) {
      console.error('[PdfToImg] Error loading PDF:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
    }
  }

  private async loadThumbnails(file: File): Promise<void> {
    this.renderingThumbs.set(true);
    const generatedThumbs: PageThumb[] = [];

    try {
      const doc = await openPdf(file);
      try {
        const count = doc.numPages;
        for (let i = 1; i <= count; i++) {
          const page = await doc.getPage(i);
          const { width } = page.getViewport({ scale: 1 });
          const canvas = await renderPageToCanvas(doc, i, THUMB_WIDTH / width);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8),
          );
          releaseCanvas(canvas);

          if (blob) {
            const url = this.urls.create(blob);
            generatedThumbs.push({ index: i, url });
          }
        }
        this.thumbs.set(generatedThumbs);
      } finally {
        await closePdf(doc);
      }
    } catch (err) {
      console.error('[PdfToImg] Error rendering thumbnails:', err);
    } finally {
      this.renderingThumbs.set(false);
    }
  }

  // Page selection handlers
  protected togglePageSelection(pageIndex: number): void {
    const set = new Set(this.selectedPages());
    if (set.has(pageIndex)) {
      set.delete(pageIndex);
    } else {
      set.add(pageIndex);
    }
    this.selectedPages.set(set);
  }

  protected selectAllPages(): void {
    const count = this.pageCount();
    const set = new Set<number>();
    for (let i = 1; i <= count; i++) set.add(i);
    this.selectedPages.set(set);
  }

  protected deselectAllPages(): void {
    this.selectedPages.set(new Set());
  }

  protected isPageSelected(pageIndex: number): boolean {
    return this.selectedPages().has(pageIndex);
  }

  protected isPageDimmed(pageIndex: number): boolean {
    return !this.isPageSelected(pageIndex);
  }

  // Execution
  protected async run(): Promise<void> {
    const f = this.file();
    if (!f || this.busy() || this.selectedCount() === 0) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const res = await this.pdfToImgService.convertToImages({
        file: f,
        format: this.format(),
        scale: this.scale(),
        selectedPages: Array.from(this.selectedPages()),
        onProgress: (p) => this.progress.set(p),
      });

      this.result.set(res);
    } catch (err: any) {
      console.error('[PdfToImg] Conversion failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const res = this.result();
    if (!res) return;
    saveBlob(res.blob, res.filename);
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.file.set(null);
    this.pageCount.set(0);
    this.thumbs.set([]);
    this.result.set(null);
    this.errorKey.set(null);
    this.selectedPages.set(new Set());
  }
}
