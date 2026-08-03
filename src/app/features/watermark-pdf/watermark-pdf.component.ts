import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
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
import { PdfPasswordPromptComponent } from '../../shared/ui/pdf-password-prompt.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { PdfWatermarkService } from './services/pdf-watermark.service';

const THUMB_WIDTH = 480;

@Component({
  selector: 'app-watermark-pdf',
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
    PdfPasswordPromptComponent,
  ],
  templateUrl: './watermark-pdf.component.html',
})
export class WatermarkPdfComponent {
  protected readonly Math = Math;
  private readonly watermarkService = inject(PdfWatermarkService);
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('watermark-pdf');
  protected readonly i18n = inject(TranslationService);

  // File & document state
  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly pageCount = signal(0);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly renderingPreview = signal(false);

  // Watermark Options
  protected readonly text = signal('CONFIDENCIAL');
  protected readonly opacity = signal(0.3); // 0.1 to 1.0
  protected readonly fontSize = signal(48); // 24, 48, 72
  protected readonly rotationDegrees = signal(-45); // -45, 0, 45
  protected readonly colorHex = signal('#ef4444'); // default red

  // Task & Execution state
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly rotationOptions = computed<SegmentOption<number>[]>(() => [
    { value: -45, label: '-45°' },
    { value: 0, label: '0° (Horizontal)' },
    { value: 45, label: '45°' },
  ]);

  protected readonly fontSizeOptions = computed<SegmentOption<number>[]>(() => [
    { value: 24, label: 'Pequeno (24pt)' },
    { value: 48, label: 'Médio (48pt)' },
    { value: 72, label: 'Grande (72pt)' },
  ]);

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : null;
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : null;
  });

  protected readonly stale = computed(() => !this.resultBlob());

  protected async onFile(file: File, password?: string): Promise<void> {
    this.errorKey.set(null);
    this.resultBlob.set(null);
    this.passwordError.set(null);
    this.pendingFile.set(file);

    try {
      const doc = await openPdf(file, password);
      try {
        const count = doc.numPages;
        this.pageCount.set(count);
        this.file.set(file);
        this.pdfPassword.set(password ?? null);
        this.pdfProtected.set(false);
      } finally {
        await closePdf(doc);
      }

      void this.loadPreview(file, password);
    } catch (err) {
      console.error('[WatermarkPdf] Error loading PDF:', err);
      const msgKey = toMessageKey(err);
      if (msgKey === 'error.pdf_encrypted') {
        this.pdfProtected.set(true);
        if (password) {
          this.passwordError.set(this.i18n.t()['pdf.wrong_password']);
        }
      } else {
        this.errorKey.set(msgKey);
        this.file.set(null);
      }
    }
  }

  private async loadPreview(file: File, password?: string): Promise<void> {
    this.renderingPreview.set(true);
    try {
      const doc = await openPdf(file, password);
      try {
        const page = await doc.getPage(1);
        const { width } = page.getViewport({ scale: 1 });
        const canvas = await renderPageToCanvas(doc, 1, THUMB_WIDTH / width);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8),
        );
        releaseCanvas(canvas);

        if (blob) {
          this.previewUrl.set(this.urls.create(blob));
        }
      } finally {
        await closePdf(doc);
      }
    } catch (err) {
      console.error('[WatermarkPdf] Error rendering preview:', err);
    } finally {
      this.renderingPreview.set(false);
    }
  }

  protected async run(): Promise<void> {
    const f = this.file();
    const txt = this.text().trim();
    if (!f || !txt || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const blob = await this.watermarkService.applyWatermark({
        file: f,
        password: this.pdfPassword() ?? undefined,
        text: txt,
        opacity: this.opacity(),
        fontSize: this.fontSize(),
        rotationDegrees: this.rotationDegrees(),
        colorHex: this.colorHex(),
        onProgress: (p) => this.progress.set(p),
      });

      this.resultBlob.set(blob);
    } catch (err: any) {
      console.error('[WatermarkPdf] Apply watermark failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const f = this.file();
    if (!blob || !f) return;

    saveBlob(blob, suffixedName(f.name, this.tool.suffix, 'pdf'));
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
    this.resultBlob.set(null);
    this.errorKey.set(null);
  }
}
