import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PageGridComponent, type PageItem } from '../../shared/ui/page-grid.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PdfPasswordPromptComponent } from '../../shared/ui/pdf-password-prompt.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { PdfOrganizerService } from '../organize-pdf/services/pdf-organizer.service';

/** Thumbnail width in CSS pixels, same as organize-pdf. */
const THUMB_WIDTH = 160;

interface RotatePageItem extends PageItem {
  readonly srcPageIndex: number;
  readonly rotation: number;
}

/**
 * GIRAR É UMA FERRAMENTA À PARTE DO ORGANIZAR, e a diferença é o controle
 * principal, não o motor.
 *
 * O `organize-pdf` já sabe girar uma página, e o `PdfOrganizerService` já
 * recebe a rotação por página — este componente reusa os dois inteiros e não
 * ganhou serviço nenhum. O que ele acrescenta é o caso real de quem procura
 * "girar PDF": o documento INTEIRO foi escaneado de lado. No organizar isso é
 * clicar em vinte miniaturas; aqui é um botão.
 *
 * A rotação por miniatura continua existindo, para a página avulsa que veio
 * torta no meio de um documento certo.
 */
@Component({
  selector: 'app-rotate-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    PageGridComponent,
    PdfPasswordPromptComponent,
    ButtonDirective,
    IconComponent,
  ],
  templateUrl: './rotate-pdf.component.html',
})
export class RotatePdfComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly organizer = inject(PdfOrganizerService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('rotate-pdf');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly items = signal<readonly RotatePageItem[]>([]);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly busy = signal(false);
  protected readonly reading = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  private nextId = 0;

  protected readonly pageCount = computed(() => this.items().length);

  protected readonly turnedCount = computed(
    () => this.items().filter((item) => item.rotation % 360 !== 0).length,
  );

  /** Girar zero páginas e salvar só reescreveria o arquivo. */
  protected readonly nothingToDo = computed(
    () => this.items().length > 0 && this.turnedCount() === 0,
  );

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : '—';
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  private readonly settings = computed(() =>
    this.items()
      .map((item) => `${item.id}:${item.rotation}`)
      .join(','),
  );

  private readonly ranSettings = signal<string | null>(null);
  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  protected readonly canRun = computed(
    () => !!this.file() && !this.nothingToDo() && !this.busy() && !this.reading(),
  );

  constructor() {
    hydrateFromWorkspace('rotate-pdf', (file) =>
      void this.openFile(file, this.workspace.pdfPassword() ?? undefined),
    );
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'rotate-pdf');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  /** A senha do prompt vai para a sessão, para o resto da cadeia não repetir. */
  protected onUnlock(password: string): void {
    this.workspace.setPdfPassword(password);
    void this.openFile(this.pendingFile(), password);
  }

  private async openFile(file: File | null, password?: string): Promise<void> {
    if (!file) {
      this.clear();
      return;
    }

    if (this.reading() || this.busy()) return;

    this.errorKey.set(null);
    this.clearResult();
    this.passwordError.set(null);
    this.pendingFile.set(file);

    this.reading.set(true);
    this.progress.set(0);

    try {
      const doc = await openPdf(file, password);

      try {
        const total = doc.numPages;
        const pageItems: RotatePageItem[] = [];

        for (let i = 1; i <= total; i++) {
          const page = await doc.getPage(i);
          const { width } = page.getViewport({ scale: 1 });
          const canvas = await renderPageToCanvas(doc, i, THUMB_WIDTH / width);
          const blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
          releaseCanvas(canvas);

          pageItems.push({
            id: `page-${++this.nextId}`,
            url: this.urls.create(blob),
            label: `${this.i18n.t()['rotpdf.pages']} ${i}`,
            srcPageIndex: i - 1,
            rotation: 0,
          });

          this.progress.set(Math.round((i / total) * 100));
        }

        this.file.set(file);
        this.pdfPassword.set(password ?? null);
        this.pdfProtected.set(false);
        this.items.set(pageItems);
      } finally {
        await closePdf(doc);
      }
    } catch (err) {
      console.error('[RotatePdf] Error reading PDF:', err);
      const msgKey = toMessageKey(err);

      if (msgKey === 'error.pdf_encrypted') {
        this.pdfProtected.set(true);
        if (password) this.passwordError.set(this.i18n.t()['pdf.wrong_password']);
      } else {
        this.errorKey.set(msgKey);
        this.file.set(null);
        this.items.set([]);
      }
    } finally {
      this.reading.set(false);
      this.progress.set(null);
    }
  }

  /**
   * O controle principal: gira TODAS as páginas.
   *
   * Soma sobre a rotação que cada página já tem, em vez de atribuir — quem já
   * acertou uma página torta no meio do documento e depois gira tudo espera
   * que aquela página acompanhe o resto, não que volte para o zero.
   */
  protected rotateAll(degrees: number): void {
    this.items.update((items) =>
      items.map((item) => ({ ...item, rotation: (item.rotation + degrees + 360) % 360 })),
    );
    this.clearResult();
  }

  protected rotateAt(index: number): void {
    this.items.update((items) =>
      items.map((item, i) => (i === index ? { ...item, rotation: (item.rotation + 90) % 360 } : item)),
    );
    this.clearResult();
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file || !this.canRun()) return;

    this.busy.set(true);
    this.progress.set(0);
    this.errorKey.set(null);

    try {
      const settings = this.settings();
      const password = this.pdfPassword() ?? undefined;

      const sources = this.items().map((item) => ({
        file,
        pageIndex: item.srcPageIndex,
        rotation: item.rotation,
        password,
      }));

      const blob = await this.organizer.organize(sources, (done, total) =>
        this.progress.set(Math.round((done / total) * 100)),
      );

      this.resultBlob.set(blob);
      this.ranSettings.set(settings);
      this.pendingTransition.registerResult('rotate-pdf', blob, this.tool.suffix, 'pdf');
    } catch (err) {
      console.error('[RotatePdf] rotate failed:', err);
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
    this.clear();
    this.workspace.clear();
  }

  private clear(): void {
    this.urls.releaseAll();
    this.file.set(null);
    this.pendingFile.set(null);
    this.pdfProtected.set(false);
    this.pdfPassword.set(null);
    this.items.set([]);
    this.clearResult();
    this.errorKey.set(null);
  }

  private clearResult(): void {
    this.resultBlob.set(null);
    this.ranSettings.set(null);
    this.pendingTransition.clear();
  }
}
