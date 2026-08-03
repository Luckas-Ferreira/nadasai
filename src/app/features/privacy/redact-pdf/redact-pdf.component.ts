import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslationService, type TranslationKey } from '../../../core/services/translation.service';
import { toMessageKey } from '../../../core/errors';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../../core/pdf/pdfjs';
import { canvasToBlob } from '../../../core/image/image-file.util';
import type { RedactMode, Region } from '../../../core/geometry/region';
import { ObjectUrlScope } from '../../../core/image/object-url';
import { saveBlob } from '../../../core/image/download';
import { PdfRedactorService, type RedactPdfResult } from './services/pdf-redactor.service';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';
import { RegionOverlayComponent } from '../../../shared/ui/region-overlay.component';
import { PdfPasswordPromptComponent } from '../../../shared/ui/pdf-password-prompt.component';
import { SegmentedComponent, type SegmentOption } from '../../../shared/ui/segmented.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/** Enough to read the page and place a box; the export re-renders at 150 DPI. */
const PREVIEW_SCALE = 1.4;

@Component({
  selector: 'app-redact-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    AlertComponent,
    ActionBarComponent,
    RegionOverlayComponent,
    PdfPasswordPromptComponent,
    SegmentedComponent,
    ButtonDirective,
    IconComponent,
  ],
  templateUrl: './redact-pdf.component.html',
})
export class RedactPdfComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly redactor = inject(PdfRedactorService);
  private readonly urls = inject(ObjectUrlScope);

  protected readonly file = signal<File | null>(null);
  /** Parked here while the password prompt is up — the two-step flow. */
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly passwordError = signal<string | null>(null);
  private password: string | undefined;

  protected readonly pageCount = signal(0);
  protected readonly currentPage = signal(1);
  protected readonly pageUrl = signal<string | null>(null);

  protected readonly regions = signal<readonly Region[]>([]);
  protected readonly mode = signal<RedactMode>('black');

  protected readonly busy = signal(false);
  protected readonly progress = signal<{ done: number; total: number; percent: number } | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly result = signal<RedactPdfResult | null>(null);

  private readonly ranRegions = signal<readonly Region[] | null>(null);

  protected readonly modeOptions = computed<readonly SegmentOption<RedactMode>[]>(() => [
    { value: 'black', label: this.i18n.t()['redact.mode_black'] },
    { value: 'pixelate', label: this.i18n.t()['redact.mode_blur'] },
  ]);

  protected readonly stale = computed(() => !this.result() || this.regions() !== this.ranRegions());

  protected async onFileSelected(file: File): Promise<void> {
    this.password = undefined;
    this.passwordError.set(null);
    await this.open(file);
  }

  protected async unlock(password: string): Promise<void> {
    const pending = this.pendingFile();
    if (!pending) return;
    this.password = password;
    await this.open(pending);
  }

  private async open(file: File): Promise<void> {
    this.errorKey.set(null);
    try {
      const doc = await openPdf(file, this.password);
      try {
        this.pageCount.set(doc.numPages);
      } finally {
        await closePdf(doc);
      }

      this.file.set(file);
      this.pendingFile.set(null);
      this.passwordError.set(null);
      this.regions.set([]);
      this.result.set(null);
      this.currentPage.set(1);
      await this.renderPage(1);
    } catch (err) {
      const key = toMessageKey(err);
      if (key === 'error.pdf_encrypted') {
        // Not an error the user can act on by retrying — it is a prompt.
        this.pendingFile.set(file);
        this.file.set(null);
        if (this.password) this.passwordError.set(this.i18n.t()['pdf.wrong_password']);
        return;
      }
      this.errorKey.set(key);
    }
  }

  private async renderPage(page: number): Promise<void> {
    const file = this.file();
    if (!file) return;

    const doc = await openPdf(file, this.password);
    try {
      const canvas = await renderPageToCanvas(doc, page, PREVIEW_SCALE);
      const blob = await canvasToBlob(canvas, 'image/png');
      releaseCanvas(canvas);
      this.pageUrl.set(this.urls.replace(this.pageUrl(), blob));
    } finally {
      await closePdf(doc);
    }
  }

  protected async goTo(page: number): Promise<void> {
    if (page < 1 || page > this.pageCount()) return;
    this.currentPage.set(page);
    this.pageUrl.set(null);
    await this.renderPage(page);
  }

  protected addRegion(region: Region): void {
    this.regions.update((list) => [...list, region]);
    this.result.set(null);
  }

  protected removeRegion(id: string): void {
    this.regions.update((list) => list.filter((r) => r.id !== id));
    this.result.set(null);
  }

  protected clearRegions(): void {
    this.regions.set([]);
    this.result.set(null);
  }

  protected async run(): Promise<void> {
    const file = this.file();
    const regions = this.regions();
    if (!file || regions.length === 0 || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set({ done: 0, total: this.pageCount(), percent: 0 });

    try {
      const result = await this.redactor.redact({
        file,
        password: this.password,
        regions,
        onProgress: (done, total) =>
          this.progress.set({ done, total, percent: Math.round((done / total) * 100) }),
      });
      this.result.set(result);
      this.ranRegions.set(regions);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const r = this.result();
    if (r) saveBlob(r.blob, r.filename);
  }

  protected reset(): void {
    this.urls.revoke(this.pageUrl());
    this.pageUrl.set(null);
    this.file.set(null);
    this.pendingFile.set(null);
    this.password = undefined;
    this.passwordError.set(null);
    this.pageCount.set(0);
    this.currentPage.set(1);
    this.regions.set([]);
    this.result.set(null);
    this.ranRegions.set(null);
    this.errorKey.set(null);
  }
}
