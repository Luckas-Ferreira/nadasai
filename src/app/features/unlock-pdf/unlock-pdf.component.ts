import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { closePdf, openPdf } from '../../core/pdf/pdfjs';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PdfPasswordPromptComponent } from '../../shared/ui/pdf-password-prompt.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { PdfUnlockerService } from './services/pdf-unlocker.service';

@Component({
  selector: 'app-unlock-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    PdfPasswordPromptComponent,
  ],
  templateUrl: './unlock-pdf.component.html',
})
export class UnlockPdfComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly unlocker = inject(PdfUnlockerService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('unlock-pdf');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly pageCount = signal(0);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly busy = signal(false);
  protected readonly reading = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  /**
   * Abriu sem senha, e isso NÃO quer dizer que não haja o que remover.
   *
   * A maioria dos PDFs "protegidos" que as pessoas trazem tem só senha de
   * DONO: abrem em qualquer leitor e recusam imprimir, copiar ou editar. A
   * restrição está no arquivo do mesmo jeito, e é exatamente o que sai daqui —
   * então a tela explica isso em vez de dar a entender que não há nada a fazer.
   */
  protected readonly openedWithoutPassword = computed(
    () => !!this.file() && this.pdfPassword() === null,
  );

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : '—';
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  protected readonly stale = computed(() => !this.resultBlob());

  protected readonly canRun = computed(
    () => !!this.file() && !this.busy() && !this.reading(),
  );

  constructor() {
    hydrateFromWorkspace('unlock-pdf', (file) =>
      void this.openFile(file, this.workspace.pdfPassword() ?? undefined),
    );
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'unlock-pdf');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected onUnlock(password: string): void {
    this.workspace.setPdfPassword(password);
    void this.openFile(this.pendingFile(), password);
  }

  /**
   * Abre só para CONTAR as páginas e descobrir se pede senha.
   *
   * Nada é rasterizado aqui: a leitura pesada é do `run()`. Abrir e fechar um
   * documento custa quase nada e é o que permite mostrar o estado da proteção
   * antes de a pessoa mandar processar.
   */
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
    } catch (err) {
      console.error('[UnlockPdf] Error reading PDF:', err);
      const msgKey = toMessageKey(err);

      if (msgKey === 'error.pdf_encrypted') {
        this.pdfProtected.set(true);
        if (password) this.passwordError.set(this.i18n.t()['pdf.wrong_password']);
      } else {
        this.errorKey.set(msgKey);
        this.file.set(null);
        this.pageCount.set(0);
      }
    } finally {
      this.reading.set(false);
    }
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file || !this.canRun()) return;

    this.busy.set(true);
    this.progress.set(0);
    this.errorKey.set(null);

    try {
      const blob = await this.unlocker.unlock(
        file,
        this.pdfPassword() ?? undefined,
        (done, total) => this.progress.set(Math.round((done / total) * 100)),
      );

      this.resultBlob.set(blob);
      this.pendingTransition.registerResult('unlock-pdf', blob, this.tool.suffix, 'pdf');
    } catch (err) {
      console.error('[UnlockPdf] unlock failed:', err);
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
    this.pageCount.set(0);
    this.clearResult();
    this.errorKey.set(null);
  }

  private clearResult(): void {
    this.resultBlob.set(null);
    this.pendingTransition.clear();
  }
}
