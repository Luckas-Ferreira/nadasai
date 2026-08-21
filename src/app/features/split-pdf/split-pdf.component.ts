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
  PdfSplitterService,
  SplitMainMode,
  SplitPagesMode,
  SplitRange,
  SplitRangeMode,
  SplitResult,
} from './services/pdf-splitter.service';

/** Preview width in CSS pixels for stage thumbnails */
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
    PdfPasswordPromptComponent,
  ],
  templateUrl: './split-pdf.component.html',
})
export class SplitPdfComponent {
  private readonly pdfSplitterService = inject(PdfSplitterService);
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('split-pdf');
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);

  constructor() {
    // A sessão é a fonte: um PDF que veio de img-to-pdf, de outra ferramenta de
    // PDF ou de um desfazer chega por aqui exatamente como o que a pessoa soltou
    // no dropzone. A senha vem junto — antes cada ferramenta guardava a sua, e
    // encadear três num arquivo protegido pedia a mesma senha três vezes.
    hydrateFromWorkspace('split-pdf', (file) =>
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
   * Separado de `errorKey`: a prévia falhar não impede dividir nada — a seleção
   * é por número de página e o arquivo está intacto. O que não pode continuar é
   * o silêncio de antes, em que o spinner parava sobre uma grade vazia.
   */
  protected readonly thumbsWarning = signal<TranslationKey | null>(null);

  // Split Modes
  protected readonly mainMode = signal<SplitMainMode>('range');
  protected readonly rangeSubMode = signal<SplitRangeMode>('custom');
  protected readonly pagesSubMode = signal<SplitPagesMode>('all');

  // Parameters
  protected readonly customRanges = signal<SplitRange[]>([{ from: 1, to: 1 }]);
  protected readonly fixedChunkSize = signal(2);
  protected readonly selectedPages = signal<Set<number>>(new Set());
  protected readonly mergeOutput = signal(false);

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

  /**
   * O tipo REAL da saída. Um zip com vários arquivos não é um PDF,
   * e oferecê-lo às ferramentas que abrem PDF seria prometer algo
   * que a próxima tela ia recusar. `produces` no ToolDef declara o caso de saída
   * única; isto corrige quando não é ele.
   */
  protected readonly resultKind = computed<FileKind | null>(() => {
    const res = this.result();
    if (!res) return null;
    return res.isZip ? 'zip' : 'pdf';
  });

  private resultExt(): string {
    return this.result()?.isZip ? 'zip' : 'pdf';
  }

  protected readonly stale = computed(() => !this.result());

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : null;
  });

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
      if (this.pagesSubMode() === 'all') {
        return total;
      } else {
        const count = this.selectedPages().size;
        return merge ? (count > 0 ? 1 : 0) : count;
      }
    }
  });

  /**
   * O upload. Só entra na sessão — abrir o documento é do `openFile()`, que a
   * hidratação chama. Antes este método fazia as duas coisas, e por isso o
   * caminho "o arquivo já estava na sessão" simplesmente não existia no módulo
   * de PDF: cada ferramenta começava do zero, com um novo upload.
   */
  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'split-pdf');
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

        // Reset ranges & selected pages
        this.customRanges.set([{ from: 1, to: count }]);
        const allSelected = new Set<number>();
        for (let i = 1; i <= count; i++) allSelected.add(i);
        this.selectedPages.set(allSelected);
      } finally {
        await closePdf(doc);
      }

      void this.loadThumbnails(file, password);
    } catch (err) {
      console.error('[SplitPdf] Error loading PDF:', err);
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
      // Duas coisas quebravam aqui, e nenhuma delas aparecia. O `thumbs.set` só
      // acontecia DEPOIS do laço, então uma falha na página 7 de 20 jogava fora
      // as 6 prévias que já estavam prontas; e o catch não dizia nada, então o
      // spinner sumia sobre uma grade vazia. Agora entrega o que deu certo e diz
      // que o resto não deu.
      console.error('[SplitPdf] Error rendering thumbnails:', err);
      this.thumbs.set(generatedThumbs);
      this.thumbsWarning.set('error.pdf_thumbs_failed');
    } finally {
      this.renderingThumbs.set(false);
    }
  }

  // Custom Ranges handlers
  protected addRange(): void {
    const total = this.pageCount();
    const current = this.customRanges();
    const last = current[current.length - 1];
    const newFrom = last ? Math.min(total, last.to + 1) : 1;
    this.customRanges.set([...current, { from: newFrom, to: total }]);
  }

  protected removeRange(index: number): void {
    const current = [...this.customRanges()];
    if (current.length <= 1) return;
    current.splice(index, 1);
    this.customRanges.set(current);
  }

  protected updateRangeFrom(index: number, val: number): void {
    const current = [...this.customRanges()];
    if (current[index]) {
      current[index] = { ...current[index], from: Math.max(1, Math.min(val, this.pageCount())) };
      this.customRanges.set(current);
    }
  }

  protected updateRangeTo(index: number, val: number): void {
    const current = [...this.customRanges()];
    if (current[index]) {
      current[index] = { ...current[index], to: Math.max(1, Math.min(val, this.pageCount())) };
      this.customRanges.set(current);
    }
  }

  protected onThumbClick(pageIndex: number): void {
    if (this.mainMode() === 'pages') {
      this.togglePageSelection(pageIndex);
    }
  }

  protected updateFixedChunk(val: number): void {
    this.fixedChunkSize.set(Math.max(1, val));
  }

  // Page selection handlers
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
    if (this.mainMode() === 'range') return false;
    if (this.pagesSubMode() === 'all') return true;
    return this.selectedPages().has(pageIndex);
  }

  protected isPageDimmed(pageIndex: number): boolean {
    if (this.mainMode() === 'range') return false;
    if (this.pagesSubMode() === 'all') return false;
    return !this.isPageSelected(pageIndex);
  }

  // Execution
  protected async run(): Promise<void> {
    const f = this.file();
    if (!f || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const res = await this.pdfSplitterService.split({
        file: f,
        password: this.pdfPassword() ?? undefined,
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
      // Um zip quando saiu mais de um arquivo: `resultKind` conta isso para a
      // barra de ações, que senão ofereceria "assinar PDF" para um zip.
      this.pendingTransition.registerResult('split-pdf', res.blob, this.tool.suffix, this.resultExt());
    } catch (err: any) {
      console.error('[SplitPdf] Split failed:', err);
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
    this.customRanges.set([{ from: 1, to: 1 }]);
    this.selectedPages.set(new Set());
  }
}
