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
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PageGridComponent, type PageItem } from '../../shared/ui/page-grid.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PdfPasswordPromptComponent } from '../../shared/ui/pdf-password-prompt.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { PdfOrganizerService } from './services/pdf-organizer.service';

/** Thumbnail width in CSS pixels */
const THUMB_WIDTH = 160;

interface OrganizePageItem extends PageItem {
  readonly srcFile: File;
  /** 0-based, into srcFile's own pages. */
  readonly srcPageIndex: number;
  readonly rotation: number;
}

@Component({
  selector: 'app-organize-pdf',
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
  ],
  templateUrl: './organize-pdf.component.html',
})
export class OrganizePdfComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly organizer = inject(PdfOrganizerService);
  protected readonly tool = toolById('organize-pdf');
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);

  constructor() {
    // A sessão é a fonte: um PDF que veio de img-to-pdf, de outra ferramenta de
    // PDF ou de um desfazer chega por aqui exatamente como o que a pessoa soltou
    // no dropzone. A senha vem junto — antes cada ferramenta guardava a sua, e
    // encadear três num arquivo protegido pedia a mesma senha três vezes.
    hydrateFromWorkspace('organize-pdf', (file) =>
      void this.openFile(file, this.workspace.pdfPassword() ?? undefined),
    );
  }

  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly items = signal<readonly OrganizePageItem[]>([]);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly busy = signal(false);
  protected readonly reading = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : null;
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : null;
  });

  private readonly settings = computed(() =>
    this.items()
      .map((item) => `${item.id}:${item.rotation}`)
      .join(','),
  );

  private readonly ranSettings = signal<string | null>(null);
  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  private nextId = 0;

  /**
   * O upload. Só entra na sessão — abrir o documento é do `openFile()`, que a
   * hidratação chama. Antes este método fazia as duas coisas, e por isso o
   * caminho "o arquivo já estava na sessão" simplesmente não existia no módulo
   * de PDF: cada ferramenta começava do zero, com um novo upload.
   */
  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'organize-pdf');
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

    if (this.reading() || this.busy()) return;

    this.errorKey.set(null);
    this.resultBlob.set(null);
    this.ranSettings.set(null);
    this.passwordError.set(null);
    this.pendingFile.set(file);

    this.reading.set(true);
    this.progress.set(0);

    try {
      const doc = await openPdf(file, password);
      try {
        const total = doc.numPages;
        const pageItems: OrganizePageItem[] = [];

        for (let i = 1; i <= total; i++) {
          const page = await doc.getPage(i);
          const { width } = page.getViewport({ scale: 1 });
          const canvas = await renderPageToCanvas(doc, i, THUMB_WIDTH / width);
          const blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
          releaseCanvas(canvas);

          pageItems.push({
            id: `page-${++this.nextId}`,
            url: this.urls.create(blob),
            label: `${file.name} · ${this.i18n.t()['cpdf.pages']} ${i}`,
            srcFile: file,
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
      console.error('[OrganizePdf] Error reading PDF:', err);
      const msgKey = toMessageKey(err);
      if (msgKey === 'error.pdf_encrypted') {
        this.pdfProtected.set(true);
        if (password) {
          this.passwordError.set(this.i18n.t()['pdf.wrong_password']);
        }
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

  protected reorder(move: { from: number; to: number }): void {
    const next = [...this.items()];
    const [moved] = next.splice(move.from, 1);
    if (moved) {
      next.splice(move.to, 0, moved);
      this.items.set(next);
    }
  }

  protected removeAt(index: number): void {
    const next = [...this.items()];
    next.splice(index, 1);
    this.items.set(next);
  }

  protected rotateAt(index: number): void {
    const current = this.items();
    const target = current[index];
    if (!target) return;

    const next = [...current];
    next[index] = {
      ...target,
      rotation: (target.rotation + 90) % 360,
    };
    this.items.set(next);
  }

  protected async run(): Promise<void> {
    const f = this.file();
    if (!f || !this.items().length || this.busy() || this.reading()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const sources = this.items().map((item) => ({
        file: item.srcFile,
        pageIndex: item.srcPageIndex,
        rotation: item.rotation,
        password: this.pdfPassword() ?? undefined,
      }));

      const blob = await this.organizer.organize(sources, (done, total) => {
        this.progress.set(Math.round((done / total) * 100));
      });

      this.resultBlob.set(blob);
      this.pendingTransition.registerResult('organize-pdf', blob, this.tool.suffix, 'pdf');
      this.ranSettings.set(this.settings());
    } catch (err) {
      console.error('[OrganizePdf] Build failed:', err);
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
    this.pendingTransition.clear();
    this.workspace.clear();
    this.urls.releaseAll();
    this.file.set(null);
    this.pendingFile.set(null);
    this.pdfProtected.set(false);
    this.pdfPassword.set(null);
    this.passwordError.set(null);
    this.items.set([]);
    this.resultBlob.set(null);
    this.ranSettings.set(null);
    this.errorKey.set(null);
  }
}
