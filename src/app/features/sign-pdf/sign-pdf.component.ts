import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
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
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { PdfSignerService, type PlacedSignature } from './services/pdf-signer.service';

const THUMB_WIDTH = 480;

export type SignTab = 'draw' | 'upload' | 'type';

@Component({
  selector: 'app-sign-pdf',
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
  templateUrl: './sign-pdf.component.html',
})
export class SignPdfComponent {
  private readonly signer = inject(PdfSignerService);
  private readonly urls = inject(ObjectUrlScope);
  protected readonly tool = toolById('sign-pdf');
  protected readonly i18n = inject(TranslationService);

  @ViewChild('signatureCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  // File & document state
  protected readonly file = signal<File | null>(null);
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);

  protected readonly pageCount = signal(0);
  protected readonly selectedPageIndex = signal(1);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly renderingPreview = signal(false);

  // Signature Creation state
  protected readonly activeTab = signal<SignTab>('draw');
  protected readonly penColor = signal('#000000');
  protected readonly signatureDataUrl = signal<string | null>(null);
  protected readonly typedName = signal('');

  // Placed Signatures Collection
  protected readonly placedSignatures = signal<PlacedSignature[]>([]);
  protected readonly activeSignatureId = signal<string | null>(null);

  // Position & Size on PDF page for currently active signature
  protected readonly xPercent = signal(35);
  protected readonly yPercent = signal(70);
  protected readonly widthPercent = signal(30);

  // Task & Execution state
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected isDrawing = false;
  private sigCounter = 0;

  protected readonly tabOptions = computed<SegmentOption<SignTab>[]>(() => [
    { value: 'draw', label: 'Desenhar' },
    { value: 'upload', label: 'Carregar' },
    { value: 'type', label: 'Digitar' },
  ]);

  protected readonly originalSize = computed(() => {
    const f = this.file();
    return f ? formatBytes(f.size) : null;
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : null;
  });

  protected readonly currentPageSignatures = computed(() =>
    this.placedSignatures().filter((s) => s.pageIndex === this.selectedPageIndex()),
  );

  protected readonly activeSignature = computed(() =>
    this.placedSignatures().find((s) => s.id === this.activeSignatureId()) ?? null,
  );

  protected readonly stale = computed(() => !this.resultBlob());

  protected async onFile(file: File, password?: string): Promise<void> {
    this.errorKey.set(null);
    this.resultBlob.set(null);
    this.passwordError.set(null);
    this.pendingFile.set(file);
    this.placedSignatures.set([]);
    this.activeSignatureId.set(null);

    try {
      const doc = await openPdf(file, password);
      try {
        const count = doc.numPages;
        this.pageCount.set(count);
        this.selectedPageIndex.set(count); // Default to last page for signature
        this.file.set(file);
        this.pdfPassword.set(password ?? null);
        this.pdfProtected.set(false);
      } finally {
        await closePdf(doc);
      }

      void this.loadPreview(file, this.selectedPageIndex(), password);
    } catch (err) {
      console.error('[SignPdf] Error loading PDF:', err);
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

  protected async changePage(index: number): Promise<void> {
    const total = this.pageCount();
    const target = Math.max(1, Math.min(total, index));
    this.selectedPageIndex.set(target);

    const f = this.file();
    if (f) {
      void this.loadPreview(f, target, this.pdfPassword() ?? undefined);
    }
  }

  private async loadPreview(file: File, pageNum: number, password?: string): Promise<void> {
    this.renderingPreview.set(true);
    try {
      const doc = await openPdf(file, password);
      try {
        const page = await doc.getPage(pageNum);
        const { width } = page.getViewport({ scale: 1 });
        const canvas = await renderPageToCanvas(doc, pageNum, THUMB_WIDTH / width);
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
      console.error('[SignPdf] Error rendering preview:', err);
    } finally {
      this.renderingPreview.set(false);
    }
  }

  // Signature Creation Handlers
  protected startDrawing(event: MouseEvent | TouchEvent): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.isDrawing = true;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  }

  protected draw(event: MouseEvent | TouchEvent): void {
    if (!this.isDrawing) return;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    ctx.strokeStyle = this.penColor();
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  }

  protected stopDrawing(): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.saveCanvasSignature();
  }

  protected clearCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.signatureDataUrl.set(null);
  }

  private saveCanvasSignature(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.signatureDataUrl.set(canvas.toDataURL('image/png'));
  }

  protected onUploadSignature(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.signatureDataUrl.set(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  protected updateTypedName(name: string): void {
    this.typedName.set(name);
    if (!name.trim()) {
      this.signatureDataUrl.set(null);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.font = 'italic bold 36px Georgia, serif';
    ctx.fillStyle = this.penColor();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 200, 60);

    this.signatureDataUrl.set(canvas.toDataURL('image/png'));
  }

  // Multi-signature collection methods
  protected addSignatureToDocument(): void {
    const dataUrl = this.signatureDataUrl();
    if (!dataUrl) return;

    this.sigCounter++;
    const newSig: PlacedSignature = {
      id: `sig-${Date.now()}-${this.sigCounter}`,
      signaturePngDataUrl: dataUrl,
      pageIndex: this.selectedPageIndex(),
      xPercent: this.xPercent(),
      yPercent: this.yPercent(),
      widthPercent: this.widthPercent(),
      label: `Assinatura #${this.sigCounter} (Pág. ${this.selectedPageIndex()})`,
    };

    this.placedSignatures.set([...this.placedSignatures(), newSig]);
    this.activeSignatureId.set(newSig.id);
  }

  protected applySignatureToAllPages(): void {
    const dataUrl = this.signatureDataUrl();
    if (!dataUrl) return;

    const total = this.pageCount();
    const newItems: PlacedSignature[] = [];

    for (let p = 1; p <= total; p++) {
      this.sigCounter++;
      newItems.push({
        id: `sig-all-${Date.now()}-${p}`,
        signaturePngDataUrl: dataUrl,
        pageIndex: p,
        xPercent: this.xPercent(),
        yPercent: this.yPercent(),
        widthPercent: this.widthPercent(),
        label: `Rubrica (Pág. ${p})`,
      });
    }

    this.placedSignatures.set([...this.placedSignatures(), ...newItems]);
    if (newItems.length > 0) {
      this.activeSignatureId.set(newItems[0].id);
    }
  }

  protected selectSignature(sig: PlacedSignature): void {
    this.activeSignatureId.set(sig.id);
    this.xPercent.set(sig.xPercent);
    this.yPercent.set(sig.yPercent);
    this.widthPercent.set(sig.widthPercent);

    if (sig.pageIndex !== this.selectedPageIndex()) {
      void this.changePage(sig.pageIndex);
    }
  }

  protected removeSignature(id: string): void {
    const next = this.placedSignatures().filter((s) => s.id !== id);
    this.placedSignatures.set(next);
    if (this.activeSignatureId() === id) {
      this.activeSignatureId.set(next.length ? next[next.length - 1].id : null);
    }
  }

  protected updateActiveX(val: number): void {
    this.xPercent.set(val);
    const activeId = this.activeSignatureId();
    if (!activeId) return;

    this.placedSignatures.set(
      this.placedSignatures().map((s) => (s.id === activeId ? { ...s, xPercent: val } : s)),
    );
  }

  protected updateActiveY(val: number): void {
    this.yPercent.set(val);
    const activeId = this.activeSignatureId();
    if (!activeId) return;

    this.placedSignatures.set(
      this.placedSignatures().map((s) => (s.id === activeId ? { ...s, yPercent: val } : s)),
    );
  }

  protected updateActiveWidth(val: number): void {
    this.widthPercent.set(val);
    const activeId = this.activeSignatureId();
    if (!activeId) return;

    this.placedSignatures.set(
      this.placedSignatures().map((s) => (s.id === activeId ? { ...s, widthPercent: val } : s)),
    );
  }

  protected async run(): Promise<void> {
    const f = this.file();
    const sigs = this.placedSignatures();

    if (sigs.length === 0 && this.signatureDataUrl()) {
      this.addSignatureToDocument();
    }

    const finalSigs = this.placedSignatures();
    if (!f || !finalSigs.length || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const blob = await this.signer.sign({
        file: f,
        password: this.pdfPassword() ?? undefined,
        signatures: finalSigs,
        onProgress: (p) => this.progress.set(p),
      });

      this.resultBlob.set(blob);
    } catch (err: any) {
      console.error('[SignPdf] Sign failed:', err);
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
    this.selectedPageIndex.set(1);
    this.previewUrl.set(null);
    this.resultBlob.set(null);
    this.errorKey.set(null);
    this.signatureDataUrl.set(null);
    this.placedSignatures.set([]);
    this.activeSignatureId.set(null);
    this.typedName.set('');
    this.clearCanvas();
  }
}
