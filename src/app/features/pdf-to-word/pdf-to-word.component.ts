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
import { PdfPasswordPromptComponent } from '../../shared/ui/pdf-password-prompt.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  PdfToWordService,
  type PdfToWordOcrLang,
  type PdfToWordResult,
} from './services/pdf-to-word.service';

/** Largura do thumbnail em px de CSS, igual à das outras ferramentas de PDF. */
const THUMB_WIDTH = 240;

interface PageThumb {
  index: number;
  url: string;
}

/**
 * PDF → Word.
 *
 * Fora da chain do `ImageStateService`, como todas as ferramentas de PDF: a
 * chain guarda um arquivo de imagem por sessão, e um .docx é terminal do mesmo
 * jeito que um PDF é. Todo o estado de execução mora aqui para que o Angular o
 * destrua na navegação; o serviço é stateless.
 */
@Component({
  selector: 'app-pdf-to-word',
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
  templateUrl: './pdf-to-word.component.html',
})
export class PdfToWordComponent {
  private readonly converter = inject(PdfToWordService);
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('pdf-to-word');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly pageCount = signal(0);
  protected readonly thumbs = signal<PageThumb[]>([]);
  protected readonly renderingThumbs = signal(false);

  // Configurações que o run() lê.
  protected readonly useOcr = signal(true);
  protected readonly ocrLang = signal<PdfToWordOcrLang>('por+eng');
  protected readonly preserveLineBreaks = signal(false);

  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly result = signal<PdfToWordResult | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  /**
   * Assinatura das opções com que o resultado atual foi produzido.
   *
   * O botão primário some quando apertá-lo só reproduziria os mesmos bytes já
   * na tela, e volta no instante em que qualquer opção muda — aqui isso importa
   * mais do que na maioria: reconverter com OCR ligado leva dezenas de segundos
   * por página, e um botão que refaz esse trabalho para nada é caro de verdade.
   */
  private readonly ranSettings = signal<string | null>(null);

  protected readonly ocrLangOptions = computed<SegmentOption<PdfToWordOcrLang>[]>(() => [
    { value: 'por+eng', label: this.i18n.t()['p2w.lang_auto'] },
    { value: 'por', label: this.i18n.t()['p2w.lang_pt'] },
    { value: 'eng', label: this.i18n.t()['p2w.lang_en'] },
  ]);

  private readonly settingsKey = computed(() =>
    JSON.stringify([this.useOcr(), this.ocrLang(), this.preserveLineBreaks()]),
  );

  protected readonly stale = computed(
    () => !this.result() || this.ranSettings() !== this.settingsKey(),
  );

  protected readonly resultBlob = computed(() => this.result()?.blob ?? null);

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : null;
  });

  /** Páginas escaneadas que ficaram de fora porque o OCR estava desligado. */
  protected readonly skippedWarning = computed(() => {
    const res = this.result();
    return res && res.skippedPages > 0 ? res.skippedPages : 0;
  });

  protected async onFile(file: File, password?: string): Promise<void> {
    this.errorKey.set(null);
    this.result.set(null);
    this.ranSettings.set(null);
    this.passwordError.set(null);
    this.pendingFile.set(file);

    try {
      const doc = await openPdf(file, password);
      try {
        this.pageCount.set(doc.numPages);
        this.file.set(file);
        this.pdfPassword.set(password ?? null);
        this.pdfProtected.set(false);
      } finally {
        await closePdf(doc);
      }

      void this.loadThumbnails(file, password);
    } catch (err) {
      console.error('[PdfToWord] Falha ao abrir o PDF:', err);
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

  private async loadThumbnails(file: File, password?: string): Promise<void> {
    this.renderingThumbs.set(true);
    const generated: PageThumb[] = [];

    try {
      const doc = await openPdf(file, password);
      try {
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const { width } = page.getViewport({ scale: 1 });
          const canvas = await renderPageToCanvas(doc, i, THUMB_WIDTH / width);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8),
          );
          releaseCanvas(canvas);

          if (blob) {
            generated.push({ index: i, url: this.urls.create(blob) });
          }
        }
        this.thumbs.set(generated);
      } finally {
        await closePdf(doc);
      }
    } catch (err) {
      console.error('[PdfToWord] Falha ao renderizar miniaturas:', err);
    } finally {
      this.renderingThumbs.set(false);
    }
  }

  protected async run(): Promise<void> {
    const f = this.file();
    if (!f || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const res = await this.converter.convert({
        file: f,
        password: this.pdfPassword() ?? undefined,
        useOcr: this.useOcr(),
        ocrLang: this.ocrLang(),
        preserveLineBreaks: this.preserveLineBreaks(),
        onProgress: (p) => this.progress.set(p),
      });

      this.result.set(res);
      this.ranSettings.set(this.settingsKey());
    } catch (err) {
      console.error('[PdfToWord] Conversão falhou:', err);
      this.errorKey.set(toMessageKey(err));
      this.result.set(null);
      this.ranSettings.set(null);
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
    this.pendingFile.set(null);
    this.pdfProtected.set(false);
    this.pdfPassword.set(null);
    this.passwordError.set(null);
    this.pageCount.set(0);
    this.thumbs.set([]);
    this.result.set(null);
    this.ranSettings.set(null);
    this.errorKey.set(null);
  }
}
