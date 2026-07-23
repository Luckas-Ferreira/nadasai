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
import {
  PdfSplitterService,
  SplitMainMode,
  SplitPagesMode,
  SplitRange,
  SplitRangeMode,
  SplitResult,
} from './services/pdf-splitter.service';

/** Thumbnail preview width in CSS pixels */
const THUMB_WIDTH = 240;

export interface PageThumb {
  index: number; // 1-based
  url: string;
}

@Component({
  selector: 'app-split-pdf',
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
  templateUrl: './split-pdf.component.html',
})
export class SplitPdfComponent {
  private readonly splitter = inject(PdfSplitterService);
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('split-pdf');
  protected readonly i18n = inject(TranslationService);

  // File & document state
  protected readonly file = signal<File | null>(null);
  protected readonly pageCount = signal(0);
  protected readonly thumbs = signal<PageThumb[]>([]);
  protected readonly renderingThumbs = signal(false);

  // Tabs & Modes
  protected readonly mainMode = signal<SplitMainMode>('pages');
  protected readonly rangeSubMode = signal<SplitRangeMode>('custom');
  protected readonly pagesSubMode = signal<SplitPagesMode>('select');

  // Custom Ranges
  protected readonly customRanges = signal<SplitRange[]>([{ from: 1, to: 1 }]);

  // Fixed Range Chunk Size
  protected readonly fixedChunkSize = signal<number>(2);

  // Selected Pages (1-based index)
  protected readonly selectedPages = signal<Set<number>>(new Set());

  // Options
  protected readonly mergeOutput = signal<boolean>(false);

  // Task & Execution state
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly result = signal<SplitResult | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly mainModeOptions = computed<SegmentOption<SplitMainMode>[]>(() => [
    { value: 'range', label: this.i18n.t()['splitpdf.mode_range'] },
    { value: 'pages', label: this.i18n.t()['splitpdf.mode_pages'] },
  ]);

  protected readonly rangeSubModeOptions = computed<SegmentOption<SplitRangeMode>[]>(() => [
    { value: 'custom', label: this.i18n.t()['splitpdf.range_custom'] },
    { value: 'fixed', label: this.i18n.t()['splitpdf.range_fixed'] },
  ]);

  protected readonly pagesSubModeOptions = computed<SegmentOption<SplitPagesMode>[]>(() => [
    { value: 'all', label: this.i18n.t()['splitpdf.extract_all'] },
    { value: 'select', label: this.i18n.t()['splitpdf.extract_select'] },
  ]);

  protected readonly resultBlob = computed(() => this.result()?.blob ?? null);
  protected readonly stale = computed(() => !this.result());

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : null;
  });

  // Derived Info for Info Banner
  protected readonly estimatedPdfCount = computed(() => {
    const total = this.pageCount();
    if (total === 0) return 0;

    const mode = this.mainMode();
    const merge = this.mergeOutput();

    if (mode === 'range') {
      if (this.rangeSubMode() === 'custom') {
        const ranges = this.customRanges();
        return merge ? (ranges.length > 0 ? 1 : 0) : ranges.length;
      } else {
        const chunkSize = Math.max(1, this.fixedChunkSize());
        const count = Math.ceil(total / chunkSize);
        return merge ? (count > 0 ? 1 : 0) : count;
      }
    } else {
      // mode === 'pages'
      if (this.pagesSubMode() === 'all') {
        return total;
      } else {
        const count = this.selectedPages().size;
        return merge ? (count > 0 ? 1 : 0) : count;
      }
    }
  });

  protected async onFile(file: File): Promise<void> {
    this.errorKey.set(null);
    this.result.set(null);

    try {
      const doc = await openPdf(file);
      try {
        const count = doc.numPages;
        this.pageCount.set(count);
        this.file.set(file);

        // Reset ranges & selected pages
        this.customRanges.set([{ from: 1, to: count }]);
        const allSelected = new Set<number>();
        for (let i = 1; i <= count; i++) allSelected.add(i);
        this.selectedPages.set(allSelected);
      } finally {
        await closePdf(doc);
      }

      // Render page thumbnails asynchronously with its own doc session
      void this.loadThumbnails(file);
    } catch (err) {
      console.error('[SplitPdf] Error loading PDF:', err);
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
      console.error('[SplitPdf] Error rendering thumbnails:', err);
    } finally {
      this.renderingThumbs.set(false);
    }
  }

  // Range management
  protected addRange(): void {
    const total = this.pageCount();
    const current = this.customRanges();
    const last = current[current.length - 1];
    const newFrom = last ? Math.min(total, last.to + 1) : 1;
    const newTo = total > 0 ? total : 1;

    this.customRanges.set([...current, { from: newFrom, to: newTo }]);
  }

  protected removeRange(index: number): void {
    const current = this.customRanges();
    if (current.length > 1) {
      this.customRanges.set(current.filter((_, i) => i !== index));
    }
  }

  protected updateRangeFrom(index: number, event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10) || 1;
    const current = [...this.customRanges()];
    if (current[index]) {
      current[index] = { ...current[index], from: Math.max(1, Math.min(this.pageCount(), val)) };
      this.customRanges.set(current);
    }
  }

  protected updateRangeTo(index: number, event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10) || 1;
    const current = [...this.customRanges()];
    if (current[index]) {
      current[index] = { ...current[index], to: Math.max(current[index].from, Math.min(this.pageCount(), val)) };
      this.customRanges.set(current);
    }
  }

  // Page selection
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
    if (this.mainMode() === 'pages' && this.pagesSubMode() === 'all') {
      return true;
    }
    if (this.mainMode() === 'pages' && this.pagesSubMode() === 'select') {
      return this.selectedPages().has(pageIndex);
    }
    if (this.mainMode() === 'range') {
      if (this.rangeSubMode() === 'custom') {
        return this.customRanges().some((r) => pageIndex >= r.from && pageIndex <= r.to);
      } else {
        return true;
      }
    }
    return false;
  }

  protected isPageDimmed(pageIndex: number): boolean {
    return !this.isPageSelected(pageIndex);
  }

  protected onThumbClick(pageIndex: number): void {
    if (this.mainMode() !== 'pages') {
      this.mainMode.set('pages');
    }
    if (this.pagesSubMode() !== 'select') {
      this.pagesSubMode.set('select');
    }
    this.togglePageSelection(pageIndex);
  }

  // Fixed Chunk Size Update
  protected updateFixedChunk(event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10) || 1;
    this.fixedChunkSize.set(Math.max(1, Math.min(this.pageCount(), val)));
  }

  // Run Split
  protected async run(): Promise<void> {
    const f = this.file();
    if (!f || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const res = await this.splitter.split({
        file: f,
        mode: this.mainMode(),
        rangeSubMode: this.rangeSubMode(),
        pagesSubMode: this.pagesSubMode(),
        customRanges: this.customRanges(),
        fixedChunkSize: this.fixedChunkSize(),
        selectedPages: Array.from(this.selectedPages()),
        mergeOutput: this.mergeOutput(),
        onProgress: (p) => this.progress.set(p),
      });

      this.result.set(res);
    } catch (err: any) {
      console.error('[SplitPdf] Run failed:', err);
      if (err.message === 'no_pages_selected') {
        this.errorKey.set('error.generic');
      } else {
        this.errorKey.set(toMessageKey(err));
      }
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
    this.customRanges.set([{ from: 1, to: 1 }]);
    this.selectedPages.set(new Set());
    this.fixedChunkSize.set(2);
    this.mergeOutput.set(false);
  }
}
