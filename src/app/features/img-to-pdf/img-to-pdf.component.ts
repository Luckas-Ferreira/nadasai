import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { PDF_MAX_LONG_SIDE, type PdfPageMode, encodePdfFromImages } from '../../core/image/converters';
import { saveBlob } from '../../core/image/download';
import { assertUsableImage, formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PageGridComponent, type PageItem } from '../../shared/ui/page-grid.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

/** A page here is an image file; the grid itself only needs label + url. */
interface PdfPageItem extends PageItem {
  readonly file: File;
}

/**
 * Thirty pages of capped raster is already a ~15 MB PDF. Past that the encode
 * stops being something you wait through and the browser starts fighting for
 * memory, so the tool says no rather than hanging.
 */
const MAX_PAGES = 30;

/**
 * The only multi-file tool in the app.
 *
 * It deliberately does NOT push its list through ImageStateService: that service
 * holds exactly one file per session, which is what makes the other tools
 * chainable, and a page list is not a chain. It still *reads* the chain on
 * construction, so a crop can flow straight into page one, and it never calls
 * apply() — a PDF is terminal, the same reason convert refuses to continue with
 * one.
 */
@Component({
  selector: 'app-img-to-pdf',
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
    PageGridComponent,
  ],
  templateUrl: './img-to-pdf.component.html',
})
export class ImgToPdfComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly tool = toolById('img-to-pdf');
  private readonly state = inject(ImageStateService);

  protected readonly i18n = inject(TranslationService);

  protected readonly items = signal<readonly PdfPageItem[]>([]);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  /** Soft warning (files skipped, limit hit) — not a failure, so it is dismissible. */
  protected readonly noticeKey = signal<TranslationKey | null>(null);

  protected readonly pageMode = signal<PdfPageMode>('a4');
  protected readonly background = signal('#ffffff');

  protected readonly pageModeOptions = computed<{ value: PdfPageMode; label: string }[]>(() => [
    { value: 'a4', label: this.i18n.t()['imgpdf.page_a4'] },
    { value: 'fit', label: this.i18n.t()['imgpdf.page_fit'] },
  ]);

  protected readonly backdropOptions = [
    { value: '#ffffff', label: '#FFF' },
    { value: '#000000', label: '#000' },
  ];

  protected readonly full = computed(() => this.items().length >= MAX_PAGES);

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : null;
  });

  /**
   * Everything the encode reads — including the page ORDER, which is the whole
   * point of this tool: dragging page 3 to the front has to bring the button back.
   */
  private readonly settings = computed(
    () =>
      `${this.pageMode()}|${this.background()}|${this.items()
        .map((item) => item.id)
        .join(',')}`,
  );

  private readonly ranSettings = signal<string | null>(null);

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  private nextId = 0;

  constructor() {
    const session = this.state.session();
    if (session) this.items.set([this.toItem(session.file, session.originalName)]);
  }

  protected addFiles(files: File[]): void {
    this.errorKey.set(null);
    this.noticeKey.set(null);

    const room = MAX_PAGES - this.items().length;
    if (room <= 0) {
      this.noticeKey.set('imgpdf.limit_reached');
      return;
    }

    const accepted: PdfPageItem[] = [];
    let skipped = false;
    let truncated = false;

    for (const file of files) {
      if (accepted.length >= room) {
        truncated = true;
        break;
      }

      try {
        // The picker's `accept` is a filter, not a guarantee — "All files" is one
        // click away — and a drop bypasses it entirely.
        assertUsableImage(file);
      } catch {
        skipped = true;
        continue;
      }

      accepted.push(this.toItem(file, file.name));
    }

    if (skipped) this.noticeKey.set('imgpdf.some_skipped');
    else if (truncated) this.noticeKey.set('imgpdf.limit_reached');

    if (!accepted.length) return;

    this.items.update((items) => [...items, ...accepted]);
    this.clearResult();
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

  protected removeAt(index: number): void {
    const item = this.items()[index];
    if (!item) return;

    this.urls.revoke(item.url);
    this.items.update((items) => items.filter((_, i) => i !== index));
    this.clearResult();
  }

  protected async run(): Promise<void> {
    const items = this.items();
    if (!items.length || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const settings = this.settings();

      const blob = await encodePdfFromImages(
        items.map((item) => item.file),
        {
          pageMode: this.pageMode(),
          background: this.background(),
          maxLongSide: PDF_MAX_LONG_SIDE,
          onProgress: (done, total) => this.progress.set(Math.round((done / total) * 100)),
        },
      );

      this.resultBlob.set(blob);
      this.ranSettings.set(settings);
    } catch (err) {
      console.error('Images to PDF failed:', err);
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

    // Named after page one, not after whatever the chain last produced.
    saveBlob(blob, suffixedName(first.label, this.tool.suffix, 'pdf'));
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.items.set([]);
    this.resultBlob.set(null);
    this.ranSettings.set(null);
    this.errorKey.set(null);
    this.noticeKey.set(null);
    this.pageMode.set('a4');
    this.background.set('#ffffff');
    this.state.clear();
  }

  private toItem(file: File, label: string): PdfPageItem {
    return { id: `page-${this.nextId++}`, file, label, url: this.urls.create(file) };
  }

  /** The PDF on screen no longer matches the list, so it must not stay downloadable. */
  private clearResult(): void {
    this.resultBlob.set(null);
    this.ranSettings.set(null);
  }
}
