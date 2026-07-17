import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
  computed,
} from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PdfLoaderService, type LoadedPdf, type PdfPageInfo } from './services/pdf-loader.service';
import { OcrService, type OcrBlock, type OcrLang } from './services/ocr.service';
import { PdfExporterService } from './services/pdf-exporter.service';

export type EditorTool = 'select' | 'add_text' | 'erase';

/** Represents one user edit on a page. */
export interface TextEdit {
  id: string;
  pageIndex: number;   // 1-based
  x: number; y: number; w: number; h: number; // all 0–1 relative to page
  originalText: string;
  newText: string;
  deleted: boolean;
}

type PdfStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'ocr'
  | 'exporting'
  | 'error';

@Component({
  selector: 'app-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, IconComponent],
  template: `
    <div class="flex h-[calc(100dvh-56px)] flex-col md:h-[calc(100dvh-0px)]">

      <!-- ── Upload state ──────────────────────────────────────────────── -->
      @if (status() === 'idle') {
        <div class="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
          <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--tone-orange-bg)]">
            <app-icon name="pdf" [size]="32" class="text-[color:var(--tone-orange-fg)]" />
          </div>
          <div class="text-center">
            <h1 class="text-2xl font-semibold text-text">{{ i18n.t()['pdf.title'] }}</h1>
            <p class="mt-1 text-sm text-muted">{{ i18n.t()['pdf.subtitle'] }}</p>
          </div>

          <div
            class="flex w-full max-w-lg cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-line-strong bg-surface px-8 py-12 transition-colors hover:border-accent hover:bg-accent-soft"
            (click)="fileInput.click()"
            (dragover)="$event.preventDefault()"
            (drop)="onDrop($event)"
          >
            <app-icon name="upload" [size]="28" class="text-faint" />
            <p class="font-medium text-text">{{ i18n.t()['pdf.drag'] }}</p>
            <p class="text-xs text-faint">{{ i18n.t()['pdf.drag_hint'] }}</p>
            <button appButton variant="secondary" size="md" class="mt-2" (click)="$event.stopPropagation(); fileInput.click()">
              <app-icon name="upload" [size]="14" />
              {{ i18n.t()['pdf.upload_btn'] }}
            </button>
          </div>

          <input #fileInput type="file" accept="application/pdf,.pdf" class="hidden" (change)="onFileInput($event)" />
        </div>
      }

      <!-- ── Loading / OCR ─────────────────────────────────────────────── -->
      @if (status() === 'loading' || status() === 'ocr') {
        <div class="flex flex-1 flex-col items-center justify-center gap-4">
          <div class="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
          <p class="text-sm text-muted">
            {{ status() === 'ocr'
              ? i18n.t()['pdf.ocr_running'] + ' ' + currentOcrPage() + '…'
              : i18n.t()['pdf.detecting'] }}
          </p>
          @if (ocrProgress() >= 0) {
            <div class="h-1.5 w-48 overflow-hidden rounded-full bg-raised">
              <div
                class="h-full rounded-full bg-accent transition-all"
                [style.width.%]="ocrProgress()"
              ></div>
            </div>
          }
        </div>
      }

      <!-- ── Error ─────────────────────────────────────────────────────── -->
      @if (status() === 'error') {
        <div class="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <app-icon name="alert" [size]="32" class="text-danger" />
          <p class="text-center text-sm text-muted">{{ errorMessage() }}</p>
          <button appButton variant="secondary" size="md" (click)="reset()">
            {{ i18n.t()['common.reset'] }}
          </button>
        </div>
      }

      <!-- ── Editor ────────────────────────────────────────────────────── -->
      @if (status() === 'ready' || status() === 'exporting') {
        <div class="flex flex-1 overflow-hidden">

          <!-- Thumbnails sidebar -->
          <aside class="hidden w-28 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-surface p-2 md:flex">
            <p class="px-1 pb-1 text-2xs font-medium uppercase text-faint">{{ i18n.t()['pdf.pages'] }}</p>
            @for (page of loadedPdf()!.pages; track page.index) {
              <button
                class="group relative overflow-hidden rounded-md border-2 transition-all"
                [class.border-accent]="currentPage() === page.index"
                [class.border-transparent]="currentPage() !== page.index"
                (click)="goToPage(page.index)"
              >
                <canvas
                  [attr.data-thumb]="page.index"
                  class="w-full bg-stage"
                  [attr.width]="page.width"
                  [attr.height]="page.height"
                ></canvas>
                <span class="absolute bottom-0 left-0 right-0 bg-black/40 py-0.5 text-center text-2xs text-white">
                  {{ page.index }}
                </span>
              </button>
            }
          </aside>

          <!-- Main canvas + overlay -->
          <main class="relative flex flex-1 flex-col overflow-hidden bg-stage">
            <!-- Toolbar -->
            <div class="flex items-center gap-2 border-b border-stage-line bg-stage px-4 py-2">
              <div class="flex items-center gap-1 rounded-lg border border-stage-line p-0.5">
                @for (tool of editorTools; track tool.id) {
                  <button
                    class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                    [class.bg-surface]="activeTool() === tool.id"
                    [class.text-text]="activeTool() === tool.id"
                    [class.text-white/60]="activeTool() !== tool.id"
                    [class.hover:bg-surface/20]="activeTool() !== tool.id"
                    (click)="activeTool.set(tool.id)"
                  >
                    <app-icon [name]="tool.icon" [size]="13" />
                    {{ i18n.t()[tool.labelKey] }}
                  </button>
                }
              </div>

              <div class="flex items-center gap-1 rounded-lg border border-stage-line p-0.5 text-white/60">
                <button class="rounded-md p-1.5 hover:bg-surface/20 hover:text-white" (click)="zoom(-0.1)">
                  <app-icon name="compress" [size]="14" />
                </button>
                <span class="w-10 text-center text-xs">{{ (scale() * 100) | number:'1.0-0' }}%</span>
                <button class="rounded-md p-1.5 hover:bg-surface/20 hover:text-white" (click)="zoom(0.1)">
                  <app-icon name="resize" [size]="14" />
                </button>
              </div>

              <span class="ml-1 text-xs text-white/40">
                {{ currentPage() }} {{ i18n.t()['pdf.page_of'] }} {{ loadedPdf()!.pageCount }}
              </span>

              <div class="ml-auto flex items-center gap-2">
                <button appButton variant="ghost" size="sm" class="text-white/70 hover:text-white" (click)="reset()">
                  {{ i18n.t()['common.reset'] }}
                </button>
                <button
                  appButton variant="primary" size="sm"
                  [disabled]="status() === 'exporting'"
                  [busy]="status() === 'exporting'"
                  (click)="exportPdf()"
                >
                  <app-icon name="download" [size]="14" />
                  {{ status() === 'exporting' ? i18n.t()['pdf.exporting'] : i18n.t()['pdf.export_btn'] }}
                </button>
              </div>
            </div>

            <!-- Page viewer -->
            <div
              class="relative flex flex-1 flex-col items-center overflow-auto p-6"
              (click)="onCanvasAreaClick($event)"
            >
              <div
                class="relative shadow-pop"
                [style.transform]="'scale(' + scale() + ')'"
                [style.transform-origin]="'top center'"
                [style.width.px]="currentPageInfo()?.width"
                [style.height.px]="currentPageInfo()?.height"
              >
                <!-- PDF page rendered here -->
                <canvas #pageCanvas class="block"></canvas>

                <!-- OCR / edit overlay -->
                <div class="absolute inset-0 overflow-hidden">
                  @for (block of currentPageBlocks(); track block.id) {
                    <div
                      class="absolute cursor-text rounded border border-transparent px-0.5 hover:border-accent/40 hover:bg-accent-soft/30"
                      [style.left.%]="block.x * 100"
                      [style.top.%]="block.y * 100"
                      [style.width.%]="block.w * 100"
                      [style.height.%]="block.h * 100"
                      [class.line-through]="block.deleted"
                      [class.opacity-40]="block.deleted"
                      [class.border-accent]="selectedBlock() === block.id"
                      [class.bg-accent-soft]="selectedBlock() === block.id"
                      [attr.contenteditable]="activeTool() === 'select' ? 'true' : 'false'"
                      [attr.data-block-id]="block.id"
                      (click)="$event.stopPropagation(); selectBlock(block.id)"
                      (blur)="onBlockBlur($event, block.id)"
                    >{{ block.newText || block.originalText }}</div>
                  }

                  <!-- New text input area (add_text mode) -->
                  @if (addingText() && activeTool() === 'add_text') {
                    <textarea
                      #newTextArea
                      class="absolute resize-none rounded border border-accent bg-white/90 px-1 py-0.5 text-sm text-black outline-none"
                      [style.left.px]="addTextPos().x"
                      [style.top.px]="addTextPos().y"
                      [style.min-width.px]="120"
                      rows="2"
                      placeholder="Type here…"
                      (blur)="commitAddText($event)"
                      (keydown.escape)="addingText.set(false)"
                    ></textarea>
                  }
                </div>
              </div>
            </div>

            <!-- Page navigation (mobile) -->
            <div class="flex items-center justify-center gap-3 border-t border-stage-line bg-stage px-4 py-2 md:hidden">
              <button appButton variant="ghost" size="sm" class="text-white/60" [disabled]="currentPage() <= 1" (click)="goToPage(currentPage() - 1)">
                ← Ant
              </button>
              <span class="text-xs text-white/60">{{ currentPage() }} / {{ loadedPdf()!.pageCount }}</span>
              <button appButton variant="ghost" size="sm" class="text-white/60" [disabled]="currentPage() >= loadedPdf()!.pageCount" (click)="goToPage(currentPage() + 1)">
                Próx →
              </button>
            </div>
          </main>

          <!-- Right panel — block inspector -->
          @if (selectedBlock()) {
            <aside class="hidden w-56 shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-surface p-4 md:flex">
              <h3 class="text-sm font-semibold text-text">Bloco selecionado</h3>
              <button appButton variant="danger" size="sm" block (click)="deleteBlock(selectedBlock()!)">
                <app-icon name="close" [size]="13" />
                {{ i18n.t()['pdf.tool.erase'] }}
              </button>
              <button appButton variant="ghost" size="sm" block (click)="selectedBlock.set(null)">
                Desselecionar
              </button>
            </aside>
          }

        </div>
      }
    </div>
  `,
})
export class PdfComponent implements OnDestroy {
  @ViewChild('pageCanvas') pageCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  protected readonly i18n = inject(TranslationService);
  private readonly loader = inject(PdfLoaderService);
  private readonly ocr = inject(OcrService);
  private readonly exporter = inject(PdfExporterService);

  protected readonly status = signal<PdfStatus>('idle');
  protected readonly errorMessage = signal('');
  protected readonly loadedPdf = signal<LoadedPdf | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly scale = signal(1.0);
  protected readonly activeTool = signal<EditorTool>('select');
  protected readonly selectedBlock = signal<string | null>(null);
  protected readonly currentOcrPage = signal(0);
  protected readonly addingText = signal(false);
  protected readonly addTextPos = signal({ x: 0, y: 0 });

  protected readonly ocrProgress = this.ocr.progress;

  /** All edits keyed by blockId */
  private readonly edits = signal<Map<string, TextEdit>>(new Map());

  /** OCR blocks per page (1-based index) */
  private readonly ocrBlocks = signal<Map<number, OcrBlock[]>>(new Map());

  protected readonly currentPageInfo = computed<PdfPageInfo | undefined>(() =>
    this.loadedPdf()?.pages.find((p) => p.index === this.currentPage()),
  );

  protected readonly currentPageBlocks = computed<(TextEdit & { id: string })[]>(() => {
    const page = this.currentPage();
    const allEdits = this.edits();
    return [...allEdits.values()]
      .filter((e) => e.pageIndex === page)
      .map((e) => ({ ...e }));
  });

  protected readonly editorTools = [
    { id: 'select' as EditorTool,   icon: 'image' as const,    labelKey: 'pdf.tool.select' as const },
    { id: 'add_text' as EditorTool, icon: 'convert' as const,  labelKey: 'pdf.tool.add_text' as const },
    { id: 'erase' as EditorTool,    icon: 'close' as const,    labelKey: 'pdf.tool.erase' as const },
  ];

  // ── File handling ──────────────────────────────────────────────────────────

  protected onFileInput(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void this.loadFile(file);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.loadFile(file);
  }

  private async loadFile(file: File): Promise<void> {
    this.status.set('loading');
    this.edits.set(new Map());
    this.ocrBlocks.set(new Map());

    try {
      const pdf = await this.loader.load(file);
      this.loadedPdf.set(pdf);
      this.currentPage.set(1);

      // Seed edits from digital pages' native text.
      const newEdits = new Map<string, TextEdit>();
      for (const page of pdf.pages) {
        if (page.type === 'digital' && page.nativeText) {
          // We add one big block covering the full page for simplicity.
          // A proper implementation would use exact glyph positions from PDF.js.
          const id = `p${page.index}-native`;
          newEdits.set(id, {
            id, pageIndex: page.index,
            x: 0.05, y: 0.05, w: 0.9, h: 0.05,
            originalText: page.nativeText.substring(0, 80),
            newText: '', deleted: false,
          });
        }
      }
      this.edits.set(newEdits);

      this.status.set('ready');
      await this.renderCurrentPage();

      // Auto-OCR scanned pages in the background.
      if (pdf.overallType !== 'digital') {
        await this.runOcrOnScannedPages(pdf);
      }
    } catch (err: unknown) {
      const key = err instanceof Error ? err.message : 'generic';
      const msgKey = `error.${key}` as keyof ReturnType<typeof this.i18n.t>;
      this.errorMessage.set(this.i18n.t()[msgKey] ?? this.i18n.t()['error.generic']);
      this.status.set('error');
    }
  }

  private async runOcrOnScannedPages(pdf: LoadedPdf): Promise<void> {
    const scannedPages = pdf.pages.filter((p) => p.type === 'scanned');
    if (scannedPages.length === 0) return;

    this.status.set('ocr');
    const allOcr = new Map(this.ocrBlocks());

    for (const page of scannedPages) {
      this.currentOcrPage.set(page.index);
      const canvas = await this.loader.renderPageToCanvas(pdf.doc, page.index, 2);
      const result = await this.ocr.recognise(canvas, 'por+eng');

      allOcr.set(page.index, result.blocks);

      // Add OCR blocks as editable overlays.
      const newEdits = new Map(this.edits());
      for (let i = 0; i < result.blocks.length; i++) {
        const b = result.blocks[i];
        const id = `p${page.index}-ocr-${i}`;
        if (!newEdits.has(id)) {
          newEdits.set(id, {
            id, pageIndex: page.index,
            x: b.x, y: b.y, w: b.w, h: b.h,
            originalText: b.text, newText: '', deleted: false,
          });
        }
      }
      this.edits.set(newEdits);
    }

    this.ocrBlocks.set(allOcr);
    this.status.set('ready');
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  protected async goToPage(index: number): Promise<void> {
    const pdf = this.loadedPdf();
    if (!pdf || index < 1 || index > pdf.pageCount) return;
    this.currentPage.set(index);
    this.selectedBlock.set(null);
    await this.renderCurrentPage();
  }

  private async renderCurrentPage(): Promise<void> {
    const pdf = this.loadedPdf();
    if (!pdf || !this.pageCanvasRef) return;

    const canvas = await this.loader.renderPageToCanvas(pdf.doc, this.currentPage(), this.scale() * 1.5);
    const target = this.pageCanvasRef.nativeElement;
    target.width = canvas.width;
    target.height = canvas.height;
    target.getContext('2d')!.drawImage(canvas, 0, 0);
  }

  protected zoom(delta: number): void {
    const next = Math.min(3, Math.max(0.3, this.scale() + delta));
    this.scale.set(Math.round(next * 10) / 10);
    void this.renderCurrentPage();
  }

  // ── Editing ────────────────────────────────────────────────────────────────

  protected onCanvasAreaClick(event: MouseEvent): void {
    if (this.activeTool() !== 'add_text') return;

    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-block-id')) return; // clicked on existing block

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.addTextPos.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    this.addingText.set(true);
  }

  protected commitAddText(event: FocusEvent): void {
    const textarea = event.target as HTMLTextAreaElement;
    const text = textarea.value.trim();
    this.addingText.set(false);

    if (!text) return;

    const pageInfo = this.currentPageInfo();
    if (!pageInfo) return;

    // Convert pixel position to relative coordinates.
    const containerW = pageInfo.width * this.scale();
    const containerH = pageInfo.height * this.scale();
    const id = `p${this.currentPage()}-add-${Date.now()}`;

    const newEdits = new Map(this.edits());
    newEdits.set(id, {
      id, pageIndex: this.currentPage(),
      x: this.addTextPos().x / containerW,
      y: this.addTextPos().y / containerH,
      w: 0.3, h: 0.04,
      originalText: '', newText: text, deleted: false,
    });
    this.edits.set(newEdits);
  }

  protected selectBlock(id: string): void {
    if (this.activeTool() === 'erase') {
      this.deleteBlock(id);
      return;
    }
    this.selectedBlock.set(id);
  }

  protected onBlockBlur(event: FocusEvent, id: string): void {
    const el = event.target as HTMLElement;
    const newText = el.innerText.trim();
    const newEdits = new Map(this.edits());
    const block = newEdits.get(id);
    if (block) {
      newEdits.set(id, { ...block, newText });
      this.edits.set(newEdits);
    }
  }

  protected deleteBlock(id: string): void {
    const newEdits = new Map(this.edits());
    const block = newEdits.get(id);
    if (block) {
      newEdits.set(id, { ...block, deleted: true });
      this.edits.set(newEdits);
    }
    this.selectedBlock.set(null);
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  protected async exportPdf(): Promise<void> {
    const pdf = this.loadedPdf();
    if (!pdf) return;

    this.status.set('exporting');

    try {
      // Group edits by page.
      const editsByPage = new Map<number, TextEdit[]>();
      for (const edit of this.edits().values()) {
        const list = editsByPage.get(edit.pageIndex) ?? [];
        list.push(edit);
        editsByPage.set(edit.pageIndex, list);
      }

      // Group OCR blocks for invisible text layer.
      const ocrByPage = new Map<number, { text: string; x: number; y: number; w: number; h: number }[]>();
      for (const [pageIdx, blocks] of this.ocrBlocks().entries()) {
        ocrByPage.set(pageIdx, blocks.map((b) => ({ text: b.text, x: b.x, y: b.y, w: b.w, h: b.h })));
      }

      const blob = await this.exporter.export(pdf.doc, editsByPage, ocrByPage);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nadasai-edited.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      this.errorMessage.set(this.i18n.t()['error.pdf_export_failed']);
      this.status.set('error');
      return;
    }

    this.status.set('ready');
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  protected reset(): void {
    this.status.set('idle');
    this.loadedPdf.set(null);
    this.edits.set(new Map());
    this.ocrBlocks.set(new Map());
    this.selectedBlock.set(null);
  }

  ngOnDestroy(): void {
    void this.ocr.terminate();
  }
}
