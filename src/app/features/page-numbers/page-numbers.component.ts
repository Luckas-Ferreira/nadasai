import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { canvasToBlob, formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { closePdf, openPdf, releaseCanvas, renderPageToCanvas } from '../../core/pdf/pdfjs';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PdfPasswordPromptComponent } from '../../shared/ui/pdf-password-prompt.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  PdfPageNumbersService,
  type NumberFormat,
  type NumberPosition,
} from './services/pdf-page-numbers.service';

/** A prévia é a ÚLTIMA página, não a primeira: a primeira é a que costuma ser pulada. */
const PREVIEW_WIDTH = 420;

@Component({
  selector: 'app-page-numbers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    SegmentedComponent,
    PdfPasswordPromptComponent,
  ],
  templateUrl: './page-numbers.component.html',
})
export class PageNumbersComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly numbers = inject(PdfPageNumbersService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('page-numbers');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly pdfPassword = signal<string | null>(null);

  protected readonly pageCount = signal(0);
  protected readonly previewUrl = signal<string | null>(null);

  protected readonly position = signal<NumberPosition>('bottom-center');
  protected readonly format = signal<NumberFormat>('plain');
  protected readonly fontSize = signal(11);
  protected readonly startAt = signal(1);
  protected readonly skipFirst = signal(0);

  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly positionOptions = computed<SegmentOption<NumberPosition>[]>(() => [
    { value: 'bottom-center', label: this.i18n.t()['pagenum.pos_bottom_center'] },
    { value: 'bottom-right', label: this.i18n.t()['pagenum.pos_bottom_right'] },
    { value: 'bottom-left', label: this.i18n.t()['pagenum.pos_bottom_left'] },
    { value: 'top-center', label: this.i18n.t()['pagenum.pos_top_center'] },
    { value: 'top-right', label: this.i18n.t()['pagenum.pos_top_right'] },
    { value: 'top-left', label: this.i18n.t()['pagenum.pos_top_left'] },
  ]);

  /**
   * Os quatro formatos, mostrados JÁ RESOLVIDOS com o número que sairia. Um
   * seletor rotulado "simples / com total / com rótulo" obriga a pessoa a
   * imaginar o resultado; mostrar "1", "1 de 10", "Página 1" e "— 1 —" não.
   */
  protected readonly formatOptions = computed<SegmentOption<NumberFormat>[]>(() => {
    const t = this.i18n.t();
    const n = this.startAt();
    const total = this.numberedCount();
    return [
      { value: 'plain', label: String(n) },
      { value: 'of-total', label: `${n} ${t['pagenum.of']} ${total}` },
      { value: 'page-n', label: `${t['pagenum.page']} ${n}` },
      { value: 'dash', label: `— ${n} —` },
    ];
  });

  protected readonly numberedCount = computed(() =>
    Math.max(0, this.pageCount() - this.skipFirst()),
  );

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  protected readonly canRun = computed(() => !!this.file() && this.numberedCount() > 0);

  /** As opções com que o PDF na tela foi escrito; `null` enquanto não há resultado. */
  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() =>
    [
      this.position(),
      this.format(),
      this.fontSize(),
      this.startAt(),
      this.skipFirst(),
      this.i18n.currentLang(),
    ].join('|'),
  );

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    hydrateFromWorkspace('page-numbers', (file) =>
      void this.openFile(file, this.workspace.pdfPassword() ?? undefined),
    );
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'page-numbers');
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
      this.urls.revoke(this.previewUrl());
      this.previewUrl.set(null);
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

        await this.renderPreview(doc);
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

  /**
   * A prévia é a ÚLTIMA página do documento, e isso é deliberado: a primeira é
   * exatamente a que a maioria das pessoas pula (capa), então ela é a pior
   * escolha possível para mostrar onde o número vai cair.
   */
  private async renderPreview(doc: Awaited<ReturnType<typeof openPdf>>): Promise<void> {
    try {
      const index = doc.numPages;
      const page = await doc.getPage(index);
      const { width } = page.getViewport({ scale: 1 });
      const canvas = await renderPageToCanvas(doc, index, PREVIEW_WIDTH / width);
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
      releaseCanvas(canvas);
      this.previewUrl.set(this.urls.replace(this.previewUrl(), blob));
    } catch {
      // A prévia é conforto, não função: sem ela a ferramenta numera igual, e o
      // painel continua dizendo quantas páginas serão numeradas.
      this.previewUrl.set(null);
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
      const t = this.i18n.t();

      const res = await this.numbers.addNumbers({
        file,
        position: this.position(),
        format: this.format(),
        labels: { page: t['pagenum.page'], of: t['pagenum.of'] },
        fontSize: this.fontSize(),
        startAt: this.startAt(),
        skipFirst: this.skipFirst(),
        onProgress: (p) => this.progress.set(p),
      });

      this.resultBlob.set(res.blob);
      this.ranSettings.set(settings);
      this.pendingTransition.registerResult('page-numbers', res.blob, this.tool.suffix, 'pdf');
    } catch (err) {
      console.error('[PageNumbers] failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.workspace.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, 'pdf'));
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.file.set(null);
    this.pendingFile.set(null);
    this.pdfProtected.set(false);
    this.pageCount.set(0);
    this.previewUrl.set(null);
    this.skipFirst.set(0);
    this.startAt.set(1);
    this.clearResult();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private clearResult(): void {
    this.resultBlob.set(null);
    this.ranSettings.set(null);
    this.pendingTransition.clear();
  }
}
