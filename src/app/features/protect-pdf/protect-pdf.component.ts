import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
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
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { PdfProtectorService } from './services/pdf-protector.service';

const THUMB_WIDTH = 480;

@Component({
  selector: 'app-protect-pdf',
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
    ActionBarComponent,
    ButtonDirective,
    PdfPasswordPromptComponent,
  ],
  templateUrl: './protect-pdf.component.html',
})
export class ProtectPdfComponent {
  private readonly protector = inject(PdfProtectorService);
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('protect-pdf');
  protected readonly i18n = inject(TranslationService);

  // File & document state
  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly pageCount = signal(0);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly renderingPreview = signal(false);

  // Password state
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly showPassword = signal(false);

  // Task & Execution state
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : null;
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : null;
  });

  protected readonly stale = computed(() => !this.resultBlob());

  protected readonly passwordStrength = computed(() => {
    const pwd = this.password();
    if (!pwd) return null;
    if (pwd.length < 6) return { label: 'Fraca', color: 'text-red-500', bar: 'w-1/3 bg-red-500' };
    if (pwd.length < 10 || !/[0-9]/.test(pwd) || !/[A-Z]/.test(pwd)) {
      return { label: 'Média', color: 'text-amber-500', bar: 'w-2/3 bg-amber-500' };
    }
    return { label: 'Forte', color: 'text-emerald-500', bar: 'w-full bg-emerald-500' };
  });

  protected async onFile(file: File, password?: string): Promise<void> {
    this.errorKey.set(null);
    this.resultBlob.set(null);
    this.password.set('');
    this.confirmPassword.set('');
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
      } finally {
        await closePdf(doc);
      }

      void this.loadPreview(file, password);
    } catch (err) {
      console.error('[ProtectPdf] Error loading PDF:', err);
      const msgKey = toMessageKey(err);
      if (msgKey === 'error.pdf_encrypted') {
        this.pdfProtected.set(true);
        if (password) {
          this.passwordError.set('Senha incorreta. Tente novamente.');
        }
      } else {
        this.errorKey.set(msgKey);
        this.file.set(null);
      }
    }
  }

  private async loadPreview(file: File, password?: string): Promise<void> {
    this.renderingPreview.set(true);
    try {
      const doc = await openPdf(file, password);
      try {
        const page = await doc.getPage(1);
        const { width } = page.getViewport({ scale: 1 });
        const canvas = await renderPageToCanvas(doc, 1, THUMB_WIDTH / width);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8),
        );
        releaseCanvas(canvas);

        if (blob) {
          this.previewUrl.set(this.urls.create(blob));
        }
      } finally {
        await closePdf(doc);
      }
    } catch (err) {
      console.error('[ProtectPdf] Error rendering preview:', err);
    } finally {
      this.renderingPreview.set(false);
    }
  }

  protected async run(): Promise<void> {
    const f = this.file();
    if (!f || this.busy()) return;

    const pwd = this.password().trim();
    const confirm = this.confirmPassword().trim();

    if (!pwd || pwd !== confirm) {
      return;
    }

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const blob = await this.protector.protect({
        file: f,
        password: pwd,
        onProgress: (p: number) => this.progress.set(p),
      });

      this.resultBlob.set(blob);
    } catch (err: any) {
      console.error('[ProtectPdf] Encrypt failed:', err);
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
    this.urls.releaseAll();
    this.file.set(null);
    this.pendingFile.set(null);
    this.pdfProtected.set(false);
    this.pdfPassword.set(null);
    this.passwordError.set(null);
    this.pageCount.set(0);
    this.previewUrl.set(null);
    this.resultBlob.set(null);
    this.errorKey.set(null);
    this.password.set('');
    this.confirmPassword.set('');
  }
}
