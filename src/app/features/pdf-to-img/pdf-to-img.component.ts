import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../core/pdf/pdfjs';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import type { FileKind } from '../../core/files/kind';
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
  ImageOutputFormat,
  PdfToImgResult,
  PdfToImgService,
} from './services/pdf-to-img.service';

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
    PdfPasswordPromptComponent,
  ],
  templateUrl: './pdf-to-img.component.html',
})
export class PdfToImgComponent {
  private readonly pdfToImgService = inject(PdfToImgService);
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('pdf-to-img');
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);

  constructor() {
    // A sessão é a fonte: um PDF que veio de img-to-pdf, de outra ferramenta de
    // PDF ou de um desfazer chega por aqui exatamente como o que a pessoa soltou
    // no dropzone. A senha vem junto — antes cada ferramenta guardava a sua, e
    // encadear três num arquivo protegido pedia a mesma senha três vezes.
    hydrateFromWorkspace('pdf-to-img', (file) =>
      void this.openFile(file, this.workspace.pdfPassword() ?? undefined),
    );
  }
  protected readonly i18n = inject(TranslationService);

  // File & document state
  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly pageCount = signal(0);
  protected readonly thumbs = signal<PageThumb[]>([]);
  protected readonly renderingThumbs = signal(false);

  /**
   * Separado de `errorKey`: a prévia falhar não impede converter nada — a
   * seleção é por número de página e o arquivo está intacto. O que não pode
   * continuar é o silêncio de antes, em que o spinner parava sobre uma grade
   * vazia.
   */
  protected readonly thumbsWarning = signal<TranslationKey | null>(null);

  // Options
  protected readonly format = signal<ImageOutputFormat>('png');
  protected readonly scale = signal<number>(2); // 1=1x, 2=2x, 3=3x
  protected readonly selectedPages = signal<Set<number>>(new Set());

  // Task & Execution state
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly result = signal<PdfToImgResult | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly formatOptions = computed<SegmentOption<ImageOutputFormat>[]>(() => [
    { value: 'png', label: 'PNG' },
    { value: 'jpeg', label: 'JPG' },
    { value: 'webp', label: 'WebP' },
  ]);

  protected readonly scaleOptions = computed<SegmentOption<number>[]>(() => [
    { value: 1, label: '1x (72 DPI)' },
    { value: 2, label: '2x (150 DPI)' },
    { value: 3, label: '3x (300 DPI)' },
  ]);

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : null;
  });

  protected readonly selectedCount = computed(() => this.selectedPages().size);
  protected readonly resultBlob = computed(() => this.result()?.blob ?? null);

  /**
   * O tipo REAL da saída. Um zip com várias páginas não é uma imagem, e
   * oferecê-lo a cortar/redimensionar seria prometer algo que a próxima tela vai
   * recusar. `produces` no ToolDef declara o caso de saída única; isto corrige
   * quando não é ele.
   */
  protected readonly resultKind = computed<FileKind | null>(() => {
    const res = this.result();
    if (!res) return null;
    return res.isZip ? 'zip' : 'image';
  });

  private resultExt(): string {
    const res = this.result();
    if (!res) return 'png';
    return res.isZip ? 'zip' : (res.filename.split('.').pop() ?? 'png');
  }
  protected readonly stale = computed(() => !this.result());

  /**
   * O upload. Só entra na sessão — abrir o documento é do `openFile()`, que a
   * hidratação chama. Antes este método fazia as duas coisas, e por isso o
   * caminho "o arquivo já estava na sessão" simplesmente não existia no módulo
   * de PDF: cada ferramenta começava do zero, com um novo upload.
   */
  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'pdf-to-img');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  /** A senha do prompt: guardada na sessão, para o resto da cadeia não repetir. */
  protected onUnlock(password: string): void {
    this.workspace.setPdfPassword(password);
    void this.openFile(this.pendingFile(), password);
  }

  private async openFile(file: File | null, password?: string): Promise<void> {
    if (!file) {
      this.reset();
      return;
    }

    this.errorKey.set(null);
    this.result.set(null);
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

        const allSelected = new Set<number>();
        for (let i = 1; i <= count; i++) allSelected.add(i);
        this.selectedPages.set(allSelected);
      } finally {
        await closePdf(doc);
      }

      void this.loadThumbnails(file, password);
    } catch (err) {
      console.error('[PdfToImg] Error loading PDF:', err);
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
    this.thumbsWarning.set(null);
    const generatedThumbs: PageThumb[] = [];

    try {
      const doc = await openPdf(file, password);
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
      // Mesmo par de defeitos do split-pdf: o `thumbs.set` vinha só depois do
      // laço, então uma falha no meio apagava as prévias já prontas, e o catch
      // não dizia nada — spinner sumindo sobre uma grade vazia. Entrega o que
      // deu certo e avisa sobre o resto.
      console.error('[PdfToImg] Error rendering thumbnails:', err);
      this.thumbs.set(generatedThumbs);
      this.thumbsWarning.set('error.pdf_thumbs_failed');
    } finally {
      this.renderingThumbs.set(false);
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
        password: this.pdfPassword() ?? undefined,
        format: this.format(),
        scale: this.scale(),
        selectedPages: Array.from(this.selectedPages()),
        onProgress: (p) => this.progress.set(p),
      });

      this.result.set(res);
      this.pendingTransition.registerResult('pdf-to-img', res.blob, this.tool.suffix, this.resultExt());
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
    this.pendingTransition.clear();
    this.workspace.clear();
    this.urls.releaseAll();
    this.file.set(null);
    this.pendingFile.set(null);
    this.pdfProtected.set(false);
    this.pdfPassword.set(null);
    this.passwordError.set(null);
    this.pageCount.set(0);
    this.thumbs.set([]);
    this.result.set(null);
    this.errorKey.set(null);
    this.selectedPages.set(new Set());
  }
}
