import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { canvasToBlob, formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../core/pdf/pdfjs';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PageGridComponent, type PageItem } from '../../shared/ui/page-grid.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { PdfMergerService } from './services/pdf-merger.service';

/**
 * Thumbnailing is the expensive part — every page is rendered through pdf.js
 * before the user has done anything — so the caps are on what we RENDER, not on
 * what pdf-lib could handle. 300 pages is already a long wait on a phone.
 */
const MAX_FILES = 20;
const MAX_PAGES = 300;

/** Thumbnail width in CSS pixels. The grid tile is ~160px at its widest. */
const THUMB_WIDTH = 160;

interface MergePageItem extends PageItem {
  readonly srcFile: File;
  /** 0-based, into `srcFile`'s own pages. */
  readonly srcPageIndex: number;
  readonly rotation: number;
}

/**
 * Merge PDFs, with page-level arrangement.
 *
 * Like img-to-pdf, this deliberately stays off `WorkspaceService`: that service
 * holds one image per session and rejects anything that is not `image/*`, which
 * is exactly what keeps a PDF out of the editing chain. A merged PDF is
 * terminal — it is downloaded, not handed to the next tool.
 */
@Component({
  selector: 'app-merge-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    PageGridComponent,
  ],
  templateUrl: './merge-pdf.component.html',
})
export class MergePdfComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly merger = inject(PdfMergerService);
  private readonly tool = toolById('merge-pdf');
  private readonly pendingTransition = inject(PendingTransitionService);

  protected readonly i18n = inject(TranslationService);

  protected readonly items = signal<readonly MergePageItem[]>([]);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly busy = signal(false);
  protected readonly reading = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  /** Soft warning (files skipped, limit hit) — not a failure, so it is dismissible. */
  protected readonly noticeKey = signal<TranslationKey | null>(null);

  protected readonly full = computed(() => this.items().length >= MAX_PAGES);

  protected readonly fileCount = computed(() => new Set(this.items().map((i) => i.srcFile)).size);

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : null;
  });

  /**
   * Everything the merge reads: the page ORDER and each page's rotation. Both
   * have to be in here — dragging page 3 to the front or turning one sideways
   * must bring the button back, or the stale PDF stays downloadable.
   */
  private readonly settings = computed(() =>
    this.items()
      .map((item) => `${item.id}:${item.rotation}`)
      .join(','),
  );

  private readonly ranSettings = signal<string | null>(null);

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  private nextId = 0;

  protected async addFiles(files: File[]): Promise<void> {
    if (this.reading() || this.busy()) return;

    this.errorKey.set(null);
    this.noticeKey.set(null);

    if (this.items().length >= MAX_PAGES) {
      this.noticeKey.set('mergepdf.limit_pages');
      return;
    }

    const fileRoom = MAX_FILES - this.fileCount();
    if (fileRoom <= 0) {
      this.noticeKey.set('mergepdf.limit_files');
      return;
    }

    this.reading.set(true);
    this.progress.set(0);

    let skipped = false;
    let truncated: TranslationKey | null = files.length > fileRoom ? 'mergepdf.limit_files' : null;

    try {
      const queue = files.slice(0, fileRoom);
      let done = 0;

      for (const file of queue) {
        try {
          const added = await this.readPages(file);
          if (!added) truncated = 'mergepdf.limit_pages';
        } catch {
          // One unreadable file must not abandon the rest of the drop.
          skipped = true;
        }

        this.progress.set(Math.round((++done / queue.length) * 100));
      }

      if (skipped) this.noticeKey.set('mergepdf.some_skipped');
      else if (truncated) this.noticeKey.set(truncated);
    } finally {
      this.reading.set(false);
      this.progress.set(null);
    }
  }

  /** Renders one file's pages into thumbnails. Returns false if the cap cut it short. */
  private async readPages(file: File): Promise<boolean> {
    const doc = await openPdf(file);

    try {
      const accepted: MergePageItem[] = [];
      let complete = true;

      for (let i = 1; i <= doc.numPages; i++) {
        if (this.items().length + accepted.length >= MAX_PAGES) {
          complete = false;
          break;
        }

        const page = await doc.getPage(i);
        const { width } = page.getViewport({ scale: 1 });
        const canvas = await renderPageToCanvas(doc, i, THUMB_WIDTH / width);

        // JPEG at a low quality: these are 160px tiles, and a 300-page merge
        // would otherwise hold 300 PNGs in memory for the whole session.
        const thumb = await canvasToBlob(canvas, 'image/jpeg', 0.7);
        releaseCanvas(canvas);

        accepted.push({
          id: `page-${this.nextId++}`,
          label: `${file.name} · ${i}`,
          url: this.urls.create(thumb),
          rotation: 0,
          srcFile: file,
          srcPageIndex: i - 1,
        });
      }

      if (accepted.length) {
        this.items.update((items) => [...items, ...accepted]);
        this.clearResult();
      }

      return complete;
    } finally {
      // pdf.js keeps a worker-side copy of the whole document alive otherwise.
      await closePdf(doc);
    }
  }

  protected reorder({ from, to }: { from: number; to: number }): void {
    this.items.update((items) => {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    this.clearResult();
  }

  protected rotateAt(index: number): void {
    this.items.update((items) =>
      items.map((item, i) => (i === index ? { ...item, rotation: (item.rotation + 90) % 360 } : item)),
    );
    this.clearResult();
  }

  protected removeAt(index: number): void {
    const item = this.items()[index];
    if (!item) return;

    this.urls.revoke(item.url);
    this.items.update((items) => items.filter((_, i) => i !== index));
    this.clearResult();
  }

  protected async run(): Promise<void> {
    const items = this.items();
    if (!items.length || this.busy() || this.reading()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const settings = this.settings();

      const blob = await this.merger.merge(
        items.map((item) => ({
          file: item.srcFile,
          pageIndex: item.srcPageIndex,
          rotation: item.rotation,
        })),
        (done, total) => this.progress.set(Math.round((done / total) * 100)),
      );

      this.resultBlob.set(blob);
      // Como img-to-pdf: a lista de origens é local (uma lista reordenável não é
      // uma cadeia), mas o RESULTADO entra na sessão, para seguir direto para
      // comprimir, proteger ou assinar sem passar pelo disco.
      this.pendingTransition.registerResult('merge-pdf', blob, this.tool.suffix, 'pdf');
      this.ranSettings.set(settings);
    } catch (err) {
      console.error('Merge PDF failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const first = this.items()[0];
    if (!blob || !first) return;

    // Named after page one's source document, mirroring img-to-pdf.
    saveBlob(blob, suffixedName(first.srcFile.name, this.tool.suffix, 'pdf'));
  }

  protected reset(): void {
    this.pendingTransition.clear();
    this.urls.releaseAll();
    this.items.set([]);
    this.resultBlob.set(null);
    this.ranSettings.set(null);
    this.errorKey.set(null);
    this.noticeKey.set(null);
  }

  /** The PDF on screen no longer matches the list, so it must not stay downloadable. */
  private clearResult(): void {
    this.resultBlob.set(null);
    this.ranSettings.set(null);
  }
}
