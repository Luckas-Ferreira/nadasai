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
  HostListener,
} from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PdfLoaderService, type LoadedPdf, type PdfPageInfo } from './services/pdf-loader.service';
import { OcrService, type OcrBlock, type OcrLang } from './services/ocr.service';
import { PdfExporterService } from './services/pdf-exporter.service';
import { InpaintingService } from './services/inpainting.service';
import { baseFontSize } from './services/font-metrics';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { PdfPasswordPromptComponent } from '../../shared/ui/pdf-password-prompt.component';

export type EditorTool = 'select' | 'add_text' | 'erase';

/**
 * Escala de renderização da página para o OCR.
 *
 * Isto era 1, com o comentário "para os bbox do Tesseract mapearem 1:1 nas
 * dimensões da página". O mapeamento não precisa disso: o OcrService normaliza
 * todo bbox por canvas.width/height, então qualquer escala mapeia igual.
 *
 * O que a escala 1 fazia era entregar a página em ~72 DPI (A4 = 595x842). O
 * Tesseract é calibrado para ~300 DPI e degrada bastante abaixo de ~150: além
 * de errar caracteres, devolve bounding box ruim. Medido num DITR fotografado,
 * a página densa saía com bbox mediano de 27px onde o glifo real tinha ~8px —
 * 3x inflado, o que virava fonte 3x maior na hora de renderizar o bloco
 * editável. A página menos densa do mesmo arquivo, mais fácil de segmentar,
 * saía correta com 9px. Era o input que estava ruim, não a matemática de fonte.
 *
 * 3 = ~216 DPI. Um A4 vira 1785x2526 (~4,5 MP), que o Tesseract processa em
 * tempo aceitável no browser. Subir para 4 (288 DPI) quase dobra a memória e o
 * tempo sem ganho proporcional nesse tipo de documento.
 */
const OCR_RENDER_SCALE = 3;

/** Represents one user edit on a page. */
export interface TextEdit {
  id: string;
  pageIndex: number;   // 1-based
  x: number; y: number; w: number; h: number; // all 0–1 relative to page
  lineHeight?: number; // 0-1 relative to page height
  /**
   * Corpo da fonte medido, 0-1 relativo à altura da página. Presente só nos
   * blocos vindos do OCR, onde o OcrService o estima a partir do bbox da
   * palavra. Bloco de texto nativo não tem — e não precisa: ali o próprio `h`
   * já É o corpo da fonte. Ver baseFontSize em services/font-metrics.ts.
   */
  fontSize?: number;
  originalText: string;
  newText: string | null;
  deleted: boolean;
  bold?: boolean;
  italic?: boolean;
  color?: string; // hex
  bgColor?: string; // hex background
  fontFamily?: 'Helvetica' | 'Arial' | 'TimesRoman' | 'Courier';
  fontScale?: number;
  baseFontSize?: number;
  styleModified?: boolean;
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
    PdfPasswordPromptComponent,
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
          @if (pdfProtected()) {
            <app-pdf-password-prompt
              [fileName]="pendingFile()?.name ?? ''"
              [errorMsg]="passwordError()"
              (unlock)="loadFile(pendingFile()!, $event)"
              (cancel)="reset()"
            />
          } @else {
            <app-dropzone
              [accept]="'application/pdf,.pdf'"
              [titleKey]="'pdf.drag'"
              [hintKey]="'pdf.drag_hint'"
              [buttonKey]="'pdf.upload_btn'"
              (fileSelected)="onFileDropzone($event)"
            />
          }
        } @else {
          <!-- Continuous scroll container -->
          <div class="flex-1 overflow-auto bg-stage p-6 max-h-[calc(100dvh-120px)] relative touch-pan-x touch-pan-y" 
               (click)="onCanvasAreaClick($event)"
               (wheel)="onWheel($event)"
               (touchstart)="onTouchStart($event)"
               (touchmove)="onTouchMove($event)"
               (touchend)="onTouchEnd($event)">

            <!-- Floating OCR Loading & Progress Popup Modal -->
            @if (ocrRunning()) {
              <div class="absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] pointer-events-auto">
                <div class="flex flex-col gap-2.5 rounded-xl border border-line bg-surface/95 backdrop-blur-md p-4 shadow-2xl text-text transition-all animate-in fade-in zoom-in-95">
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                      <div class="relative flex h-5 w-5 items-center justify-center shrink-0">
                        <div class="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent"></div>
                      </div>
                      <div class="flex flex-col min-w-0">
                        <span class="text-xs font-semibold text-text truncate">
                          {{ i18n.t()['pdf.ocr_loading_title'] }}
                        </span>
                        <span class="text-[11px] text-muted truncate">
                          {{ currentOcrPage() ? ('Página ' + currentOcrPage() + ' • ') : '' }}{{ getFormattedOcrStatus() }}
                        </span>
                      </div>
                    </div>
                    @if (ocrProgress() >= 0) {
                      <span class="text-xs font-mono font-bold text-accent shrink-0">{{ ocrProgress() }}%</span>
                    }
                  </div>
                  @if (ocrProgress() >= 0) {
                    <div class="h-1.5 w-full overflow-hidden rounded-full bg-raised">
                      <div class="h-full rounded-full bg-accent transition-all duration-300 ease-out" [style.width.%]="ocrProgress()"></div>
                    </div>
                  }
                </div>
              </div>
            }

            @if (status() === 'loading') {
              <div class="flex flex-col items-center justify-center gap-4 py-12">
                <div class="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"></div>
                <p class="text-sm text-muted">
                  {{ i18n.t()['pdf.detecting'] }}
                </p>
              </div>
            }

            @if (loadedPdf()) {
              @for (page of loadedPdf()!.pages; track page.index) {
                <div
                  class="relative mx-auto mb-6 shadow-pop shrink-0 bg-white transition-all duration-200"
                  [style.width.px]="page.width * scale()"
                  [style.height.px]="page.height * scale()"
                >
                  <canvas #pageCanvas [attr.data-page]="page.index" class="block h-full w-full"></canvas>

                  <!-- OCR / edit overlay -->
                  <div class="absolute inset-0 overflow-hidden">
                    @for (block of (blocksByPage().get(page.index) || []); track block.id) {
                      <div
                        class="absolute cursor-text overflow-visible whitespace-nowrap rounded-sm px-0.5 outline-none border transition-colors tracking-tight"
                        [style.left.%]="block.x * 100"
                        [style.top.%]="block.y * 100"
                        [style.width.%]="block.w * 100"
                        [style.minWidth.%]="block.w * 100"
                        [style.height.%]="block.h * 100"
                        [style.lineHeight.px]="block.h * page.height * scale() * (block.fontScale || 1.0)"
                        [style.fontSize.px]="(block.baseFontSize || getBaseFontSize(block, page.height, page.width)) * scale() * (block.fontScale || 1.0)"
                        [style.fontStretch]="'condensed'"
                        [style.fontWeight]="block.bold ? 'bold' : 'normal'"
                        [style.fontStyle]="block.italic ? 'italic' : 'normal'"
                        [style.fontFamily]="block.fontFamily || 'Helvetica, Arial Narrow, sans-serif'"
                        [style.color]="(selectedBlock() !== block.id && block.newText === null && !block.deleted) ? 'transparent' : (block.color || 'inherit')"
                        [style.background]="block.bgColor || (selectedBlock() === block.id ? (inpaintBg().get(block.id) || 'rgb(255,255,255)') : (block.newText !== null ? 'rgb(255,255,255)' : 'transparent'))"
                        [class.z-10]="selectedBlock() === block.id"
                        [class.text-text]="selectedBlock() === block.id || block.newText !== null"
                        [class.border-dashed]="selectedBlock() !== block.id"
                        [class.border-line]="selectedBlock() !== block.id"
                        [class.border-accent]="selectedBlock() === block.id"
                        [class.shadow-sm]="selectedBlock() === block.id"
                        [class.line-through]="block.deleted"
                        [class.text-danger]="block.deleted"
                        [class.opacity-50]="block.deleted"
                        [attr.contenteditable]="activeTool() === 'select' ? 'true' : 'false'"
                        [attr.data-block-id]="block.id"
                        (click)="$event.stopPropagation(); selectBlock(block.id, $event)"
                        (blur)="onBlockBlur($event, block.id)"
                      >
                        @if (selectedBlock() === block.id) {
                          <div class="absolute -top-3 -left-3 w-6 h-6 bg-white border border-gray-300 rounded-full shadow cursor-move flex items-center justify-center z-20 text-gray-500 hover:text-black hover:border-gray-400"
                               (mousedown)="startDragBlock(block.id, $event)">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"></polyline><polyline points="9 5 12 2 15 5"></polyline><polyline points="19 9 22 12 19 15"></polyline><polyline points="9 19 12 22 15 19"></polyline><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line></svg>
                          </div>
                        }
                        {{ block.newText !== null ? block.newText : block.originalText }}
                      </div>
                    }

                    <!-- New text input area -->
                    @if (addingText() && activeTool() === 'add_text' && addingTextPage() === page.index) {
                      <textarea
                        #newTextArea
                        class="absolute resize-none rounded border border-accent bg-white/90 px-1 py-0.5 text-sm text-black outline-none font-semibold"
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
          <app-panel [heading]="i18n.t()['pdf.title']">
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
              
              <div class="border-t border-line my-1"></div>
              <button
                class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all w-full text-left text-muted hover:text-text hover:bg-surface/50"
                [disabled]="undoStack().length === 0"
                [class.opacity-50]="undoStack().length === 0"
                (click)="undo()"
              >
                <app-icon name="undo" [size]="16" />
                Desfazer
              </button>
            </div>

            <!-- Block Selection Inspector -->
            @if (selectedBlock()) {
              <div class="mt-4 border-t border-line pt-3 flex flex-col gap-3">
                <span class="text-xs font-semibold text-text">Formatar Texto</span>
                
                <!-- Font and Size Row -->
                <div class="flex items-center gap-2">
                  <select class="flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-sm font-medium outline-none hover:border-accent" [value]="getBlockFont(selectedBlock()!)" (change)="changeBlockFont(selectedBlock()!, $event)">
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="TimesRoman">Times Roman</option>
                    <option value="Courier">Courier</option>
                  </select>

                  <div class="flex items-center justify-between rounded-md border border-line bg-surface p-0.5">
                    <button class="px-2 py-1 hover:bg-raised hover:text-text transition-colors text-muted rounded font-medium" (click)="changeBlockSize(selectedBlock()!, -1)">&minus;</button>
                    <input 
                      type="text" 
                      class="text-xs font-medium tabular-nums w-8 text-center bg-transparent border-none outline-none focus:ring-0 p-0" 
                      [value]="getBlockSize(selectedBlock()!)" 
                      (change)="setBlockSizeFromInput(selectedBlock()!, $event)"
                      (keydown.enter)="setBlockSizeFromInput(selectedBlock()!, $event)"
                      title="Tamanho da fonte"
                    />
                    <button class="px-2 py-1 hover:bg-raised hover:text-text transition-colors text-muted rounded font-medium" (click)="changeBlockSize(selectedBlock()!, 1)">+</button>
                  </div>
                </div>

                <!-- Color and Styles Row -->
                <div class="flex items-center gap-2">
                  <div class="relative h-8 w-8 rounded border border-line hover:border-accent overflow-hidden shrink-0" title="Cor do texto">
                    <input type="color" class="absolute -top-2 -left-2 h-12 w-12 cursor-pointer border-0 p-0" [value]="getBlockColor(selectedBlock()!)" (input)="changeBlockColor(selectedBlock()!, $event)" />
                  </div>
                  <div class="relative h-8 w-8 rounded border border-line hover:border-accent overflow-hidden shrink-0" title="Cor do fundo">
                    <input type="color" class="absolute -top-2 -left-2 h-12 w-12 cursor-pointer border-0 p-0" [value]="getBlockBgColor(selectedBlock()!)" (input)="changeBlockBgColor(selectedBlock()!, $event)" />
                  </div>
                  
                  <div class="flex flex-1 rounded-md border border-line overflow-hidden">
                    <button appButton variant="ghost" size="sm" class="flex-1 rounded-none font-serif text-sm font-bold border-r border-transparent hover:bg-raised" [class.bg-raised]="isBlockBold(selectedBlock()!)" (click)="toggleBlockBold(selectedBlock()!)">
                      B
                    </button>
                    <button appButton variant="ghost" size="sm" class="flex-1 rounded-none font-serif text-sm italic hover:bg-raised" [class.bg-raised]="isBlockItalic(selectedBlock()!)" (click)="toggleBlockItalic(selectedBlock()!)">
                      I
                    </button>
                  </div>
                </div>

                <div class="border-t border-line my-1"></div>

                <button appButton variant="danger" size="sm" block (click)="deleteBlock(selectedBlock()!)">
                  <app-icon name="close" [size]="13" />
                  Apagar
                </button>
                <button appButton variant="ghost" size="sm" block (click)="selectedBlock.set(null)">
                  Desselecionar
                </button>
              </div>
            }

            <!-- Zoom -->
            <div class="mt-4 border-t border-line pt-3 flex flex-col gap-2">
              <label class="block text-xs text-muted font-medium">Zoom</label>
              <div class="flex items-center justify-between rounded-md border border-line bg-surface p-0.5">
                <button class="px-3 py-1.5 hover:bg-raised hover:text-text transition-colors text-muted rounded font-medium" (click)="zoom(-0.1)">&minus;</button>
                <input 
                  type="text" 
                  class="text-sm font-medium tabular-nums w-12 text-center bg-transparent border-none outline-none focus:ring-0" 
                  [value]="(scale() * 100) | number:'1.0-0'" 
                  (change)="setZoomFromInput($event)"
                  (keydown.enter)="setZoomFromInput($event)"
                  title="Digite o zoom em %"
                />
                <button class="px-3 py-1.5 hover:bg-raised hover:text-text transition-colors text-muted rounded font-medium" (click)="zoom(0.1)">+</button>
              </div>
            </div>
          </app-panel>

          <app-action-bar
            [busy]="status() === 'exporting'"
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
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly pdfProtected = signal(false);
  protected readonly pdfPassword = signal<string | null>(null);
  protected readonly passwordError = signal<string | null>(null);
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

  protected getFormattedOcrStatus(): string {
    const raw = this.ocrStatusText();
    if (!raw) return this.i18n.t()['pdf.detecting'] || 'Processando…';
    if (raw.includes('loading language')) return 'Carregando modelo de idioma (OCR)…';
    if (raw.includes('initializing')) return 'Inicializando motor OCR…';
    if (raw.includes('recognizing')) return 'Reconhecendo texto…';
    return raw;
  }

  /** All edits keyed by blockId */
  private readonly edits = signal<Map<string, TextEdit>>(new Map());
  
  /** Snapshots for undo */
  protected readonly undoStack = signal<Map<string, TextEdit>[]>([]);

  private saveHistory(): void {
    const current = new Map(this.edits());
    this.undoStack.update(stack => [...stack, current]);
  }

  @HostListener('window:keydown.control.z', ['$event'])
  @HostListener('window:keydown.meta.z', ['$event'])
  protected undo(event?: KeyboardEvent): void {
    if (event) {
      const target = event.target as HTMLElement;
      if (target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return; // let browser handle text undo
      }
      event.preventDefault();
    }
    const stack = this.undoStack();
    if (stack.length > 0) {
      const popped = stack[stack.length - 1];
      this.undoStack.set(stack.slice(0, stack.length - 1));
      this.edits.set(new Map(popped));
    }
  }

  /** OCR blocks per page (1-based index) */
  private readonly ocrBlocks = signal<Map<number, OcrBlock[]>>(new Map());

  protected readonly currentPageInfo = computed<PdfPageInfo | undefined>(() =>
    this.loadedPdf()?.pages.find((p) => p.index === this.currentPage()),
  );

  protected readonly blocksByPage = computed(() => {
    const map = new Map<number, TextEdit[]>();
    for (const edit of this.edits().values()) {
      const list = map.get(edit.pageIndex);
      if (list) {
        list.push(edit);
      } else {
        map.set(edit.pageIndex, [edit]);
      }
    }
    return map;
  });

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

  protected async loadFile(file: File, password?: string): Promise<void> {
    this.status.set('loading');
    this.edits.set(new Map());
    this.undoStack.set([]);
    this.ocrBlocks.set(new Map());
    this.passwordError.set(null);
    this.pendingFile.set(file);

    try {
      const pdf = await this.loader.load(file, password);
      this.loadedPdf.set(pdf);
      this.currentPage.set(1);
      this.pdfPassword.set(password ?? null);
      this.pdfProtected.set(false);

      // Seed edits from digital pages' native text.
      const newEdits = new Map<string, TextEdit>();
      for (const page of pdf.pages) {
        if (page.type === 'digital' && page.nativeBlocks.length > 0) {
          for (let i = 0; i < page.nativeBlocks.length; i++) {
            const b = page.nativeBlocks[i];
            const id = `p${page.index}-native-${i}`;
            const blockObj = {
              id, pageIndex: page.index,
              x: b.x, y: b.y, w: b.w, h: b.h,
              originalText: b.text,
              newText: null, deleted: false,
            };
            newEdits.set(id, {
              ...blockObj,
              baseFontSize: baseFontSize(blockObj, page.height, page.width),
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
      console.error('[PdfComponent] Error loading PDF:', err);
      const key = err instanceof Error ? err.message : 'generic';
      if (key === 'pdf_encrypted') {
        this.pdfProtected.set(true);
        if (password) {
          this.passwordError.set('Senha incorreta. Tente novamente.');
        }
        this.status.set('idle');
      } else {
        const msgKey = `error.${key}` as keyof ReturnType<typeof this.i18n.t>;
        this.errorMessage.set(this.i18n.t()[msgKey] ?? this.i18n.t()['error.generic']);
        this.status.set('error');
      }
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

        const canvas = await this.loader.renderPageToCanvas(pdf.doc, page.index, OCR_RENDER_SCALE);
        const result = await this.ocr.recognise(canvas, this.ocrLangValue as any);

        allOcr.set(page.index, result.blocks);

        // Add OCR blocks as editable overlays.
        const newEdits = new Map(this.edits());
        for (let i = 0; i < result.blocks.length; i++) {
          const b = result.blocks[i];
          const id = `p${page.index}-ocr-${i}`;
          if (!newEdits.has(id)) {
            const blockObj = {
              id, pageIndex: page.index,
              x: b.x, y: b.y, w: b.w, h: b.h,
              lineHeight: b.lineHeight,
              fontSize: b.fontSize,
              originalText: b.text,
              newText: null, deleted: false,
            };
            newEdits.set(id, {
              ...blockObj,
              baseFontSize: baseFontSize(blockObj, page.height, page.width),
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

    this.ocrRunning.set(true);
    this.currentOcrPage.set(pageIdx);
    this.ocr.progress.set(0);

    try {
      const canvas = await this.loader.renderPageToCanvas(pdf.doc, pageIdx, OCR_RENDER_SCALE);

      const result = await this.ocr.recognise(canvas, this.ocrLangValue as any);

      if (result.blocks.length === 0) {
        console.warn('[PDF OCR] No blocks found. Tesseract fullText:', result.fullText);
      }

      const newEdits = new Map(this.edits());
      for (let i = 0; i < result.blocks.length; i++) {
        const b = result.blocks[i];
        const id = `p${pageIdx}-ocr-forced-${i}`;
        if (!newEdits.has(id)) {
          const bgResult = this.inpainting.sampleBackground(canvas, b.x, b.y, b.w, b.h);
          const textColor = this.inpainting.sampleTextColor(canvas, b.x, b.y, b.w, b.h, bgResult.bgColor);

          newEdits.set(id, {
            id, pageIndex: pageIdx,
            x: b.x, y: b.y, w: b.w, h: b.h,
            lineHeight: b.lineHeight,
            fontSize: b.fontSize,
            originalText: b.text,
            color: textColor,
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
      if (this.pageCanvases && this.pageCanvases.length === pdf.pages.length) {
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

  private zoomAnimFrame: number | null = null;
  private pendingZoomScale: number | null = null;

  private setScaleSmooth(val: number): void {
    const clamped = Math.min(3, Math.max(0.3, Math.round(val * 100) / 100));
    this.pendingZoomScale = clamped;
    if (this.zoomAnimFrame === null) {
      this.zoomAnimFrame = requestAnimationFrame(() => {
        if (this.pendingZoomScale !== null) {
          this.scale.set(this.pendingZoomScale);
          this.pendingZoomScale = null;
        }
        this.zoomAnimFrame = null;
      });
    }
  }

  protected initialPinchDistance: number | null = null;
  protected initialScaleAtPinchStart: number = 1.0;

  protected onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      this.initialPinchDistance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
      this.initialScaleAtPinchStart = this.scale();
    }
  }

  protected onTouchMove(event: TouchEvent): void {
    if (event.touches.length === 2 && this.initialPinchDistance !== null) {
      if (event.cancelable) event.preventDefault();
      const currentDistance = Math.hypot(
        event.touches[0].clientX - event.touches[1].clientX,
        event.touches[0].clientY - event.touches[1].clientY
      );
      const ratio = currentDistance / this.initialPinchDistance;
      this.setScaleSmooth(this.initialScaleAtPinchStart * ratio);
    }
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) {
      this.initialPinchDistance = null;
    }
  }

  protected onWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      if (event.cancelable) event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      this.setScaleSmooth(this.scale() + delta);
    }
  }
  protected zoom(delta: number): void {
    this.setScaleSmooth(this.scale() + delta);
  }

  protected setZoomFromInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let val = parseInt(input.value, 10);
    if (!isNaN(val)) {
      const next = Math.min(3, Math.max(0.3, val / 100));
      this.scale.set(Math.round(next * 100) / 100);
    }
    input.value = Math.round(this.scale() * 100).toString();
  }

  // ── Dragging ───────────────────────────────────────────────────────────────

  private dragState: { id: string, startX: number, startY: number, blockX: number, blockY: number } | null = null;

  protected startDragBlock(id: string, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    const block = this.edits().get(id);
    if (!block) return;
    this.saveHistory();
    this.dragState = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      blockX: block.x,
      blockY: block.y
    };
  }

  @HostListener('window:mousemove', ['$event'])
  protected onMouseMove(e: MouseEvent): void {
    if (!this.dragState) return;
    const { id, startX, startY, blockX, blockY } = this.dragState;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const block = this.edits().get(id);
    if (!block) return;
    const pageInfo = this.loadedPdf()?.pages.find(p => p.index === block.pageIndex);
    if (!pageInfo) return;

    const scale = this.scale();
    const containerW = pageInfo.width * scale;
    const containerH = pageInfo.height * scale;

    const newX = blockX + dx / containerW;
    const newY = blockY + dy / containerH;

    const newEdits = new Map(this.edits());
    newEdits.set(id, { ...block, x: newX, y: newY, styleModified: true, newText: block.newText ?? block.originalText });
    this.edits.set(newEdits);
  }

  @HostListener('window:mouseup')
  protected onMouseUp(): void {
    this.dragState = null;
  }

  // ── Editing ────────────────────────────────────────────────────────────────

  protected onCanvasAreaClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    
    // Deselect if clicked outside any text block
    if (!target.hasAttribute('data-block-id') && !target.closest('textarea')) {
      this.selectedBlock.set(null);
    }

    if (this.activeTool() !== 'add_text') return;
    if (target.hasAttribute('data-block-id')) return; // clicked on existing block

    // Find which page container we clicked on
    const pageContainer = (target.closest('.shadow-pop') as HTMLElement) || (event.currentTarget as HTMLElement);
    const canvas = pageContainer.querySelector('canvas');
    const pageIndex = canvas ? Number(canvas.dataset['page']) : 1;

    const rect = pageContainer.getBoundingClientRect();
    const scale = this.scale();
    this.addTextPos.set({ x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale });
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

    this.saveHistory();

    const id = `p${pageIndex}-user-${Date.now()}`;
    const newEdits = new Map(this.edits());
    newEdits.set(id, {
      id, pageIndex: this.addingTextPage(),
      x: this.addTextPos().x / pageInfo.width,
      y: this.addTextPos().y / pageInfo.height,
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
        const result = this.inpainting.sampleBackground(
          canvas,
          block.x,
          block.y,
          block.w,
          block.h,
        );
        const newBg = new Map(this.inpaintBg());
        newBg.set(id, result.bgColor);
        this.inpaintBg.set(newBg);

        // Detect text color on demand if missing (e.g. for native digital blocks)
        if (!block.color) {
          const textColor = this.inpainting.sampleTextColor(
            canvas,
            block.x,
            block.y,
            block.w,
            block.h,
            result.bgColor
          );
          const newEdits = new Map(this.edits());
          newEdits.set(id, { ...block, color: textColor });
          this.edits.set(newEdits);
        }
      }
    }
  }

  protected onBlockBlur(event: FocusEvent, id: string): void {
    const el = event.target as HTMLElement;
    const text = el.textContent?.trim() || '';
    
    const block = this.edits().get(id);
    if (block) {
      const currentText = (block.newText ?? block.originalText).trim();
      if (text !== currentText) {
        this.saveHistory();
        const newEdits = new Map(this.edits());
        newEdits.set(id, { ...block, newText: text });
        this.edits.set(newEdits);
      }
    }
  }

  protected deleteBlock(id: string): void {
    this.saveHistory();
    const newEdits = new Map(this.edits());
    const block = newEdits.get(id);
    if (block) {
      newEdits.set(id, { ...block, deleted: true });
      this.edits.set(newEdits);
    }
    this.selectedBlock.set(null);
  }

  // ── Text Styling ───────────────────────────────────────────────────────────

  protected isBlockBold(id: string): boolean {
    return this.edits().get(id)?.bold ?? false;
  }

  protected toggleBlockBold(id: string): void {
    const block = this.edits().get(id);
    if (block) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      newEdits.set(id, { ...block, bold: !block.bold, styleModified: true, newText: block.newText ?? block.originalText });
      this.edits.set(newEdits);
    }
  }

  protected getBaseFontSize(block: TextEdit, pageHeight: number, pageWidth: number): number {
    return baseFontSize(block, pageHeight, pageWidth);
  }

  protected getBlockSize(id: string): number {
    const block = this.edits().get(id);
    if (!block) return 16;
    const pageInfo = this.loadedPdf()?.pages.find(p => p.index === block.pageIndex);
    const height = pageInfo ? pageInfo.height : 842;
    const width = pageInfo ? pageInfo.width : 595;
    const defaultSize = this.getBaseFontSize(block, height, width);
    return Math.round(defaultSize * (block.fontScale || 1.0));
  }

  protected changeBlockSize(id: string, delta: number): void {
    const block = this.edits().get(id);
    if (block) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      const pageInfo = this.loadedPdf()?.pages.find(p => p.index === block.pageIndex);
      const height = pageInfo ? pageInfo.height : 842;
      const width = pageInfo ? pageInfo.width : 595;
      const defaultSize = this.getBaseFontSize(block, height, width);
      
      const currentSize = Math.round(defaultSize * (block.fontScale || 1.0));
      const nextSize = Math.max(6, currentSize + delta);
      
      const nextScale = nextSize / defaultSize;
      
      newEdits.set(id, { ...block, fontScale: nextScale, styleModified: true, newText: block.newText ?? block.originalText });
      this.edits.set(newEdits);
    }
  }

  protected setBlockSizeFromInput(id: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const val = parseInt(input.value, 10);
    const block = this.edits().get(id);
    if (block && !isNaN(val)) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      const pageInfo = this.loadedPdf()?.pages.find(p => p.index === block.pageIndex);
      const height = pageInfo ? pageInfo.height : 842;
      const width = pageInfo ? pageInfo.width : 595;
      const defaultSize = this.getBaseFontSize(block, height, width);
      
      const nextSize = Math.max(6, val);
      const nextScale = nextSize / defaultSize;
      
      newEdits.set(id, { ...block, fontScale: nextScale, styleModified: true, newText: block.newText ?? block.originalText });
      this.edits.set(newEdits);
    }
    input.value = this.getBlockSize(id).toString();
  }

  protected isBlockItalic(id: string): boolean {
    return this.edits().get(id)?.italic ?? false;
  }

  protected toggleBlockItalic(id: string): void {
    const block = this.edits().get(id);
    if (block) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      newEdits.set(id, { ...block, italic: !block.italic, styleModified: true, newText: block.newText ?? block.originalText });
      this.edits.set(newEdits);
    }
  }

  protected getBlockColor(id: string): string {
    return this.edits().get(id)?.color ?? '#000000';
  }

  protected changeBlockColor(id: string, event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    const block = this.edits().get(id);
    if (block) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      newEdits.set(id, { ...block, color, styleModified: true, newText: block.newText ?? block.originalText });
      this.edits.set(newEdits);
    }
  }

  protected getBlockBgColor(id: string): string {
    return this.edits().get(id)?.bgColor ?? '#ffffff';
  }

  protected changeBlockBgColor(id: string, event: Event): void {
    const bgColor = (event.target as HTMLInputElement).value;
    const block = this.edits().get(id);
    if (block) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      newEdits.set(id, { ...block, bgColor, styleModified: true, newText: block.newText ?? block.originalText });
      this.edits.set(newEdits);
    }
  }

  protected getBlockFont(id: string): string {
    return this.edits().get(id)?.fontFamily ?? 'Helvetica';
  }

  protected changeBlockFont(id: string, event: Event): void {
    const fontFamily = (event.target as HTMLSelectElement).value as any;
    const block = this.edits().get(id);
    if (block) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      newEdits.set(id, { ...block, fontFamily, styleModified: true, newText: block.newText ?? block.originalText });
      this.edits.set(newEdits);
    }
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
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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
    this.pendingFile.set(null);
    this.pdfProtected.set(false);
    this.pdfPassword.set(null);
    this.passwordError.set(null);
    this.loadedPdf.set(null);
    this.edits.set(new Map());
    this.ocrBlocks.set(new Map());
    this.selectedBlock.set(null);
  }

  ngOnDestroy(): void {
    void this.ocr.terminate();
  }
}
