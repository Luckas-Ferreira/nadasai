import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslationService, type TranslationKey } from '../../../core/services/translation.service';
import { toMessageKey } from '../../../core/errors';
import {
  closePdf,
  openPdf,
  pageRenderScale,
  releaseCanvas,
  renderPageToCanvas,
} from '../../../core/pdf/pdfjs';
import { canvasToBlob } from '../../../core/image/image-file.util';
import type { RedactMode, Region } from '../../../core/geometry/region';
import { ObjectUrlScope } from '../../../core/image/object-url';
import { saveBlob } from '../../../core/image/download';
import { PdfRedactorService, type RedactPdfResult } from './services/pdf-redactor.service';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { AlertComponent } from '../../../shared/ui/alert.component';
import { ActionBarComponent } from '../../../shared/ui/action-bar.component';
import { RegionOverlayComponent } from '../../../shared/ui/region-overlay.component';
import { PdfPasswordPromptComponent } from '../../../shared/ui/pdf-password-prompt.component';
import { SegmentedComponent, type SegmentOption } from '../../../shared/ui/segmented.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';

/**
 * Fator do tamanho de EXIBIÇÃO a 100%, não da rasterização.
 *
 * Era `PREVIEW_SCALE = 1.4` e fazia os dois papéis ao mesmo tempo: definia o
 * tamanho na tela E a resolução do raster. Agora o raster vem de
 * `pageRenderScale()`, derivado do zoom, e isto sobrou só para o layout —
 * mantido em 1.4 para que 100% continue exatamente do tamanho de antes.
 */
const FIT_SCALE = 1.4;

/** Altura do palco a 100%. Era o `max-h-[60vh]` que estava no template. */
const FIT_VH = 60;

/**
 * Zoom em degraus, não contínuo.
 *
 * Cada degrau pode disparar uma re-rasterização da página, e um slider
 * transformaria um arrasto em dezenas delas. Com degraus o re-render é um por
 * clique, deliberado, e não precisa de debounce.
 */
export const ZOOM_STEPS: readonly number[] = [0.5, 0.75, 1, 1.5, 2, 3, 4];

/** O degrau "ajustado à página" — o estado inicial e o do botão de reset. */
export const FIT_ZOOM = 1;

/**
 * Próximo degrau na direção pedida, saturando nas pontas.
 *
 * Pura e exportada porque o clamp é a parte que quebra em silêncio: passar do
 * fim do array devolve `undefined`, o zoom vira NaN e a página some da tela.
 */
export function stepZoom(current: number, direction: 1 | -1): number {
  const exact = ZOOM_STEPS.indexOf(current);
  // Um zoom fora da tabela cai no degrau mais próximo em vez de ficar em -1,
  // que com direction -1 daria índice -2 e devolveria undefined.
  const from =
    exact >= 0
      ? exact
      : ZOOM_STEPS.reduce(
          (best, step, i) =>
            Math.abs(step - current) < Math.abs(ZOOM_STEPS[best]! - current) ? i : best,
          0,
        );
  const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, from + direction));
  return ZOOM_STEPS[next]!;
}

@Component({
  selector: 'app-redact-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    AlertComponent,
    ActionBarComponent,
    RegionOverlayComponent,
    PdfPasswordPromptComponent,
    SegmentedComponent,
    ButtonDirective,
    IconComponent,
  ],
  templateUrl: './redact-pdf.component.html',
})
export class RedactPdfComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly redactor = inject(PdfRedactorService);
  private readonly urls = inject(ObjectUrlScope);

  protected readonly file = signal<File | null>(null);
  /** Parked here while the password prompt is up — the two-step flow. */
  protected readonly pendingFile = signal<File | null>(null);
  protected readonly passwordError = signal<string | null>(null);
  private password: string | undefined;

  protected readonly pageCount = signal(0);
  protected readonly currentPage = signal(1);
  protected readonly pageUrl = signal<string | null>(null);

  /** Tamanho da página em pontos (escala 1) — é dele que sai o "ajustar". */
  private readonly pageSize = signal<{ w: number; h: number } | null>(null);
  /** Escala em que o raster atual foi feito, para saber quando ele não serve mais. */
  private readonly renderedScale = signal(0);

  protected readonly zoom = signal(FIT_ZOOM);

  protected readonly regions = signal<readonly Region[]>([]);
  protected readonly mode = signal<RedactMode>('black');

  protected readonly busy = signal(false);
  protected readonly progress = signal<{ done: number; total: number; percent: number } | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly result = signal<RedactPdfResult | null>(null);

  private readonly ranRegions = signal<readonly Region[] | null>(null);

  /**
   * Renderizações são assíncronas e há duas origens (trocar de página e mudar o
   * zoom). Sem este contador vence a que terminar por último — clicar "próxima"
   * e ampliar em seguida podia deixar na tela o raster da página anterior, com
   * as tarjas da nova por cima.
   */
  private renderToken = 0;

  protected readonly modeOptions = computed<readonly SegmentOption<RedactMode>[]>(() => [
    { value: 'black', label: this.i18n.t()['redact.mode_black'] },
    { value: 'pixelate', label: this.i18n.t()['redact.mode_blur'] },
  ]);

  protected readonly stale = computed(() => !this.result() || this.regions() !== this.ranRegions());

  protected readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  protected readonly canZoomIn = computed(() => this.zoom() < ZOOM_STEPS[ZOOM_STEPS.length - 1]!);
  protected readonly canZoomOut = computed(() => this.zoom() > ZOOM_STEPS[0]!);

  /**
   * A altura da folha, em CSS, e a única coisa que o zoom mexe no layout.
   *
   * `min(fit, 60vh)` reproduz o `max-h-[60vh]` que estava no template, então
   * 100% continua idêntico ao que era antes de existir zoom e o zoom só
   * multiplica. A largura fica `auto`; como o overlay é `absolute inset-0`
   * sobre o wrapper que a imagem dimensiona, as regiões — que são percentuais —
   * seguem corretas em qualquer zoom, sem nenhuma conversão.
   */
  protected readonly sheetHeight = computed(() => {
    const size = this.pageSize();
    if (!size) return null;
    const fitPx = Math.round(size.h * FIT_SCALE);
    return `calc(min(${fitPx}px, ${FIT_VH}vh) * ${this.zoom()})`;
  });

  protected async onFileSelected(file: File): Promise<void> {
    this.password = undefined;
    this.passwordError.set(null);
    await this.open(file);
  }

  protected async unlock(password: string): Promise<void> {
    const pending = this.pendingFile();
    if (!pending) return;
    this.password = password;
    await this.open(pending);
  }

  private async open(file: File): Promise<void> {
    this.errorKey.set(null);
    try {
      const doc = await openPdf(file, this.password);
      try {
        this.pageCount.set(doc.numPages);
      } finally {
        await closePdf(doc);
      }

      this.file.set(file);
      this.pendingFile.set(null);
      this.passwordError.set(null);
      this.regions.set([]);
      this.result.set(null);
      this.currentPage.set(1);
      this.zoom.set(FIT_ZOOM);
      this.renderedScale.set(0);
      await this.renderPage(1);
    } catch (err) {
      const key = toMessageKey(err);
      if (key === 'error.pdf_encrypted') {
        // Not an error the user can act on by retrying — it is a prompt.
        this.pendingFile.set(file);
        this.file.set(null);
        if (this.password) this.passwordError.set(this.i18n.t()['pdf.wrong_password']);
        return;
      }
      this.errorKey.set(key);
    }
  }

  /** Escala de raster que o zoom atual pede. Uma página por vez, daí `pageCount: 1`. */
  private scaleFor(size: { w: number; h: number }, zoom: number): number {
    return pageRenderScale({
      pageWidth: size.w,
      pageHeight: size.h,
      pageCount: 1,
      displayScale: zoom,
      devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    });
  }

  private async renderPage(page: number): Promise<void> {
    const file = this.file();
    if (!file) return;

    const token = ++this.renderToken;
    const doc = await openPdf(file, this.password);
    try {
      const base = (await doc.getPage(page)).getViewport({ scale: 1 });
      const size = { w: base.width, h: base.height };
      const scale = this.scaleFor(size, this.zoom());

      const canvas = await renderPageToCanvas(doc, page, scale);
      const blob = await canvasToBlob(canvas, 'image/png');
      releaseCanvas(canvas);

      if (token !== this.renderToken) return;
      this.pageSize.set(size);
      this.renderedScale.set(scale);
      this.pageUrl.set(this.urls.replace(this.pageUrl(), blob));
    } finally {
      await closePdf(doc);
    }
  }

  protected async goTo(page: number): Promise<void> {
    if (page < 1 || page > this.pageCount()) return;
    this.currentPage.set(page);
    this.pageUrl.set(null);
    await this.renderPage(page);
  }

  protected async setZoom(next: number): Promise<void> {
    if (next === this.zoom() || !this.file()) return;

    // O CSS amplia o raster que já está na tela na hora. Sem isto o zoom só
    // responderia depois do re-render, que custa uma rasterização inteira e
    // faz o botão parecer morto.
    this.zoom.set(next);

    const size = this.pageSize();
    if (!size) return;

    // Só re-rasteriza para AMPLIAR. Reduzir é o navegador encolhendo um raster
    // que já tem resolução de sobra, e refazer ali só perderia nitidez ao
    // voltar. A margem evita um re-render inútil quando `pageRenderScale`
    // devolve o mesmo valor por já estar no teto.
    const wanted = this.scaleFor(size, next);
    if (wanted > this.renderedScale() + 0.01) await this.renderPage(this.currentPage());
  }

  protected zoomBy(direction: 1 | -1): Promise<void> {
    return this.setZoom(stepZoom(this.zoom(), direction));
  }

  protected zoomReset(): Promise<void> {
    return this.setZoom(FIT_ZOOM);
  }

  protected addRegion(region: Region): void {
    this.regions.update((list) => [...list, region]);
    this.result.set(null);
  }

  protected removeRegion(id: string): void {
    this.regions.update((list) => list.filter((r) => r.id !== id));
    this.result.set(null);
  }

  protected clearRegions(): void {
    this.regions.set([]);
    this.result.set(null);
  }

  protected async run(): Promise<void> {
    const file = this.file();
    const regions = this.regions();
    if (!file || regions.length === 0 || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set({ done: 0, total: this.pageCount(), percent: 0 });

    try {
      const result = await this.redactor.redact({
        file,
        password: this.password,
        regions,
        onProgress: (done, total) =>
          this.progress.set({ done, total, percent: Math.round((done / total) * 100) }),
      });
      this.result.set(result);
      this.ranRegions.set(regions);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const r = this.result();
    if (r) saveBlob(r.blob, r.filename);
  }

  protected reset(): void {
    this.urls.revoke(this.pageUrl());
    this.pageUrl.set(null);
    this.file.set(null);
    this.pendingFile.set(null);
    this.password = undefined;
    this.passwordError.set(null);
    this.pageCount.set(0);
    this.currentPage.set(1);
    this.pageSize.set(null);
    this.renderedScale.set(0);
    this.zoom.set(FIT_ZOOM);
    this.regions.set([]);
    this.result.set(null);
    this.ranRegions.set(null);
    this.errorKey.set(null);
  }
}
