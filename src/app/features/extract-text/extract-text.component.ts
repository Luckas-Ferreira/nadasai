import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { saveBlob } from '../../core/image/download';
import { suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { toMessageKey } from '../../core/errors';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
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
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);

  constructor() {
    hydrateFromWorkspace('extract-text', (file) => this.openFile(file));
  }

  protected readonly i18n = inject(TranslationService);

  protected readonly currentFile = signal<File | null>(null);
  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly extractedText = signal<string>('');
  protected readonly confidence = signal<number>(0);
  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly copied = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly selectedLang = signal<OcrLang>('por+eng');

  protected readonly charCount = computed(() => {
    const txt = this.extractedText();
    return txt ? txt.length : 0;
  });

  protected readonly wordCount = computed(() => {
    const txt = this.extractedText();
    return txt ? txt.trim().split(/\s+/).filter(Boolean).length : 0;
  });

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'extract-text');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private openFile(file: File | null): void {
    this.extractedText.set('');
    this.confidence.set(0);
    this.pendingTransition.clear();

    if (!file) {
      this.urls.revoke(this.sourceUrl());
      this.sourceUrl.set(null);
      this.currentFile.set(null);
      return;
    }

    this.currentFile.set(file);
    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));
    void this.runOcr();
  }

  protected async runOcr(): Promise<void> {
    const file = this.currentFile();
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

      // O texto extraído é um arquivo como outro qualquer, e entrar na sessão é
      // o que liga esta ferramenta ao comparador de textos e ao criptografar
      // texto — até aqui ela terminava num botão de copiar.
      this.pendingTransition.registerResult(
        'extract-text',
        new Blob([res.fullText], { type: 'text/plain;charset=utf-8' }),
        this.tool.suffix,
        'txt',
      );
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
    const file = this.currentFile();
    if (!txt || !file) return;

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
    saveBlob(blob, suffixedName(file.name, this.tool.suffix, 'txt'));
  }

  protected reset(): void {
    this.pendingTransition.clear();
    this.workspace.clear();
    this.extractedText.set('');
    this.confidence.set(0);
    this.sourceUrl.set(null);
    this.currentFile.set(null);
  }
}
