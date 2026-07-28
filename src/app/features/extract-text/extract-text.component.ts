import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { saveBlob } from '../../core/image/download';
import { suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { toMessageKey } from '../../core/errors';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PreviewSurfaceComponent } from '../../shared/ui/preview-surface.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { type OcrBlock, OcrLang, OcrService } from '../pdf/services/ocr.service';

@Component({
  selector: 'app-extract-text',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    CommonModule,
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PreviewSurfaceComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    IconComponent,
  ],
  templateUrl: './extract-text.component.html',
})
export class ExtractTextComponent {
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('extract-text');
  private readonly ocr = inject(OcrService);

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly extractedText = signal<string>('');
  protected readonly confidence = signal<number>(0);
  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly copied = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly selectedLang = signal<OcrLang>('por+eng');

  protected readonly sourceFile = this.state.currentFile;

  protected readonly charCount = computed(() => {
    const txt = this.extractedText();
    return txt ? txt.length : 0;
  });

  protected readonly wordCount = computed(() => {
    const txt = this.extractedText();
    return txt ? txt.trim().split(/\s+/).filter(Boolean).length : 0;
  });

  constructor() {
    const file = this.sourceFile();
    if (file) {
      this.sourceUrl.set(this.urls.create(file));
      void this.runOcr();
    }
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);
    try {
      this.state.load(file);
      this.sourceUrl.set(this.urls.create(file));
      this.extractedText.set('');
      this.confidence.set(0);
      void this.runOcr();
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected async runOcr(): Promise<void> {
    const file = this.sourceFile();
    if (!file || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(10);

    try {
      // Create HTMLImageElement from file to render onto canvas for Tesseract OCR
      const url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for OCR'));
        img.src = url;
      });
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      this.progress.set(40);

      const res = await this.ocr.recognise(canvas, this.selectedLang());
      this.extractedText.set(res.fullText);

      // Average confidence score across detected text blocks
      if (res.blocks.length > 0) {
        const avgConf =
          res.blocks.reduce((acc: number, b: OcrBlock) => acc + (b.confidence || 0), 0) / res.blocks.length;
        this.confidence.set(Math.round(avgConf));
      } else {
        this.confidence.set(100);
      }

      this.progress.set(100);
    } catch (err) {
      console.error('[ExtractTextComponent] OCR Error:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected copyText(): void {
    const txt = this.extractedText();
    if (!txt) return;

    void navigator.clipboard.writeText(txt);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2500);
  }

  protected downloadTxt(): void {
    const txt = this.extractedText();
    const file = this.sourceFile();
    if (!txt || !file) return;

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    saveBlob(blob, suffixedName(file.name, this.tool.suffix, 'txt'));
  }

  protected reset(): void {
    this.extractedText.set('');
    this.confidence.set(0);
    this.sourceUrl.set(null);
    this.state.clear();
  }
}
