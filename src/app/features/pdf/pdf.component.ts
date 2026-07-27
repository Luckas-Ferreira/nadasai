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
import { PdfLoaderService, isLightColor, type LoadedPdf, type PdfPageInfo } from './services/pdf-loader.service';
import { OcrService, type OcrBlock, type OcrLang } from './services/ocr.service';
import { PdfExporterService } from './services/pdf-exporter.service';
import { InpaintingService } from './services/inpainting.service';
import { baseFontSize, fitFontSizeToWidth, measureTextWidth } from './services/font-metrics';
import { mergeNativeParagraphs } from './services/paragraph-merger';
import { renderPageIntoCanvas, renderPageToCanvas, releaseCanvas, pageRenderScale } from '../../core/pdf/pdfjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { PanelComponent } from '../../shared/ui/panel.component';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { PdfPasswordPromptComponent } from '../../shared/ui/pdf-password-prompt.component';

export type EditorTool = 'select' | 'add_text' | 'erase';

const OCR_RENDER_SCALE = 3;

/**
 * Famílias do pdf-lib → pilhas CSS reais.
 *
 * `fontFamily` guarda o nome que o pdf-lib usa no export ('TimesRoman',
 * 'Courier'), e esses nomes iam direto para o `font-family` do overlay. Nenhum
 * browser conhece "TimesRoman": a família não resolvia, o texto renderizava na
 * fonte padrão e ficava mais largo do que o `fitFontSizeToWidth` mediu — o que,
 * com as quebras agora preservadas, gera uma linha extra e desloca o bloco.
 */
const FONT_STACKS: Record<NonNullable<TextEdit['fontFamily']>, string> = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  Arial: 'Arial, Helvetica, sans-serif',
  TimesRoman: '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
  Symbol: 'Helvetica, Arial, sans-serif',
};

export interface TextEdit {
  id: string;
  pageIndex: number;
  x: number; y: number; w: number; h: number;
  lineHeight?: number;
  fontSize?: number;
  originalText: string;
  formattedText?: string;
  newText: string | null;
  deleted: boolean;
  bold?: boolean;
  italic?: boolean;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  color?: string;
  bgColor?: string;
  fontFamily?: 'Helvetica' | 'Arial' | 'TimesRoman' | 'Courier' | 'Symbol';
  fontScale?: number;
  baseFontSize?: number;
  styleModified?: boolean;
  source?: 'native' | 'ocr' | 'user';
}

type PdfStatus = 'idle' | 'loading' | 'ready' | 'ocr' | 'exporting' | 'error';


/** One of 8 resize handle positions. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

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
      } @else if (renderWarning()) {
        <div banner class="mb-5">
          <app-alert
            [message]="renderWarning()!"
            tone="info"
            dismissible
            (dismiss)="renderWarning.set(null)"
          />
        </div>
      }

      <!-- ── Canvas Stage ───────────────────────────────────────────────── -->
      <div stage class="min-w-0 flex flex-col">
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
          <!-- Scroll container.
               Usa o doc-stage e não o image-stage: ver o comentário do token em
               styles.css. Arredondado e com borda para virar uma superfície de
               leitura enquadrada, em vez de uma laje que encosta nas beiradas. -->
          <div class="doc-scroll flex-1 overflow-auto rounded-xl border border-doc-stage-line bg-doc-stage p-6 sm:p-8 max-h-[calc(100dvh-120px)] relative touch-pan-x touch-pan-y"
               (click)="onCanvasAreaClick($event)"
               (wheel)="onWheel($event)"
               (touchstart)="onTouchStart($event)"
               (touchmove)="onTouchMove($event)"
               (touchend)="onTouchEnd($event)">

            <!-- OCR progress overlay -->
            @if (ocrRunning()) {
              <div class="absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] pointer-events-auto">
                <div class="flex flex-col gap-2.5 rounded-xl border border-line bg-surface/95 backdrop-blur-md p-4 shadow-2xl text-text animate-in fade-in zoom-in-95">
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                      <div class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent"></div>
                      <div class="flex flex-col min-w-0">
                        <span class="text-xs font-semibold text-text truncate">{{ i18n.t()['pdf.ocr_loading_title'] }}</span>
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
                <p class="text-sm text-muted">{{ i18n.t()['pdf.detecting'] }}</p>
              </div>
            }

            @if (loadedPdf()) {
              @for (page of loadedPdf()!.pages; track page.index) {
                <!-- A folha. Sem overflow-hidden no wrapper, de propósito: as
                     alças de redimensionamento de um bloco selecionado ficam a
                     -4px das bordas e a de mover a -14px, e seriam decepadas.
                     Quem arredonda é o canvas, que respeita border-radius ao
                     pintar. -->
                <div
                  class="relative mx-auto mb-7 shrink-0 rounded-md bg-white shadow-page"
                  [style.width.px]="page.width * scale()"
                  [style.height.px]="page.height * scale()"
                >
                  <canvas #pageCanvas [attr.data-page]="page.index" class="block h-full w-full rounded-md"></canvas>

                  <!-- Paragraph / text block overlays -->
                  <div class="absolute inset-0" style="overflow: visible;">
                    @for (block of (blocksByPage().get(page.index) || []); track block.id) {
                      <!-- Block container — position from bbox -->
                      <div
                        class="absolute outline-none border transition-colors"
                        [class.z-10]="selectedBlock() === block.id"
                        [class.border-dashed]="selectedBlock() !== block.id && !block.deleted && block.newText === null"
                        [class.border-sky-300]="selectedBlock() !== block.id && !block.deleted && block.newText === null"
                        [class.border-transparent]="selectedBlock() !== block.id && (block.deleted || block.newText !== null)"
                        [class.border]="selectedBlock() === block.id"
                        [class.border-sky-500]="selectedBlock() === block.id"
                        [class.line-through]="block.deleted"
                        [class.opacity-40]="block.deleted"
                        [style.left.%]="block.x * 100"
                        [style.top.%]="block.y * 100"
                        [style.width.%]="block.w * 100"
                        [style.height.%]="block.h * 100"
                        [style.cursor]="activeTool() === 'erase' ? 'crosshair' : (selectedBlock() === block.id ? 'text' : 'pointer')"
                        (click)="$event.stopPropagation(); selectBlock(block.id, $event)"
                      >
                        <!-- ── Text content ── -->
                        <div
                          class="absolute -inset-x-0.5 inset-y-0 px-0.5 outline-none focus:outline-none border-none ring-0 focus:ring-0 shadow-none"
                          [class.overflow-hidden]="selectedBlock() !== block.id"
                          [class.overflow-visible]="selectedBlock() === block.id"
                          [style.fontSize.px]="getBlockFontPx(block, page.height, page.width) * scale()"
                          [style.lineHeight.px]="getBlockLineHeightPx(block, page.height) * scale()"
                          [style.top.px]="getBlockTextTopPx(block, page.height, page.width) * scale()"
                          [style.fontWeight]="block.bold ? 'bold' : 'normal'"
                          [style.fontStyle]="block.italic ? 'italic' : 'normal'"
                          [style.textAlign]="block.textAlign || 'left'"
                          [style.fontFamily]="getBlockFontStack(block)"
                          [style.fontStretch]="block.source === 'native' ? 'normal' : 'condensed'"
                          [style.color]="(!canvasRendered().has(page.index) || selectedBlock() === block.id || block.newText !== null || block.deleted) ? ((block.color && !isLightColor(block.color)) ? block.color : '#000000') : 'transparent'"
                          [style.background]="block.bgColor || ((selectedBlock() === block.id || block.newText !== null) ? (inpaintBg().get(block.id) || 'rgb(255,255,255)') : 'transparent')"
                          [class.pdf-justified]="block.textAlign === 'justify'"
                          [style.whiteSpace]="(block.lineHeight && block.h <= block.lineHeight * 1.3) ? 'nowrap' : 'pre-wrap'"
                          style="word-break: normal; overflow-wrap: normal;"
                          [attr.contenteditable]="activeTool() === 'select' && selectedBlock() === block.id ? 'true' : 'false'"
                          [attr.data-block-id]="block.id"
                          (blur)="onBlockBlur($event, block.id)"
                          [innerHTML]="getBlockHtml(block)"
                        ></div>

                        <!-- ── Acrobat-style resize handles (only when selected) ── -->
                        @if (selectedBlock() === block.id) {
                          <!-- NW -->
                          <div class="absolute w-2 h-2 bg-white border border-sky-500 rounded-2xs z-30 shadow-2xs"
                               style="top: -4px; left: -4px; cursor: nw-resize;"
                               (mousedown)="startResize(block.id, 'nw', $event)"></div>
                          <!-- N -->
                          <div class="absolute w-2 h-2 bg-white border border-sky-500 rounded-2xs z-30 shadow-2xs"
                               style="top: -4px; left: 50%; transform: translateX(-50%); cursor: n-resize;"
                               (mousedown)="startResize(block.id, 'n', $event)"></div>
                          <!-- NE -->
                          <div class="absolute w-2 h-2 bg-white border border-sky-500 rounded-2xs z-30 shadow-2xs"
                               style="top: -4px; right: -4px; cursor: ne-resize;"
                               (mousedown)="startResize(block.id, 'ne', $event)"></div>
                          <!-- E -->
                          <div class="absolute w-2 h-2 bg-white border border-sky-500 rounded-2xs z-30 shadow-2xs"
                               style="top: 50%; right: -4px; transform: translateY(-50%); cursor: e-resize;"
                               (mousedown)="startResize(block.id, 'e', $event)"></div>
                          <!-- SE -->
                          <div class="absolute w-2 h-2 bg-white border border-sky-500 rounded-2xs z-30 shadow-2xs"
                               style="bottom: -4px; right: -4px; cursor: se-resize;"
                               (mousedown)="startResize(block.id, 'se', $event)"></div>
                          <!-- S -->
                          <div class="absolute w-2 h-2 bg-white border border-sky-500 rounded-2xs z-30 shadow-2xs"
                               style="bottom: -4px; left: 50%; transform: translateX(-50%); cursor: s-resize;"
                               (mousedown)="startResize(block.id, 's', $event)"></div>
                          <!-- SW -->
                          <div class="absolute w-2 h-2 bg-white border border-sky-500 rounded-2xs z-30 shadow-2xs"
                               style="bottom: -4px; left: -4px; cursor: sw-resize;"
                               (mousedown)="startResize(block.id, 'sw', $event)"></div>
                          <!-- W -->
                          <div class="absolute w-2 h-2 bg-white border border-sky-500 rounded-2xs z-30 shadow-2xs"
                               style="top: 50%; left: -4px; transform: translateY(-50%); cursor: w-resize;"
                               (mousedown)="startResize(block.id, 'w', $event)"></div>
                          <!-- Move handle (top-left corner icon) -->
                          <div class="absolute -top-3.5 -left-3.5 w-6 h-6 bg-sky-500 rounded-full shadow-sm cursor-move flex items-center justify-center z-30 text-white hover:bg-sky-600 transition-colors"
                               (mousedown)="startDragBlock(block.id, $event)">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>
                              <polyline points="19 9 22 12 19 15"/><polyline points="9 19 12 22 15 19"/>
                              <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
                            </svg>
                          </div>
                        }
                      </div>
                    }

                    <!-- New text input area -->
                    @if (addingText() && activeTool() === 'add_text' && addingTextPage() === page.index) {
                      <textarea
                        #newTextArea
                        class="absolute resize-none rounded border-2 border-sky-500 bg-white/95 px-1 py-0.5 text-sm text-black outline-none shadow-md"
                        [style.left.px]="addTextPos().x * scale()"
                        [style.top.px]="addTextPos().y * scale()"
                        [style.min-width.px]="150 * scale()"
                        rows="3"
                        placeholder="Digite o texto…"
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

      <!-- ── Right Panel ────────────────────────────────────────────────── -->
      <div panel class="flex flex-col gap-4">
        @if (status() !== 'idle') {

          <!-- ── 1. Ferramentas ──────────────────────────────────────────── -->
          <app-panel [heading]="i18n.t()['pdf.title']">
            <div class="flex flex-col gap-1.5">
              @for (tool of editorTools; track tool.id) {
                <button
                  [class]="'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all w-full text-left ' + (activeTool() === tool.id ? 'bg-accent/12 text-accent border border-accent/25 shadow-sm' : 'text-muted border border-transparent hover:text-text hover:bg-raised')"
                  (click)="activeTool.set(tool.id)"
                >
                  <app-icon [name]="tool.icon" [size]="15" />
                  {{ i18n.t()[tool.labelKey] }}
                </button>
              }

              <div class="border-t border-line my-1"></div>

              <button
                class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all w-full text-left text-muted border border-transparent hover:text-text hover:bg-raised"
                [class.opacity-40]="undoStack().length === 0"
                [class.cursor-not-allowed]="undoStack().length === 0"
                [disabled]="undoStack().length === 0"
                (click)="undo()"
              >
                <app-icon name="undo" [size]="15" />
                Desfazer
              </button>
            </div>
          </app-panel>

          <!-- ── 2. Bloco selecionado ────────────────────────────────────────
               Painel próprio, logo abaixo das ferramentas: é o que o usuário
               quer ver no momento em que clica num texto. Antes ficava enterrado
               entre a paginação e o zoom. -->
          <app-panel heading="Bloco selecionado">
            @if (selectedBlock(); as id) {
              <div class="flex flex-col gap-3">

                <!-- Fonte -->
                <select
                  class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium outline-none hover:border-accent transition-colors cursor-pointer"
                  [value]="getBlockFont(id)"
                  (change)="changeBlockFont(id, $event)"
                  title="Família da fonte"
                >
                  <option value="Arial">Arial</option>
                  <option value="Helvetica">Helvetica</option>
                  <option value="TimesRoman">Times Roman</option>
                  <option value="Courier">Courier</option>
                  <option value="Symbol">Symbol</option>
                </select>

                <!-- Tamanho + negrito/itálico -->
                <div class="flex items-center gap-2">
                  <div class="flex flex-1 items-center rounded-lg border border-line bg-surface overflow-hidden">
                    <button class="px-2.5 py-2 text-muted hover:text-text hover:bg-raised transition-colors font-medium" (click)="changeBlockSize(id, -5)">−</button>
                    <input
                      type="text"
                      class="flex-1 text-sm font-medium tabular-nums text-center bg-transparent border-none outline-none py-2 min-w-0"
                      [value]="getBlockScalePercent(id)"
                      (change)="setBlockSizeFromInput(id, $event)"
                      (keydown.enter)="setBlockSizeFromInput(id, $event)"
                      title="Tamanho (%)"
                    />
                    <button class="px-2.5 py-2 text-muted hover:text-text hover:bg-raised transition-colors font-medium" (click)="changeBlockSize(id, 5)">+</button>
                  </div>

                  <button
                    class="h-9 w-9 flex items-center justify-center rounded-lg border text-sm font-bold font-serif transition-all shrink-0"
                    [class]="isBlockBold(id) ? 'bg-accent/15 border-accent/40 text-accent' : 'border-line text-muted hover:bg-raised hover:text-text'"
                    title="Negrito"
                    (mousedown)="$event.preventDefault()"
                    (click)="toggleBlockBold(id)"
                  >B</button>

                  <button
                    class="h-9 w-9 flex items-center justify-center rounded-lg border text-sm italic font-serif transition-all shrink-0"
                    [class]="isBlockItalic(id) ? 'bg-accent/15 border-accent/40 text-accent' : 'border-line text-muted hover:bg-raised hover:text-text'"
                    title="Itálico"
                    (mousedown)="$event.preventDefault()"
                    (click)="toggleBlockItalic(id)"
                  >I</button>
                </div>

                <!-- Alinhamento — o detector de layout acerta a maioria dos
                     casos, mas não todos; aqui se corrige à mão. -->
                <div class="flex flex-col gap-1.5">
                  <span class="text-[11px] font-semibold text-muted uppercase tracking-wider">Alinhamento</span>
                  <div class="flex items-center gap-1.5">
                    @for (opt of alignOptions; track opt.value) {
                      <button
                        class="h-9 flex-1 flex items-center justify-center rounded-lg border transition-all"
                        [class]="getBlockAlign(id) === opt.value ? 'bg-accent/15 border-accent/40 text-accent' : 'border-line text-muted hover:bg-raised hover:text-text'"
                        [title]="opt.label"
                        [attr.aria-label]="opt.label"
                        [attr.aria-pressed]="getBlockAlign(id) === opt.value"
                        (mousedown)="$event.preventDefault()"
                        (click)="setBlockAlign(id, opt.value)"
                      >
                        <app-icon [name]="opt.icon" [size]="15" />
                      </button>
                    }
                  </div>
                </div>

                <!-- Cores -->
                <div class="flex flex-col gap-1.5">
                  <span class="text-[11px] font-semibold text-muted uppercase tracking-wider">Cores</span>
                  <div class="flex items-center gap-2">
                    <div class="flex-1 relative h-9 rounded-lg border border-line hover:border-accent overflow-hidden transition-colors" title="Cor do texto">
                      <input type="color" class="absolute -top-2 -left-2 h-14 w-full cursor-pointer border-0 p-0 opacity-0" [value]="getBlockColor(id)" (input)="changeBlockColor(id, $event)" />
                      <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                        <app-icon name="text" [size]="12" class="text-text opacity-70" />
                        <div class="h-2 w-7 rounded-sm" [style.background]="getBlockColor(id)"></div>
                      </div>
                    </div>

                    <div class="flex-1 relative h-9 rounded-lg border border-line hover:border-accent overflow-hidden transition-colors" title="Cor de fundo">
                      <input type="color" class="absolute -top-2 -left-2 h-14 w-full cursor-pointer border-0 p-0 opacity-0" [value]="getBlockBgColor(id)" (input)="changeBlockBgColor(id, $event)" />
                      <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-0.5">
                        <app-icon name="square" [size]="12" class="text-text opacity-70" />
                        <div class="h-2 w-7 rounded-sm" [style.background]="getBlockBgColor(id)"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="border-t border-line my-0.5"></div>

                <button appButton variant="danger" size="sm" block (click)="deleteBlock(id)">
                  <app-icon name="close" [size]="13" />
                  Apagar bloco
                </button>
                <button appButton variant="ghost" size="sm" block (click)="selectedBlock.set(null)">
                  Desselecionar
                </button>
              </div>
            } @else {
              <!-- Estado vazio: o painel some quando nada está selecionado fazia
                   parecer que os controles tinham desaparecido. -->
              <p class="text-xs text-muted leading-relaxed">
                Clique num bloco de texto da página para trocar fonte, tamanho,
                alinhamento e cor. Com o bloco selecionado, clique de novo no
                texto para editá-lo.
              </p>
            }
          </app-panel>

          <!-- ── 3. Visualização ──────────────────────────────────────────────
               Paginação e zoom são navegação, não edição; juntos e depois do que
               edita. Guardado por loadedPdf(), não por status(): o painel abre
               em 'loading', quando ainda não há documento. -->
          @if (loadedPdf(); as pdf) {
            <app-panel heading="Visualização">
              <div class="flex flex-col gap-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted font-medium">Página {{ currentPage() }} de {{ pdf.pageCount }}</span>
                  <div class="flex items-center gap-1">
                    <button class="h-7 w-7 flex items-center justify-center rounded-lg border border-line text-muted hover:text-text hover:bg-raised transition-colors disabled:opacity-30" [disabled]="currentPage() <= 1" (click)="goToPage(currentPage() - 1)" aria-label="Página anterior">‹</button>
                    <button class="h-7 w-7 flex items-center justify-center rounded-lg border border-line text-muted hover:text-text hover:bg-raised transition-colors disabled:opacity-30" [disabled]="currentPage() >= pdf.pageCount" (click)="goToPage(currentPage() + 1)" aria-label="Próxima página">›</button>
                  </div>
                </div>

                <div class="flex items-center rounded-lg border border-line bg-surface overflow-hidden">
                  <button class="px-3 py-2 text-muted hover:text-text hover:bg-raised transition-colors font-medium" (click)="zoom(-0.1)" aria-label="Diminuir zoom">−</button>
                  <input
                    type="text"
                    class="flex-1 text-sm font-medium tabular-nums text-center bg-transparent border-none outline-none py-2 min-w-0"
                    [value]="(scale() * 100) | number:'1.0-0'"
                    (change)="setZoomFromInput($event)"
                    (keydown.enter)="setZoomFromInput($event)"
                    title="Zoom %"
                  />
                  <span class="text-xs text-muted pr-2 select-none">%</span>
                  <button class="px-3 py-2 text-muted hover:text-text hover:bg-raised transition-colors font-medium" (click)="zoom(0.1)" aria-label="Aumentar zoom">+</button>
                </div>
              </div>
            </app-panel>
          }

          <!-- ── 4. Reconhecimento de texto ───────────────────────────────────
               Só aparece quando há página digitalizada. Num PDF que já tem
               camada de texto o OCR não roda sozinho, e forçá-lo empilharia
               blocos reconhecidos por cima dos nativos — a opção estava sempre
               visível oferecendo algo que ou não fazia nada ou piorava. -->
          @if (showOcrPanel()) {
            <app-panel heading="Reconhecimento de texto">
              <div class="flex flex-col gap-2.5">
                <p class="text-xs text-muted leading-relaxed">
                  @if (currentPageIsScanned()) {
                    Esta página é uma imagem digitalizada — o texto foi lido por OCR e pode conter erros.
                  } @else {
                    Este documento tem páginas digitalizadas. Esta aqui já tem texto digital.
                  }
                </p>

                <select
                  class="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium outline-none hover:border-accent transition-colors cursor-pointer"
                  [(ngModel)]="ocrLangValue"
                  title="Idioma do reconhecimento"
                >
                  <option value="por+eng">Português + Inglês</option>
                  <option value="por">Português</option>
                  <option value="eng">Inglês</option>
                </select>

                <button
                  appButton variant="secondary" size="sm" block
                  [disabled]="ocrRunning()"
                  (click)="forceOcrOnCurrentPage()"
                  title="Reconhece o texto da página atual de novo"
                >
                  <app-icon name="scan" [size]="13" />
                  Reconhecer esta página
                </button>

                <span class="text-[10px] text-muted/70">Tesseract.js — roda no seu navegador</span>
              </div>
            </app-panel>
          }

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

  /**
   * Falha ao rasterizar uma ou mais páginas. Não é fatal — o editor continua
   * utilizável porque o overlay de texto vira texto preto visível — mas é o
   * estado em que a página perde logos, tabelas e bordas, e sem aviso ele se
   * parece com "o editor comeu meu documento".
   */
  protected readonly renderWarning = signal<string | null>(null);
  protected readonly loadedPdf = signal<LoadedPdf | null>(null);
  protected readonly currentPage = signal(1);
  protected readonly scale = signal(1.0);
  protected readonly isLightColor = isLightColor;
  protected readonly canvasRendered = signal<Set<number>>(new Set());

  /** O ajuste à largura é só na primeira renderização; depois o zoom é do usuário. */
  private didFitWidth = false;
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

  protected readonly currentPageIsScanned = computed(() => this.currentPageInfo()?.type === 'scanned');

  /**
   * O painel de OCR só faz sentido num documento que tenha alguma página
   * digitalizada.
   *
   * Num PDF que já traz camada de texto o OCR nunca roda sozinho, e forçá-lo
   * empilharia blocos reconhecidos por cima dos nativos — texto duplicado, pior
   * do que antes. A opção ficava sempre visível oferecendo algo que, no caso
   * mais comum, ou não fazia nada ou estragava a página.
   */
  protected readonly showOcrPanel = computed(() => this.loadedPdf()?.overallType !== 'digital');

  protected readonly alignOptions = [
    { value: 'left' as const, icon: 'alignLeft' as const, label: 'Alinhar à esquerda' },
    { value: 'center' as const, icon: 'alignCenter' as const, label: 'Centralizar' },
    { value: 'right' as const, icon: 'alignRight' as const, label: 'Alinhar à direita' },
    { value: 'justify' as const, icon: 'alignJustify' as const, label: 'Justificar' },
  ];

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
    this.canvasRendered.set(new Set());
    this.resetRasterState();
    this.renderWarning.set(null);
    this.passwordError.set(null);
    this.pendingFile.set(file);

    try {
      const pdf = await this.loader.load(file, password);
      this.loadedPdf.set(pdf);
      this.currentPage.set(1);
      this.pdfPassword.set(password ?? null);
      this.pdfProtected.set(false);

      // Seed edits from digital pages' native text, merged into Acrobat-style paragraph blocks.
      const newEdits = new Map<string, TextEdit>();
      for (const page of pdf.pages) {
        if (page.type === 'digital' && page.nativeBlocks.length > 0) {
          const mergedBlocks = mergeNativeParagraphs(page.nativeBlocks);
          for (let i = 0; i < mergedBlocks.length; i++) {
            const b = mergedBlocks[i];
            const id = `p${page.index}-native-${i}`;

            const lineCount = Math.max(1, b.lineCount || 1);
            // Corpo da fonte = caixa de UMA linha, medida pelo merger. Antes vinha
            // de `h / lineCount`, que é o passo médio (caixa + entrelinha) e por
            // isso vinha grande demais — daí o 0.72 de compensação em blocos
            // multilinha, que encolhia o texto em relação ao original.
            const singleLineHPx = b.lineBoxH * page.height;
            // O texto agora carrega as quebras reais ('\n'), então NENHUMA linha
            // pode estourar a largura: com pre-wrap, uma linha que estoura vira
            // duas e empurra todo o resto do bloco para baixo. Daí o mínimo sobre
            // todas as linhas, e não sobre a mais longa em caracteres — a mais
            // longa em caracteres nem sempre é a mais larga em pixels.
            const hint = singleLineHPx * 0.85;
            const availWidthPx = b.w * page.width;
            const fontStack = FONT_STACKS[b.fontFamily ?? 'Helvetica'];
            let calculatedFontSize = b.lineTexts.reduce(
              (min, lineText) =>
                Math.min(min, fitFontSizeToWidth(lineText, availWidthPx, hint, b.bold ?? false, fontStack)),
              hint,
            );

            // `fitFontSizeToWidth` aceita até 5% de folga sem ajustar, para não
            // oscilar. Aqui a folga tem de ser zero: qualquer linha mais larga
            // que a caixa quebra em duas e empurra o bloco inteiro para baixo.
            // Mede e corrige o corpo, em vez de compensar alargando a caixa.
            const widest = Math.max(
              ...b.lineTexts.map((t) => measureTextWidth(t, calculatedFontSize, b.bold ?? false, fontStack)),
            );
            if (widest > availWidthPx && widest > 0) {
              calculatedFontSize *= availWidthPx / widest;
            }

            // Com o corpo medido, 1% de folga basta. Era 6% para absorver a
            // tolerância acima, e uma caixa 6% mais larga que o texto desloca
            // blocos centralizados e estica os justificados para fora da margem
            // original. Blocos centralizados crescem para os dois lados.
            const grownW = Math.min(0.99 - b.x, b.w * 1.01);
            const isCentered = (b.textAlign ?? 'left') === 'center';
            const blockW = grownW;
            const blockX = isCentered ? Math.max(0, b.x - (grownW - b.w) / 2) : b.x;

            const blockObj = {
              id,
              pageIndex: page.index,
              x: blockX,
              y: b.y,
              w: blockW,
              h: b.h,
              lineHeight: b.lineHeight,
              originalText: b.text,
              formattedText: b.formattedText,
              newText: null,
              deleted: false,
              bold: b.bold ?? false,
              italic: b.italic ?? false,
              textAlign: b.textAlign ?? 'left',
              fontFamily: b.fontFamily as TextEdit['fontFamily'] ?? 'Helvetica',
              // Cor: preserva cor extraída do PDF se válida e não-preta; se não houver, deixa undefined para amostragem no canvas.
              color: (b.textColor && b.textColor !== '#000000' && !isLightColor(b.textColor)) ? b.textColor : undefined,
              source: 'native' as const,
              baseFontSize: calculatedFontSize,
            };
            newEdits.set(id, blockObj);
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
            const lineCount = Math.max(1, b.lineCount || 1);
            const singleLineHPx = (b.h / lineCount) * page.height;
            let calculatedFontSize = singleLineHPx * 0.82;
            if (lineCount === 1) {
              const availWidthPx = b.w * page.width;
              calculatedFontSize = Math.min(singleLineHPx * 0.85, fitFontSizeToWidth(b.text, availWidthPx, singleLineHPx * 0.85, b.bold ?? false));
            }
            const blockObj = {
              id, pageIndex: page.index,
              x: b.x, y: b.y, w: b.w, h: b.h,
              lineHeight: b.h / lineCount,
              originalText: b.text,
              newText: null, deleted: false,
              bold: b.bold ?? false,
              textAlign: b.textAlign ?? 'left',
              source: 'ocr' as const,
              baseFontSize: calculatedFontSize,
            };
            newEdits.set(id, blockObj);
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
    const pageH = pageInfo ? pageInfo.height : 842;
    const pageW = pageInfo ? pageInfo.width : 595;

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

          const lineCount = Math.max(1, b.lineCount || 1);
          const singleLineHPx = (b.h / lineCount) * pageH;
          let calculatedFontSize = singleLineHPx * 0.82;
          if (lineCount === 1) {
            const availWidthPx = b.w * pageW;
            calculatedFontSize = Math.min(singleLineHPx * 0.85, fitFontSizeToWidth(b.text, availWidthPx, singleLineHPx * 0.85, b.bold ?? false));
          }

          newEdits.set(id, {
            id, pageIndex: pageIdx,
            x: b.x, y: b.y, w: b.w, h: b.h,
            lineHeight: b.h / lineCount,
            originalText: b.text,
            color: textColor,
            newText: null, deleted: false,
            bold: b.bold ?? false,
            textAlign: b.textAlign ?? 'left',
            source: 'ocr' as const,
            baseFontSize: calculatedFontSize,
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

  // ── Rasterização sob demanda ───────────────────────────────────────────────
  //
  // Só as páginas perto da viewport ficam rasterizadas; as que se afastam têm o
  // backing store liberado. É isso que desacopla a nitidez do tamanho do
  // documento: enquanto todas as páginas eram rasterizadas de uma vez, a única
  // defesa contra estourar a memória de canvas era baixar a escala em função do
  // número de páginas — e um edital de 20 páginas saía a 1.5×, com cara de fax.
  // Com a janela fixa, o orçamento de pixels passa a ser dividido por
  // RENDER_WINDOW e não por `pageCount`, então um documento de 200 páginas
  // rasteriza tão nítido quanto um de duas.
  //
  // Uma página descartada não fica em branco: `canvasRendered` perde a entrada,
  // o overlay volta a desenhar o texto em preto e a página continua legível e
  // editável até ser rasterizada de novo.

  /** Páginas rasterizadas ao mesmo tempo: as visíveis mais a folga de PREFETCH. */
  private static readonly RENDER_WINDOW = 6;
  /** Quantas páginas além das visíveis já vão rasterizadas, para a rolagem não alcançar. */
  private static readonly PREFETCH = 1;

  private viewportObserver: IntersectionObserver | null = null;
  private readonly visiblePages = new Set<number>();
  /** Página → zoom com que o raster dela foi produzido. */
  private readonly rasterScale = new Map<number, number>();
  private readonly failedPages = new Set<number>();
  private renderInFlight = false;
  private renderQueued = false;

  /**
   * Liga o observador de viewport. Substitui o antigo laço que rasterizava tudo.
   */
  private async renderAllPages(): Promise<void> {
    const pdf = this.loadedPdf();
    if (!pdf) return;

    // Retry up to 60 times (3.0s) for Angular to complete DOM mounting of all page canvases
    for (let attempt = 0; attempt < 60; attempt++) {
      if (this.pageCanvases && this.pageCanvases.length === pdf.pages.length) {
        break;
      }
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    if (!this.pageCanvases || this.pageCanvases.length === 0) return;

    // Calculate initial scale to fit width (only on first load).
    // O contêiner de rolagem usa `overflow-auto`; o seletor procurava
    // `.overflow-y-auto` e nunca casava, então o ajuste à largura nunca rodava.
    const container = this.pageCanvases.first.nativeElement.closest('.overflow-auto') as HTMLElement | null;
    if (!this.didFitWidth) {
      this.didFitWidth = true;
      if (container && pdf.pages[0]) {
        const availableWidth = container.clientWidth - 80; // p-6 padding + margin
        if (pdf.pages[0].width > availableWidth) {
          const initialScale = availableWidth / pdf.pages[0].width;
          this.scale.set(Math.round(initialScale * 100) / 100);
        }
      }
    }

    this.viewportObserver?.disconnect();
    this.visiblePages.clear();

    this.viewportObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLCanvasElement).dataset['page']);
          if (!idx) continue;
          if (entry.isIntersecting) this.visiblePages.add(idx);
          else this.visiblePages.delete(idx);
        }
        void this.pumpRenderQueue();
      },
      {
        root: container,
        // Meia viewport de folga em cima e embaixo: a página começa a rasterizar
        // antes de aparecer, então a rolagem normal não alcança o rasterizador.
        rootMargin: '50% 0px',
        threshold: 0,
      },
    );

    for (const ref of this.pageCanvases) {
      this.viewportObserver.observe(ref.nativeElement);
    }

    // O observador só dispara no próximo frame; a primeira página não pode
    // esperar por isso.
    this.visiblePages.add(this.currentPage());
    await this.pumpRenderQueue();
  }

  /** Zoom que o raster precisa ter agora, dado o zoom de exibição. */
  private currentRasterScale(pdf: LoadedPdf): number {
    const first = pdf.pages[0];
    if (!first) return 2;
    return pageRenderScale({
      pageWidth: first.width,
      pageHeight: first.height,
      // A janela, não o documento: é o que mantém a nitidez constante.
      pageCount: Math.min(PdfComponent.RENDER_WINDOW, pdf.pages.length),
      displayScale: this.scale(),
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    });
  }

  /** Páginas que devem estar rasterizadas agora, da mais central para a mais distante. */
  private wantedPages(pageCount: number): number[] {
    const visible = [...this.visiblePages].sort((a, b) => a - b);
    if (visible.length === 0) return [this.currentPage()];

    const wanted = new Set(visible);
    for (let d = 1; d <= PdfComponent.PREFETCH; d++) {
      wanted.add(Math.max(1, visible[0] - d));
      wanted.add(Math.min(pageCount, visible[visible.length - 1] + d));
    }

    const centre = (visible[0] + visible[visible.length - 1]) / 2;
    return [...wanted]
      .sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre))
      .slice(0, PdfComponent.RENDER_WINDOW);
  }

  /**
   * Rasteriza o que falta e descarta o que saiu da janela, uma página por vez.
   *
   * Sequencial e com mutex de propósito: duas rasterizações no mesmo canvas se
   * atropelam, porque a segunda redefine `width` — o que limpa — enquanto a
   * primeira ainda desenha. A lista de páginas desejadas é recalculada a cada
   * volta, então uma rolagem rápida no meio do processo redireciona o trabalho
   * em vez de esperar a fila antiga terminar.
   */
  private async pumpRenderQueue(): Promise<void> {
    const pdf = this.loadedPdf();
    if (!pdf) return;

    if (this.renderInFlight) {
      this.renderQueued = true;
      return;
    }
    this.renderInFlight = true;

    try {
      for (;;) {
        const scale = this.currentRasterScale(pdf);
        const wanted = this.wantedPages(pdf.pages.length);
        this.evictOutside(wanted);

        const next = wanted.find(
          (p) => !this.failedPages.has(p) && !this.isRasterFresh(p, scale),
        );
        if (next === undefined) break;

        await this.rasterise(pdf, next, scale);
      }
    } finally {
      this.renderInFlight = false;
      if (this.renderQueued) {
        this.renderQueued = false;
        void this.pumpRenderQueue();
      }
    }
  }

  /**
   * Um raster serve se foi feito no zoom atual ou acima. Ampliar exige refazer;
   * reduzir não, porque o raster grande já está alocado e continua nítido — e
   * refazê-lo para baixo só gastaria trabalho no caminho de volta.
   */
  private isRasterFresh(pageIndex: number, needed: number): boolean {
    const have = this.rasterScale.get(pageIndex);
    return have !== undefined && have >= needed / 1.2;
  }

  private canvasFor(pageIndex: number): HTMLCanvasElement | null {
    return (
      this.pageCanvases?.find((c) => Number(c.nativeElement.dataset['page']) === pageIndex)
        ?.nativeElement ?? null
    );
  }

  private async rasterise(pdf: LoadedPdf, pageIndex: number, scale: number): Promise<void> {
    const target = this.canvasFor(pageIndex);
    if (!target) return;

    try {
      if (this.rasterScale.has(pageIndex)) {
        // Já tem imagem na tela (re-render por zoom). Definir `width` limpa o
        // canvas, então rasteriza fora e transfere de uma vez — senão a página
        // pisca em branco no meio da leitura.
        const off = await renderPageToCanvas(pdf.doc, pageIndex, scale);
        target.width = off.width;
        target.height = off.height;
        target.getContext('2d')!.drawImage(off, 0, 0);
        releaseCanvas(off);
      } else {
        // Primeira rasterização: direto no canvas do DOM, sem canvas
        // intermediário — não há nada na tela para preservar.
        await renderPageIntoCanvas(pdf.doc, pageIndex, scale, target);
      }

      this.rasterScale.set(pageIndex, scale);
      const rendered = new Set(this.canvasRendered());
      rendered.add(pageIndex);
      this.canvasRendered.set(rendered);
    } catch (err) {
      console.error(`[PdfComponent] Error rendering canvas for page ${pageIndex}:`, err);
      // Marca para o laço não ficar tentando a mesma página para sempre.
      this.failedPages.add(pageIndex);
    }

    this.publishRenderWarning();
  }

  /** Libera o backing store das páginas que saíram da janela. */
  private evictOutside(wanted: number[]): void {
    const keep = new Set(wanted);
    let changed = false;
    const rendered = new Set(this.canvasRendered());

    for (const pageIndex of [...this.rasterScale.keys()]) {
      if (keep.has(pageIndex)) continue;
      const canvas = this.canvasFor(pageIndex);
      if (canvas) releaseCanvas(canvas);
      this.rasterScale.delete(pageIndex);
      rendered.delete(pageIndex);
      changed = true;
    }

    if (changed) this.canvasRendered.set(rendered);
  }

  /** Zera o estado de rasterização ao trocar de documento ou ao reiniciar. */
  private resetRasterState(): void {
    this.viewportObserver?.disconnect();
    this.viewportObserver = null;
    this.visiblePages.clear();
    this.rasterScale.clear();
    this.failedPages.clear();
    this.didFitWidth = false;
  }

  private publishRenderWarning(): void {
    const failed = [...this.failedPages].sort((a, b) => a - b);
    this.renderWarning.set(
      failed.length === 0
        ? null
        : `Não foi possível desenhar ${failed.length === 1 ? 'a página ' + failed[0] : failed.length + ' páginas'}. ` +
          `O texto continua editável, mas imagens, tabelas e bordas não aparecem no editor. ` +
          `Elas continuam intactas no arquivo exportado.`,
    );
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
    this.scheduleZoomRerender();
  }

  /**
   * Re-rasteriza quando o zoom passa do que o raster atual aguenta.
   *
   * Sem isso o canvas é rasterizado uma vez, no zoom inicial, e ampliar só
   * estica esses pixels: o texto do canvas embaça enquanto o texto HTML de um
   * bloco selecionado continua vetorial — lado a lado, parece que o editor
   * degradou o documento.
   *
   * Quem decide se o raster de cada página ainda serve é `isRasterFresh`; aqui
   * só há o debounce, para esperar o usuário parar de ampliar em vez de refazer
   * o raster a cada passo da roda.
   */
  private zoomRerenderTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleZoomRerender(): void {
    if (this.zoomRerenderTimer !== null) clearTimeout(this.zoomRerenderTimer);
    this.zoomRerenderTimer = setTimeout(() => {
      this.zoomRerenderTimer = null;
      void this.pumpRenderQueue();
    }, 400);
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
      this.scheduleZoomRerender();
    }
    input.value = Math.round(this.scale() * 100).toString();
  }

  // ── Dragging ───────────────────────────────────────────────────────────────

  private dragState: {
    id: string;
    mode: 'move' | ResizeHandle;
    startX: number; startY: number;
    blockX: number; blockY: number;
    blockW: number; blockH: number;
  } | null = null;

  protected startDragBlock(id: string, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    const block = this.edits().get(id);
    if (!block) return;
    this.saveHistory();
    this.dragState = {
      id, mode: 'move',
      startX: event.clientX, startY: event.clientY,
      blockX: block.x, blockY: block.y,
      blockW: block.w, blockH: block.h
    };
  }

  protected startResize(id: string, handle: ResizeHandle, event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    const block = this.edits().get(id);
    if (!block) return;
    this.saveHistory();
    this.dragState = {
      id, mode: handle,
      startX: event.clientX, startY: event.clientY,
      blockX: block.x, blockY: block.y,
      blockW: block.w, blockH: block.h
    };
  }

  @HostListener('window:mousemove', ['$event'])
  protected onMouseMove(e: MouseEvent): void {
    if (!this.dragState) return;
    const { id, mode, startX, startY, blockX, blockY, blockW, blockH } = this.dragState;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const block = this.edits().get(id);
    if (!block) return;
    const pageInfo = this.loadedPdf()?.pages.find(p => p.index === block.pageIndex);
    if (!pageInfo) return;

    const scale = this.scale();
    const containerW = pageInfo.width * scale;
    const containerH = pageInfo.height * scale;

    const dxNorm = dx / containerW;
    const dyNorm = dy / containerH;

    let newX = blockX;
    let newY = blockY;
    let newW = blockW;
    let newH = blockH;

    if (mode === 'move') {
      newX = blockX + dxNorm;
      newY = blockY + dyNorm;
    } else {
      if (mode.includes('w')) {
        newX = blockX + dxNorm;
        newW = blockW - dxNorm;
      }
      if (mode.includes('e')) {
        newW = blockW + dxNorm;
      }
      if (mode.includes('n')) {
        newY = blockY + dyNorm;
        newH = blockH - dyNorm;
      }
      if (mode.includes('s')) {
        newH = blockH + dyNorm;
      }
      // Ensure positive width/height
      if (newW < 0.01) { newX += newW - 0.01; newW = 0.01; }
      if (newH < 0.01) { newY += newH - 0.01; newH = 0.01; }
    }

    const newEdits = new Map(this.edits());
    newEdits.set(id, { ...block, x: newX, y: newY, w: newW, h: newH, styleModified: true, newText: block.newText ?? block.originalText });
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
      source: 'user' as const,
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

        // Amostra a cor real do texto no canvas se o estilo não tiver sido alterado manualmente pelo usuário.
        // Preserva a cor original do PDF (ex: azul em "CERTIFICADO") ao clicar no bloco.
        if (!block.styleModified || !block.color) {
          const textColor = this.inpainting.sampleTextColor(
            canvas,
            block.x,
            block.y,
            block.w,
            block.h,
            result.bgColor
          );
          const hexMatch = textColor.match(/[0-9a-f]{2}/gi);
          let detectedColor = block.color;
          if (hexMatch && hexMatch.length >= 3) {
            const lum = 0.299 * parseInt(hexMatch[0], 16)
                      + 0.587 * parseInt(hexMatch[1], 16)
                      + 0.114 * parseInt(hexMatch[2], 16);
            if (lum < 200) {
              detectedColor = textColor;
            }
          }

          const newEdits = new Map(this.edits());
          newEdits.set(id, {
            ...block,
            color: detectedColor,
          });
          this.edits.set(newEdits);
        }
      }
    }
  }

  protected getBlockHtml(block: TextEdit): string {
    const raw = block.newText !== null ? block.newText : (block.formattedText || block.originalText);
    return block.textAlign === 'justify' ? this.asJustifiedLines(raw) : raw;
  }

  /**
   * Reescreve um texto com quebras rígidas como uma linha por `<div>`, com
   * `text-align-last: justify` em todas menos a última.
   *
   * `text-align: justify` sozinho não faz nada aqui, e isso é o CSS funcionando
   * como especificado: a propriedade não estica a última linha de um bloco nem a
   * linha imediatamente antes de uma quebra forçada. Como o texto carrega as
   * quebras reais do PDF, **toda** linha vem antes de uma quebra forçada — então
   * todas são "última linha" e nenhuma é justificada. Era por isso que o botão
   * não fazia nada.
   *
   * Pôr `text-align-last: justify` no container resolveria isso e criaria outro
   * problema: esticaria também a última linha de verdade, que é curta, e uma
   * última linha esticada é a marca registrada de justificação mal feita. Daí
   * uma linha por elemento, e a última fica de fora.
   */
  private asJustifiedLines(raw: string): string {
    // Já editado pelo usuário: o contenteditable produz o próprio markup de
    // linhas (<div>/<br>), e reescrevê-lo destruiria a edição.
    if (/<div|<br/i.test(raw)) return raw;

    const lines = raw.split('\n');
    if (lines.length < 2) return raw;

    // Sem atributos: o sanitizador de `[innerHTML]` do Angular remove `style`,
    // então quem aplica o `text-align-last` é a regra `.pdf-justified > div` em
    // styles.css, ligada pela classe do container — que é binding de template e
    // não passa pelo sanitizador.
    return lines.map((line) => `<div>${line || '<br>'}</div>`).join('');
  }

  protected onBlockBlur(event: FocusEvent, id: string): void {
    const el = event.target as HTMLElement;
    const html = el.innerHTML?.trim() || '';
    const text = el.textContent?.trim() || '';

    const block = this.edits().get(id);
    if (block) {
      const currentHtml = (block.newText ?? block.formattedText ?? block.originalText).trim();
      if (html !== currentHtml && text.length > 0) {
        this.saveHistory();
        const newEdits = new Map(this.edits());
        newEdits.set(id, { ...block, newText: html });
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
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = document.querySelector(`[data-block-id="${id}"]`);
      if (container && container.contains(range.commonAncestorContainer)) {
        document.execCommand('bold', false);
        const newHtml = (container as HTMLElement).innerHTML;
        const block = this.edits().get(id);
        if (block) {
          this.saveHistory();
          const newEdits = new Map(this.edits());
          newEdits.set(id, { ...block, newText: newHtml, styleModified: true });
          this.edits.set(newEdits);
        }
        return;
      }
    }

    const block = this.edits().get(id);
    if (block) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      newEdits.set(id, {
        ...block,
        bold: !block.bold,
        styleModified: true,
        newText: block.newText ?? block.formattedText ?? block.originalText,
      });
      this.edits.set(newEdits);
    }
  }

  protected getBaseFontSize(block: TextEdit, pageHeight: number, pageWidth: number): number {
    return baseFontSize(block, pageHeight, pageWidth);
  }

  protected getBlockFontPx(block: TextEdit, pageHeight: number, pageWidth: number): number {
    return (block.baseFontSize || this.getBaseFontSize(block, pageHeight, pageWidth)) * (block.fontScale || 1.0);
  }

  protected getBlockLineHeightPx(block: TextEdit, pageHeight: number): number {
    if (block.lineHeight) {
      return block.lineHeight * pageHeight * (block.fontScale || 1.0);
    }
    return (block.baseFontSize || this.getBaseFontSize(block, pageHeight, pageHeight)) * (block.fontScale || 1.0) * 1.2;
  }

  /**
   * Deslocamento vertical (px de página, negativo) do container de texto dentro
   * da bbox do bloco.
   *
   * `block.y` é o topo do glifo da PRIMEIRA linha, medido no PDF. O browser, por
   * outro lado, centraliza a caixa de conteúdo (~1.15em) dentro da `line-height`
   * — e a `line-height` aqui é o passo entre baselines do PDF, que é maior que
   * 1.15em. Essa meia-entrelinha empurraria o bloco inteiro para baixo; aqui ela
   * é descontada. Em blocos de uma linha só o valor é ~0.
   */
  /** Pilha CSS da família do bloco — ver FONT_STACKS. */
  protected getBlockFontStack(block: TextEdit): string {
    return FONT_STACKS[block.fontFamily ?? 'Helvetica'] ?? FONT_STACKS.Helvetica;
  }

  protected getBlockTextTopPx(block: TextEdit, pageHeight: number, pageWidth: number): number {
    const lineHeightPx = this.getBlockLineHeightPx(block, pageHeight);
    const fontPx = this.getBlockFontPx(block, pageHeight, pageWidth);
    return -Math.max(0, (lineHeightPx - fontPx * 1.15) / 2);
  }

  protected getBlockScalePercent(id: string): string {
    const block = this.edits().get(id);
    if (!block) return '100%';
    const pct = Math.round((block.fontScale || 1.0) * 100);
    return `${pct}%`;
  }

  protected changeBlockSize(id: string, deltaPercent: number): void {
    const block = this.edits().get(id);
    if (block) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      const currentScale = block.fontScale || 1.0;
      const nextScale = Math.max(0.3, Math.min(3.0, Math.round((currentScale + deltaPercent / 100) * 100) / 100));
      newEdits.set(id, { ...block, fontScale: nextScale, styleModified: true, newText: block.newText ?? block.formattedText ?? block.originalText });
      this.edits.set(newEdits);
    }
  }

  protected setBlockSizeFromInput(id: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace('%', '').trim();
    const val = parseFloat(raw);
    const block = this.edits().get(id);
    if (block && !isNaN(val)) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      const nextScale = Math.max(0.3, Math.min(3.0, Math.round(val) / 100));
      newEdits.set(id, { ...block, fontScale: nextScale, styleModified: true, newText: block.newText ?? block.formattedText ?? block.originalText });
      this.edits.set(newEdits);
    }
    input.value = this.getBlockScalePercent(id);
  }

  protected isBlockItalic(id: string): boolean {
    return this.edits().get(id)?.italic ?? false;
  }

  protected getBlockAlign(id: string): NonNullable<TextEdit['textAlign']> {
    return this.edits().get(id)?.textAlign ?? 'left';
  }

  /**
   * Define o alinhamento do bloco à mão.
   *
   * O `mergeNativeParagraphs` infere centralizado/justificado pela geometria —
   * margens simétricas, centros de linha coincidentes, largura de margem a
   * margem. Isso acerta a maioria dos casos e erra nos ambíguos, que são
   * justamente os que o usuário nota. Daí o controle manual.
   *
   * Marca `styleModified` e materializa `newText`: sem isso o bloco continuaria
   * "intocado" e o exporter não redesenharia nada, então o alinhamento sumiria
   * no arquivo final.
   */
  protected setBlockAlign(id: string, align: NonNullable<TextEdit['textAlign']>): void {
    const block = this.edits().get(id);
    if (!block || block.textAlign === align) return;

    this.saveHistory();
    const newEdits = new Map(this.edits());
    newEdits.set(id, {
      ...block,
      textAlign: align,
      styleModified: true,
      newText: block.newText ?? block.formattedText ?? block.originalText,
    });
    this.edits.set(newEdits);
  }

  protected toggleBlockItalic(id: string): void {
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = document.querySelector(`[data-block-id="${id}"]`);
      if (container && container.contains(range.commonAncestorContainer)) {
        document.execCommand('italic', false);
        const newHtml = (container as HTMLElement).innerHTML;
        const block = this.edits().get(id);
        if (block) {
          this.saveHistory();
          const newEdits = new Map(this.edits());
          newEdits.set(id, { ...block, newText: newHtml, styleModified: true });
          this.edits.set(newEdits);
        }
        return;
      }
    }

    const block = this.edits().get(id);
    if (block) {
      this.saveHistory();
      const newEdits = new Map(this.edits());
      newEdits.set(id, {
        ...block,
        italic: !block.italic,
        styleModified: true,
        newText: block.newText ?? block.formattedText ?? block.originalText,
      });
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
    this.canvasRendered.set(new Set());
    this.resetRasterState();
    this.renderWarning.set(null);
    this.selectedBlock.set(null);
  }

  ngOnDestroy(): void {
    void this.ocr.terminate();
    this.viewportObserver?.disconnect();
    if (this.zoomRerenderTimer !== null) clearTimeout(this.zoomRerenderTimer);
    if (this.zoomAnimFrame !== null) cancelAnimationFrame(this.zoomAnimFrame);
  }
}
