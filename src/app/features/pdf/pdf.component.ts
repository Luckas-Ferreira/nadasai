import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  ViewChildren,
  QueryList,
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
import { InpaintingService } from './services/inpainting.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';

export type EditorTool = 'select' | 'add_text' | 'erase';

/** Represents one user edit on a page. */
export interface TextEdit {
  id: string;
  pageIndex: number;   // 1-based
  x: number; y: number; w: number; h: number; // all 0–1 relative to page
  lineHeight?: number; // 0-1 relative to page height
  originalText: string;
  newText: string | null;
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
  imports: [
    ButtonDirective,
    IconComponent,
    CommonModule,
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
  ],
  template: `
    <app-tool-page [toolId]="'edit-pdf'" [forceLoaded]="status() !== 'idle'">
      @if (status() === 'error' && errorMessage()) {
        <div banner class="mb-5">
          <app-alert [message]="errorMessage()" [actionLabel]="i18n.t()['common.reset']" (action)="reset()" />
        </div>
      }

      <div stage class="flex flex-col h-full w-full">
        @if (status() === 'idle') {
          <app-dropzone
            [accept]="'application/pdf,.pdf'"
            [titleKey]="'pdf.drag'"
            [hintKey]="'pdf.drag_hint'"
            [buttonKey]="'pdf.upload_btn'"
            (fileSelected)="onFileDropzone($event)"
          />
        } @else {
          <!-- Continuous scroll container -->
          <div class="flex-1 overflow-y-auto bg-stage p-6 flex flex-col items-center gap-6" (click)="onCanvasAreaClick($event)">
            @if (status() === 'loading' || status() === 'ocr') {
              <div class="flex flex-col items-center justify-center gap-4 py-12">
                <div class="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
                <p class="text-sm text-muted">
                  {{ status() === 'ocr'
                    ? i18n.t()['pdf.ocr_running'] + ' ' + currentOcrPage() + '…' + (ocrStatusText() ? ' (' + ocrStatusText() + ')' : '')
                    : i18n.t()['pdf.detecting'] }}
                </p>
                @if (ocrProgress() >= 0) {
                  <div class="h-1.5 w-48 overflow-hidden rounded-full bg-raised">
                    <div class="h-full rounded-full bg-accent transition-all" [style.width.%]="ocrProgress()"></div>
                  </div>
                }
              </div>
            }

            @if (loadedPdf()) {
              @for (page of loadedPdf()!.pages; track page.index) {
                <div
                  class="relative shadow-pop shrink-0 bg-white transition-all duration-200"
                  [style.width.px]="page.width * scale()"
                  [style.height.px]="page.height * scale()"
                >
                  <canvas #pageCanvas [attr.data-page]="page.index" class="block h-full w-full"></canvas>

                  <!-- OCR / edit overlay -->
                  <div class="absolute inset-0 overflow-hidden">
                    @for (block of getBlocksForPage(page.index); track block.id) {
                      <div
                        class="absolute cursor-text overflow-hidden whitespace-nowrap rounded-sm px-0.5 outline-none border transition-colors font-semibold tracking-tight"
                        [style.left.%]="block.x * 100"
                        [style.top.%]="block.y * 100"
                        [style.minWidth.%]="block.w * 100"
                        [style.height.%]="block.h * 100"
                        [style.lineHeight.px]="block.h * page.height * scale()"
                        [style.fontSize.px]="(block.lineHeight || block.h) * page.height * scale() * 0.72"
                        [style.background]="selectedBlock() === block.id ? (inpaintBg().get(block.id) || 'rgb(255,255,255)') : (block.newText !== null ? 'rgb(255,255,255)' : 'transparent')"
                        [class.z-10]="selectedBlock() === block.id"
                        [class.text-text]="selectedBlock() === block.id || block.newText !== null"
                        [class.text-transparent]="selectedBlock() !== block.id && block.newText === null && !block.deleted"
                        [class.border-transparent]="selectedBlock() !== block.id"
                        [class.border-accent]="selectedBlock() === block.id"
                        [class.shadow-sm]="selectedBlock() === block.id"
                        [class.line-through]="block.deleted"
                        [class.text-danger]="block.deleted"
                        [class.opacity-50]="block.deleted"
                        [attr.contenteditable]="activeTool() === 'select' ? 'true' : 'false'"
                        [attr.data-block-id]="block.id"
                        (click)="$event.stopPropagation(); selectBlock(block.id, $event)"
                        (blur)="onBlockBlur($event, block.id)"
                      >{{ block.newText !== null ? block.newText : block.originalText }}</div>
                    }

                    <!-- New text input area -->
                    @if (addingText() && activeTool() === 'add_text' && addingTextPage() === page.index) {
                      <textarea
                        #newTextArea
                        class="absolute resize-none rounded border border-accent bg-white/90 px-1 py-0.5 text-sm text-black outline-none"
                        [style.left.px]="addTextPos().x * scale()"
                        [style.top.px]="addTextPos().y * scale()"
                        [style.min-width.px]="120 * scale()"
                        rows="2"
                        placeholder="Type here…"
                        (blur)="commitAddText($event)"
                        (keydown.escape)="addingText.set(false)"
                      ></textarea>
                    }
                  </div>
                </div>
              }
            }
          </div>
        }
      </div>

      <div panel class="flex flex-col gap-4">
        @if (status() !== 'idle') {
          <app-panel heading="Editar PDF">
            <!-- Tools -->
            <div class="flex flex-col gap-2">
              @for (tool of editorTools; track tool.id) {
                <button
                  [class]="'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all w-full text-left ' + (activeTool() === tool.id ? 'bg-surface text-text border border-line shadow-sm' : 'text-muted border border-transparent hover:text-text hover:bg-surface/50')"
                  (click)="activeTool.set(tool.id)"
                >
                  <app-icon [name]="tool.icon" [size]="16" />
                  {{ i18n.t()[tool.labelKey] }}
                </button>
              }
            </div>

            <!-- Block Selection Inspector -->
            @if (selectedBlock()) {
              <div class="mt-4 border-t border-line pt-3 flex flex-col gap-2">
                <span class="text-xs font-semibold text-text">Bloco selecionado</span>
                <button appButton variant="danger" size="sm" block (click)="deleteBlock(selectedBlock()!)">
                  <app-icon name="close" [size]="13" />
                  Apagar
                </button>
                <button appButton variant="ghost" size="sm" block (click)="selectedBlock.set(null)">
                  Desselecionar
                </button>
              </div>
            }

            <!-- Language select -->
            <div class="mt-4 border-t border-line pt-3">
              <label class="mb-2 block text-xs text-muted font-medium">Idioma do OCR</label>
              <select
                class="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm font-medium text-text outline-none"
                [(ngModel)]="ocrLangValue"
                (change)="runOcrAllPages()"
              >
                <option value="por+eng">Português + Inglês</option>
                <option value="por">Português</option>
                <option value="eng">Inglês</option>
                <option value="spa">Espanhol</option>
              </select>
            </div>

            <!-- Zoom -->
            <div class="mt-4 border-t border-line pt-3 flex flex-col gap-2">
              <label class="block text-xs text-muted font-medium">Zoom ({{ (scale() * 100) | number:'1.0-0' }}%)</label>
              <div class="flex items-center gap-2">
                <button appButton variant="ghost" size="sm" class="flex-1" (click)="zoom(-0.1)">&minus;</button>
                <button appButton variant="ghost" size="sm" class="flex-1" (click)="zoom(0.1)">+</button>
              </div>
            </div>
          </app-panel>

          <app-action-bar
            [busy]="status() === 'exporting'"
            [canDownload]="true"
            [primaryLabel]="status() === 'exporting' ? i18n.t()['pdf.exporting'] : i18n.t()['pdf.export_btn']"
            (primary)="exportPdf()"
            (reset)="reset()"
          />
        }
      </div>
    </app-tool-page>
  `,
})
export class PdfComponent implements OnDestroy {
  @ViewChildren('pageCanvas') pageCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  protected readonly i18n = inject(TranslationService);
  private readonly loader = inject(PdfLoaderService);
  private readonly ocr = inject(OcrService);
  private readonly exporter = inject(PdfExporterService);
  private readonly inpainting = inject(InpaintingService);

  protected readonly status = signal<PdfStatus>('idle');
  protected readonly errorMessage = signal('');
  protected readonly loadedPdf = signal<LoadedPdf | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly scale = signal(1.0);
  protected readonly activeTool = signal<EditorTool>('select');
  protected readonly selectedBlock = signal<string | null>(null);
  protected readonly currentOcrPage = signal(0);
  protected readonly addingText = signal(false);
  protected readonly addingTextPage = signal(1);
  protected readonly addTextPos = signal({ x: 0, y: 0 });
  /** True while OCR is running in background (editor stays visible) */
  protected readonly ocrRunning = signal(false);
  /** Maps blockId → CSS background color (from inpainting) */
  protected readonly inpaintBg = signal<Map<string, string>>(new Map());
  /** Selected OCR language — bound via ngModel to the toolbar select */
  protected ocrLangValue: string = 'por+eng';

  protected readonly ocrProgress = this.ocr.progress;
  protected readonly ocrStatusText = this.ocr.statusText;

  /** All edits keyed by blockId */
  private readonly edits = signal<Map<string, TextEdit>>(new Map());

  /** OCR blocks per page (1-based index) */
  private readonly ocrBlocks = signal<Map<number, OcrBlock[]>>(new Map());

  protected readonly currentPageInfo = computed<PdfPageInfo | undefined>(() =>
    this.loadedPdf()?.pages.find((p) => p.index === this.currentPage()),
  );

  protected getBlocksForPage(pageIndex: number): (TextEdit & { id: string })[] {
    const allEdits = this.edits();
    return [...allEdits.values()]
      .filter((e) => e.pageIndex === pageIndex)
      .map((e) => ({ ...e }));
  }

  protected readonly editorTools = [
    { id: 'select' as EditorTool, icon: 'image' as const, labelKey: 'pdf.tool.select' as const },
    { id: 'add_text' as EditorTool, icon: 'convert' as const, labelKey: 'pdf.tool.add_text' as const },
    { id: 'erase' as EditorTool, icon: 'close' as const, labelKey: 'pdf.tool.erase' as const },
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
        if (page.type === 'digital' && page.nativeBlocks.length > 0) {
          for (let i = 0; i < page.nativeBlocks.length; i++) {
            const b = page.nativeBlocks[i];
            const id = `p${page.index}-native-${i}`;
            newEdits.set(id, {
              id, pageIndex: page.index,
              x: b.x, y: b.y, w: b.w, h: b.h,
              originalText: b.text,
              newText: null, deleted: false,
            });
          }
        }
      }
      this.edits.set(newEdits);

      this.status.set('ready');

      // Wait one tick for Angular to mount the canvas DOM elements before rendering.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await this.renderAllPages();

      // Auto-OCR scanned pages on load, blocking the UI with the overlay
      if (pdf.overallType !== 'digital') {
        void this.runOcrAllPages();
      }
    } catch (err: unknown) {
      const key = err instanceof Error ? err.message : 'generic';
      const msgKey = `error.${key}` as keyof ReturnType<typeof this.i18n.t>;
      this.errorMessage.set(this.i18n.t()[msgKey] ?? this.i18n.t()['error.generic']);
      this.status.set('error');
    }
  }

  /** Runs OCR on ALL pages of the current PDF (triggered by user). */
  protected async runOcrAllPages(): Promise<void> {
    const pdf = this.loadedPdf();
    if (!pdf || this.ocrRunning()) return;
    await this.runOcrOnScannedPages(pdf, pdf.pages);
  }

  private async runOcrOnScannedPages(pdf: LoadedPdf, pages = pdf.pages.filter((p) => p.type === 'scanned')): Promise<void> {
    if (pages.length === 0) return;

    // Keep editor visible — just show progress overlay
    this.ocrRunning.set(true);
    this.ocr.progress.set(0);

    try {
      const allOcr = new Map(this.ocrBlocks());

      for (const page of pages) {
        this.currentOcrPage.set(page.index);

        // Use scale=1 so Tesseract bbox coordinates map 1:1 to the displayed page dimensions.
        const canvas = await this.loader.renderPageToCanvas(pdf.doc, page.index, 1);
        const result = await this.ocr.recognise(canvas, this.ocrLangValue as any);
        console.log(`[OCR] Page ${page.index}: ${result.blocks.length} blocks, text: "${result.fullText.slice(0, 100)}"`);

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
              lineHeight: b.lineHeight,
              originalText: b.text,
              newText: null, deleted: false,
            });
          }
        }
        this.edits.set(newEdits);
      }

      this.ocrBlocks.set(allOcr);
    } catch (err) {
      console.error('[OCR] runOcrOnScannedPages failed:', err);
    } finally {
      this.ocrRunning.set(false);
      this.ocr.progress.set(-1);
    }
  }

  protected onFileDropzone(file: File): void {
    void this.loadFile(file);
  }

  /** Forces OCR on the current page regardless of its classification. */
  protected async forceOcrOnCurrentPage(): Promise<void> {
    const pdf = this.loadedPdf();
    if (!pdf || this.ocrRunning()) return;

    const pageIdx = this.currentPage();
    const pageInfo = this.currentPageInfo();

    // Debug: log classification info
    console.log('[PDF OCR] Force OCR on page', pageIdx);
    console.log('[PDF OCR] Page type:', pageInfo?.type, '| nativeText length:', pageInfo?.nativeText?.length);
    console.log('[PDF OCR] Page dimensions:', pageInfo?.width, 'x', pageInfo?.height);

    this.ocrRunning.set(true);
    this.currentOcrPage.set(pageIdx);
    this.ocr.progress.set(0);

    try {
      // Use scale=1 so bboxes map directly to the page display dimensions.
      const canvas = await this.loader.renderPageToCanvas(pdf.doc, pageIdx, 1);
      console.log('[PDF OCR] Canvas for OCR:', canvas.width, 'x', canvas.height);

      const result = await this.ocr.recognise(canvas, this.ocrLangValue as any);
      console.log('[PDF OCR] Lang used:', this.ocrLangValue);
      console.log('[PDF OCR] Result blocks:', result.blocks.length, result.fullText.slice(0, 200));

      if (result.blocks.length === 0) {
        console.warn('[PDF OCR] No blocks found. Tesseract fullText:', result.fullText);
      }

      const newEdits = new Map(this.edits());
      for (let i = 0; i < result.blocks.length; i++) {
        const b = result.blocks[i];
        const id = `p${pageIdx}-ocr-forced-${i}`;
        if (!newEdits.has(id)) {
          newEdits.set(id, {
            id, pageIndex: pageIdx,
            x: b.x, y: b.y, w: b.w, h: b.h,
            lineHeight: b.lineHeight,
            originalText: b.text,
            newText: null, deleted: false,
          });
        }
      }
      this.edits.set(newEdits);

      // Also update ocrBlocks map.
      const allOcr = new Map(this.ocrBlocks());
      allOcr.set(pageIdx, result.blocks);
      this.ocrBlocks.set(allOcr);
    } catch (err) {
      console.error('[PDF OCR] Error during forced OCR:', err);
    } finally {
      this.ocrRunning.set(false);
      this.ocr.progress.set(-1);
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  protected async goToPage(index: number): Promise<void> {
    const pdf = this.loadedPdf();
    if (!pdf || index < 1 || index > pdf.pageCount) return;
    this.currentPage.set(index);
    this.selectedBlock.set(null);
    const targetCanvas = this.pageCanvases.find(c => Number(c.nativeElement.dataset['page']) === index);
    if (targetCanvas) {
      targetCanvas.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  private async renderAllPages(): Promise<void> {
    const pdf = this.loadedPdf();
    if (!pdf) return;

    // Retry up to 10 times if the canvas refs are not yet in the DOM.
    for (let attempt = 0; attempt < 10; attempt++) {
      if (this.pageCanvases && this.pageCanvases.length > 0) {
        break;
      }
      await new Promise<void>((r) => setTimeout(r, 30));
    }
    if (!this.pageCanvases || this.pageCanvases.length === 0) return;

    // Calculate initial scale to fit width (only on first load)
    if (this.scale() === 1.0) {
      const container = this.pageCanvases.first.nativeElement.closest('.overflow-y-auto') as HTMLElement;
      if (container && pdf.pages[0]) {
        const availableWidth = container.clientWidth - 80; // p-6 padding + margin
        if (pdf.pages[0].width > availableWidth) {
          const initialScale = availableWidth / pdf.pages[0].width;
          this.scale.set(Math.round(initialScale * 100) / 100);
        }
      }
    }

    // Render each page to its respective canvas
    for (const canvasRef of this.pageCanvases) {
      const target = canvasRef.nativeElement;
      const pageIndex = Number(target.dataset['page']);
      if (!pageIndex) continue;

      // Render at 2x for sharpness, then display at 100% via CSS h-full w-full.
      const canvas = await this.loader.renderPageToCanvas(pdf.doc, pageIndex, 2);
      target.width = canvas.width;
      target.height = canvas.height;
      target.getContext('2d')!.drawImage(canvas, 0, 0);
    }
  }

  protected zoom(delta: number): void {
    const next = Math.min(3, Math.max(0.3, this.scale() + delta));
    this.scale.set(Math.round(next * 10) / 10);
  }

  // ── Editing ────────────────────────────────────────────────────────────────

  protected onCanvasAreaClick(event: MouseEvent): void {
    if (this.activeTool() !== 'add_text') return;

    const target = event.target as HTMLElement;
    if (target.hasAttribute('data-block-id')) return; // clicked on existing block

    // Find which page container we clicked on
    const pageContainer = (target.closest('.shadow-pop') as HTMLElement) || (event.currentTarget as HTMLElement);
    const canvas = pageContainer.querySelector('canvas');
    const pageIndex = canvas ? Number(canvas.dataset['page']) : 1;

    const rect = pageContainer.getBoundingClientRect();
    this.addTextPos.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    this.addingTextPage.set(pageIndex);
    this.addingText.set(true);
  }

  protected commitAddText(event: FocusEvent): void {
    const textarea = event.target as HTMLTextAreaElement;
    const text = textarea.value.trim();
    this.addingText.set(false);

    if (!text) return;

    const pageIndex = this.addingTextPage();
    const pageInfo = this.loadedPdf()?.pages.find(p => p.index === pageIndex);
    if (!pageInfo) return;

    // Convert pixel position to relative coordinates.
    const containerW = pageInfo.width * this.scale();
    const containerH = pageInfo.height * this.scale();
    const id = `p${pageIndex}-add-${Date.now()}`;

    const newEdits = new Map(this.edits());
    newEdits.set(id, {
      id, pageIndex,
      x: this.addTextPos().x / containerW,
      y: this.addTextPos().y / containerH,
      w: 0.3, h: 0.04,
      originalText: '', newText: text, deleted: false,
    });
    this.edits.set(newEdits);
  }

  protected selectBlock(id: string, event?: MouseEvent): void {
    if (this.activeTool() === 'erase') {
      this.deleteBlock(id);
      return;
    }
    this.selectedBlock.set(id);

    // Inpainting: sample the background color from the page canvas
    // so the edit box blends in instead of showing a stark white box.
    const block = this.edits().get(id);
    if (block) {
      const canvasRef = this.pageCanvases.find(c => Number(c.nativeElement.dataset['page']) === block.pageIndex);
      const canvas = canvasRef?.nativeElement;
      if (canvas) {
        const pageInfo = this.loadedPdf()?.pages.find(p => p.index === block.pageIndex);
        // Canvas is rendered at 2x; page dimensions are at 1x.
        // We need to scale block coords to the canvas pixel dimensions.
        const scaleRatio = canvas.width / (pageInfo?.width ?? canvas.width);
        const result = this.inpainting.sampleBackground(
          canvas,
          block.x * scaleRatio,
          block.y * scaleRatio,
          block.w * scaleRatio,
          block.h * scaleRatio,
        );
        const newBg = new Map(this.inpaintBg());
        newBg.set(id, result.bgColor);
        this.inpaintBg.set(newBg);
      }
    }
  }

  protected onBlockBlur(event: FocusEvent, id: string): void {
    const el = event.target as HTMLElement;
    const text = el.innerText.trim();
    const newEdits = new Map(this.edits());
    const block = newEdits.get(id);
    if (block) {
      if (text === block.originalText) {
        newEdits.set(id, { ...block, newText: null });
      } else {
        newEdits.set(id, { ...block, newText: text });
      }
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
