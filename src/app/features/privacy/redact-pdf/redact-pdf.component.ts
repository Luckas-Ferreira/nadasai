import {
  ChangeDetectionStrategy,
  Component,
  type OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
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
 * Os limites e o passo são os do editor de PDF, de propósito: é o mesmo gesto
 * na mesma família de ferramentas, e duas escalas diferentes para "ampliar um
 * PDF" seriam duas coisas para aprender.
 */
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.1;

/** O zoom inicial, e o que o campo devolve quando se digita 100. */
export const FIT_ZOOM = 1;

/**
 * Pura e exportada porque é aqui que o zoom quebra em silêncio.
 *
 * Um NaN (campo vazio, texto colado) ou um valor fora dos limites vira uma
 * altura `calc(min(…) * NaN)`; o CSS descarta a declaração inteira e a página
 * some da tela sem nada no console. Arredondar para 2 casas evita o
 * 1.7999999999999998 que a soma de 0.1 produz e que o campo mostraria inteiro.
 */
export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return FIT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
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
export class RedactPdfComponent implements OnDestroy {
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
  protected readonly canZoomIn = computed(() => this.zoom() < MAX_ZOOM);
  protected readonly canZoomOut = computed(() => this.zoom() > MIN_ZOOM);

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

  /**
   * O zoom em si é imediato — é só CSS sobre o raster que já está na tela. Sem
   * isso o botão só responderia ao fim de uma rasterização inteira e pareceria
   * morto; com isso a página cresce no clique e fica nítida logo depois.
   */
  protected setZoom(value: number): void {
    if (!this.file()) return;
    const next = clampZoom(value);
    if (next === this.zoom()) return;
    this.zoom.set(next);
    this.scheduleRerender();
  }

  protected zoomBy(delta: number): void {
    this.setZoom(this.zoom() + delta);
  }

  protected setZoomFromInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const parsed = Number.parseInt(input.value, 10);
    // Um campo vazio ou com lixo volta a mostrar o zoom vigente em vez de
    // aplicar NaN — e o valor é reescrito sempre, porque digitar 900 tem de
    // aparecer como 300, não continuar 900 sobre uma página que não ampliou.
    if (Number.isFinite(parsed)) this.setZoom(parsed / 100);
    input.value = String(this.zoomPercent());
  }

  /** Ctrl/⌘ + roda, como no editor. Sem o modificador a roda rola a página. */
  protected onWheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.cancelable) event.preventDefault();
    this.zoomBy(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  }

  private pinchStartDistance: number | null = null;
  private pinchStartZoom = FIT_ZOOM;

  protected onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 2) return;
    this.pinchStartDistance = this.touchDistance(event);
    this.pinchStartZoom = this.zoom();
  }

  protected onTouchMove(event: TouchEvent): void {
    if (this.pinchStartDistance === null || event.touches.length !== 2) return;
    if (event.cancelable) event.preventDefault();
    this.setZoom(this.pinchStartZoom * (this.touchDistance(event) / this.pinchStartDistance));
  }

  protected onTouchEnd(): void {
    this.pinchStartDistance = null;
  }

  private touchDistance(event: TouchEvent): number {
    const [a, b] = [event.touches[0]!, event.touches[1]!];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  /**
   * Espera o usuário parar de ampliar antes de refazer o raster.
   *
   * Sem o debounce, a roda e a pinça — que disparam dezenas de eventos por
   * gesto — enfileirariam uma rasterização de página inteira em cada um. Os
   * 400 ms são os mesmos do editor.
   */
  private rerenderTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleRerender(): void {
    if (this.rerenderTimer !== null) clearTimeout(this.rerenderTimer);
    this.rerenderTimer = setTimeout(() => {
      this.rerenderTimer = null;
      const size = this.pageSize();
      if (!size) return;
      // Só re-rasteriza para AMPLIAR. Reduzir é o navegador encolhendo um
      // raster que já tem resolução de sobra, e refazer ali só perderia
      // nitidez ao voltar. A margem evita um re-render inútil quando
      // `pageRenderScale` devolve o mesmo valor por já estar no teto.
      if (this.scaleFor(size, this.zoom()) > this.renderedScale() + 0.01) {
        void this.renderPage(this.currentPage());
      }
    }, 400);
  }

  protected addRegion(region: Region): void {
    this.regions.update((list) => [...list, region]);
    this.result.set(null);
  }

  protected removeRegion(id: string): void {
    this.regions.update((list) => list.filter((r) => r.id !== id));
    this.result.set(null);
  }

  /**
   * Desfaz a última tarja desenhada, em qualquer página.
   *
   * E se ela não estava na página aberta, vai até lá. Um desfazer que remove
   * algo fora da tela é indistinguível de um botão quebrado — o usuário clica,
   * nada muda à vista, e a tarja que ele queria de volta continua sumida numa
   * página que ele não está olhando.
   */
  protected async undo(): Promise<void> {
    const last = this.regions()[this.regions().length - 1];
    if (!last) return;

    this.regions.update((list) => list.slice(0, -1));
    this.result.set(null);

    if (last.page !== this.currentPage()) await this.goTo(last.page);
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

  /**
   * O timer sobrevive à navegação se não for cancelado, e dispara uma
   * rasterização de página num componente que o Angular já destruiu.
   */
  ngOnDestroy(): void {
    if (this.rerenderTimer !== null) clearTimeout(this.rerenderTimer);
  }

  protected reset(): void {
    if (this.rerenderTimer !== null) clearTimeout(this.rerenderTimer);
    this.rerenderTimer = null;
    this.pinchStartDistance = null;
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
