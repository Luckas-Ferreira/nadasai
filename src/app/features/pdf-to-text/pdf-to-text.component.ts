import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { closePdf, openPdf } from '../../core/pdf/pdfjs';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
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
  PdfToTextService,
  type TextOcrLang,
  type TextOutputFormat,
} from './services/pdf-to-text.service';

@Component({
  selector: 'app-pdf-to-text',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    SegmentedComponent,
    PdfPasswordPromptComponent,
    ButtonDirective,
    IconComponent,
  ],
  templateUrl: './pdf-to-text.component.html',
})
export class PdfToTextComponent {
  private readonly extractor = inject(PdfToTextService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('pdf-to-text');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly pageCount = signal(0);

  protected readonly format = signal<TextOutputFormat>('txt');
  protected readonly useOcr = signal(true);
  protected readonly ocrLang = signal<TextOcrLang>('por+eng');
  protected readonly pageMarkers = signal(false);

  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly text = signal('');
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultExt = signal('txt');
  protected readonly scannedPages = signal(0);
  protected readonly skippedPages = signal(0);
  protected readonly copied = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly formatOptions = computed<SegmentOption<TextOutputFormat>[]>(() => [
    { value: 'txt', label: 'TXT' },
    { value: 'md', label: 'Markdown' },
  ]);

  protected readonly langOptions = computed<SegmentOption<TextOcrLang>[]>(() => [
    { value: 'por+eng', label: this.i18n.t()['pdf.lang.por_eng'] },
    { value: 'por', label: this.i18n.t()['pdf.lang.por'] },
    { value: 'eng', label: this.i18n.t()['pdf.lang.eng'] },
  ]);

  protected readonly characters = computed(() => this.text().length);
  protected readonly words = computed(() => this.text().split(/\s+/).filter(Boolean).length);

  /** Só faz sentido oferecer o idioma do OCR quando o OCR está ligado. */
  protected readonly showLang = computed(() => this.useOcr());

  protected readonly canRun = computed(() => !!this.file() && !this.busy());

  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() =>
    [this.format(), this.useOcr(), this.ocrLang(), this.pageMarkers()].join('|'),
  );

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    hydrateFromWorkspace('pdf-to-text', (file) =>
      void this.openFile(file, this.workspace.pdfPassword() ?? undefined),
    );
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'pdf-to-text');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected onUnlock(password: string): void {
    const file = this.pendingFile();
    if (file) void this.openFile(file, password);
  }

  private async openFile(file: File | null, password?: string): Promise<void> {
    this.clearResult();

    if (!file) {
      this.file.set(null);
      this.pageCount.set(0);
      return;
    }

    try {
      const doc = await openPdf(file, password);
      try {
        this.pageCount.set(doc.numPages);
        this.file.set(file);
        this.pendingFile.set(null);
        this.pdfProtected.set(false);
        this.passwordError.set(null);
        this.pdfPassword.set(password ?? null);
      } finally {
        await closePdf(doc);
      }
    } catch (err) {
      const key = toMessageKey(err);
      if (key === 'error.pdf_encrypted') {
        this.pdfProtected.set(true);
        this.pendingFile.set(file);
        if (password) this.passwordError.set(this.i18n.t()['pdf.wrong_password']);
      } else {
        this.errorKey.set(key);
        this.file.set(null);
      }
    }
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file || !this.canRun()) return;

    this.busy.set(true);
    this.progress.set(0);
    this.errorKey.set(null);

    try {
      const settings = this.settings();

      const res = await this.extractor.convert({
        file,
        password: this.pdfPassword() ?? undefined,
        useOcr: this.useOcr(),
        ocrLang: this.ocrLang(),
        format: this.format(),
        pageMarkers: this.pageMarkers(),
        onProgress: (p) => this.progress.set(p),
      });

      this.text.set(res.text);
      this.resultBlob.set(res.blob);
      this.resultExt.set(res.ext);
      this.scannedPages.set(res.scannedPages);
      this.skippedPages.set(res.skippedPages);
      this.ranSettings.set(settings);

      // `produces: null` — texto não volta para a cadeia de PDF, e nenhuma
      // ferramenta daqui abre um .txt. Nada a registrar.
      this.pendingTransition.clear();
    } catch (err) {
      console.error('[PdfToText] failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  /**
   * Copiar é o caminho principal desta ferramenta, não o download: quem extrai
   * texto de PDF quase sempre vai colar em outro lugar — um editor, um modelo
   * de linguagem, um campo de formulário.
   */
  protected async copy(): Promise<void> {
    const text = this.text();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch (err) {
      console.error('[PdfToText] clipboard failed:', err);
      this.errorKey.set('error.generic');
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.workspace.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, this.resultExt()));
  }

  protected reset(): void {
    this.file.set(null);
    this.pendingFile.set(null);
    this.pdfProtected.set(false);
    this.pageCount.set(0);
    this.clearResult();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private clearResult(): void {
    this.text.set('');
    this.resultBlob.set(null);
    this.scannedPages.set(0);
    this.skippedPages.set(0);
    this.ranSettings.set(null);
    this.pendingTransition.clear();
  }
}
