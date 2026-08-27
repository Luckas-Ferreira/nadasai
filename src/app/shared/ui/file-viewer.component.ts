import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { closePdf, openPdf, pageRenderScale, releaseCanvas, renderPageIntoCanvas } from '../../core/pdf/pdfjs';
import { ActiveToolService } from '../../core/services/active-tool.service';
import { FileViewerService } from '../../core/services/file-viewer.service';
import { TranslationService } from '../../core/services/translation.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { type ToolDef, nextToolsFor, toolPath } from '../../core/tools/tools';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon/icon.component';

/**
 * O arquivo, em tela cheia, e a lista de onde ele pode ser aberto.
 *
 * Ele existe porque no celular o produto lia como um site e não como um app: o
 * arquivo aparecia num palco de 420px espremido entre cabeçalho, painel e o
 * texto longo da página, e não havia jeito nenhum de simplesmente OLHAR o que se
 * estava editando. Aqui o arquivo ocupa a tela, e o rodapé é a mesma pergunta
 * que a rota `/abrir` faz quando o sistema operacional entrega um arquivo —
 * "com o que você quer abrir isto?" —, respondida pela mesma `nextToolsFor`.
 *
 * ── TRÊS COISAS QUE NÃO SÃO ÓBVIAS ──────────────────────────────────────────
 *
 * **A cromagem é clara e só o CORPO é escuro.** O sistema de design tem UM tema,
 * e todo token de primeiro plano é afinado para AAA sobre branco; escrever
 * `text-white/70` num cabeçalho seria repetir exatamente o defeito que os tokens
 * do rail existem para evitar. Então cabeçalho e rodapé ficam em `bg-surface`,
 * com texto normal, e o corpo segue a regra que o resto do produto já segue:
 * `bg-stage` para uma IMAGEM, cuja luminosidade se julga, e `bg-doc-stage` com
 * folha branca para um DOCUMENTO, que se lê.
 *
 * **O zoom é escrito à mão, e não é preciosismo.** O `<meta viewport>` permite
 * `maximum-scale=5`, então no navegador daria para pinçar a viewport visual e
 * fingir que está resolvido — mas no WebView do app o zoom embutido vem
 * DESLIGADO (`setBuiltInZoomControls`), e ali não haveria zoom nenhum. Como o app
 * empacotado é justamente onde este visualizador mais importa, o gesto é tratado
 * aqui: dois dedos beliscam, dois toques alternam, e arrastar move quando há
 * para onde mover.
 *
 * **O PDF rasteriza por JANELA**, como o editor: só as páginas perto da tela
 * ganham backing store, e as que saem são liberadas por `releaseCanvas`. É a
 * mesma razão registrada no `pageRenderScale` — memória de canvas estourada não
 * lança erro, devolve página em branco.
 */

/** Quantas páginas de PDF podem ter backing store ao mesmo tempo. */
const RENDER_WINDOW = 3;

/** Margem, em telas, para começar a rasterizar antes de a página entrar. */
const RENDER_MARGIN = '150% 0px';

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

/** Para onde o toque duplo leva. Acima disso a foto de celular já mostra o grão. */
const DOUBLE_TAP_ZOOM = 2.5;

interface PdfPage {
  readonly index: number;
  /** Proporção da página, para o espaço reservado ter a altura certa antes de existir raster. */
  readonly ratio: number;
}

@Component({
  selector: 'app-file-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, IconComponent],
  template: `
    @if (viewer.current(); as target) {
      <div
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="i18n.t()['viewer.title']"
        class="fixed inset-0 z-[60] flex flex-col bg-base"
      >
        <header class="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-text">{{ target.name }}</span>

          @if (isImage()) {
            <span class="shrink-0 font-mono tabular text-xs text-faint">{{ zoomLabel() }}</span>
          } @else if (pages().length) {
            <span class="shrink-0 font-mono tabular text-xs text-faint">{{ pages().length }}</span>
          }

          <button appButton variant="ghost" size="sm" (click)="viewer.close()">
            <app-icon name="close" [size]="14" />
            <span class="hidden sm:inline">{{ i18n.t()['common.close'] }}</span>
          </button>
        </header>

        @if (isImage()) {
          <!-- touch-action:none é o que impede o navegador de sequestrar o gesto
               e rolar a página em vez de deixar a pinça chegar até aqui. (Sem
               crase: este template é uma template string, e uma crase dentro de
               um comentário HTML a TERMINA — o erro sai como "',' expected" numa
               linha de classes CSS, longe de qualquer coisa que pareça a causa.) -->
          <div
            class="relative flex flex-1 touch-none select-none items-center justify-center overflow-hidden bg-stage"
            #surface
            (pointerdown)="onPointerDown($event)"
            (pointermove)="onPointerMove($event)"
            (pointerup)="onPointerUp($event)"
            (pointercancel)="onPointerUp($event)"
            (dblclick)="toggleZoom($event)"
          >
            <img
              [src]="target.src"
              [alt]="target.name"
              draggable="false"
              class="max-h-full max-w-full object-contain"
              [style.transform]="transform()"
              [style.cursor]="zoom() > MIN_ZOOM ? 'grab' : 'zoom-in'"
            />
          </div>
        } @else {
          <div class="flex-1 overflow-y-auto bg-doc-stage px-4 py-4" #surface>
            @if (loading()) {
              <p class="py-10 text-center text-sm text-muted">{{ i18n.t()['common.processing'] }}</p>
            } @else if (failed()) {
              <p class="py-10 text-center text-sm text-muted">{{ i18n.t()['viewer.no_preview'] }}</p>
            }

            <div class="mx-auto flex max-w-[820px] flex-col gap-4">
              @for (page of pages(); track page.index) {
                <!-- O espaço é reservado pela PROPORÇÃO antes de existir raster:
                     sem isso a barra de rolagem salta a cada página que entra. -->
                <canvas
                  class="w-full rounded-md bg-white shadow-page"
                  [attr.data-page]="page.index"
                  [style.aspect-ratio]="page.ratio"
                ></canvas>
              }
            </div>
          </div>
        }

        @if (destinations().length) {
          <footer class="shrink-0 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <p class="mb-2 text-xs font-medium text-muted">{{ i18n.t()['viewer.open_with'] }}</p>

            <!-- Uma fileira que rola, e não uma grade: a lista tem o tamanho do
                 que o produto faz com aquele tipo, e no celular uma grade de
                 dezessete destinos empurraria o arquivo para fora da tela. -->
            <ul class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              @for (tool of destinations(); track tool.id) {
                <li class="shrink-0">
                  <button
                    type="button"
                    (click)="go(tool)"
                    class="flex w-[92px] flex-col items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-2.5 text-center transition-colors hover:bg-raised"
                  >
                    <span
                      [style.--tone-fg]="'var(--tone-' + tool.tone + '-fg)'"
                      [style.--tone-bg]="'var(--tone-' + tool.tone + '-bg)'"
                      class="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--tone-bg)] text-[color:var(--tone-fg)]"
                    >
                      <app-icon [name]="tool.icon" [size]="17" />
                    </span>
                    <span class="line-clamp-2 text-2xs leading-tight text-text">{{
                      i18n.t()[tool.navKey]
                    }}</span>
                  </button>
                </li>
              }
            </ul>
          </footer>
        }
      </div>
    }
  `,
})
export class FileViewerComponent {
  private readonly router = inject(Router);
  private readonly activeTool = inject(ActiveToolService);
  private readonly workspace = inject(WorkspaceService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly viewer = inject(FileViewerService);
  protected readonly i18n = inject(TranslationService);

  protected readonly MIN_ZOOM = MIN_ZOOM;

  private readonly surface = viewChild<ElementRef<HTMLElement>>('surface');

  protected readonly zoom = signal(MIN_ZOOM);
  protected readonly panX = signal(0);
  protected readonly panY = signal(0);

  protected readonly pages = signal<readonly PdfPage[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  protected readonly isImage = computed(() => {
    const kind = this.viewer.current()?.kind;
    return kind === 'image' || kind === 'svg';
  });

  protected readonly transform = computed(
    () => `scale(${this.zoom()}) translate(${this.panX()}px, ${this.panY()}px)`,
  );

  protected readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);

  /**
   * A mesma lista da barra de arquivo, e pelo mesmo motivo: sem
   * `MAX_NEXT_TOOL_CHIPS`, porque uma fileira que rola cabe tudo. O tipo vem da
   * SESSÃO e não do que está na tela — quem decide para onde o arquivo pode ir é
   * o arquivo que a cadeia carrega, e navegar já commita o resultado pendente
   * pelo `PendingTransitionService`, como qualquer outra saída da ferramenta.
   */
  protected readonly destinations = computed<readonly ToolDef[]>(() =>
    nextToolsFor(this.workspace.kind(), this.activeTool.tool()?.id ?? null),
  );

  constructor() {
    const destroy = inject(DestroyRef);

    // Zoom e deslocamento zeram a cada abertura: reabrir e encontrar a imagem
    // onde a última sessão a deixou parece defeito, não memória.
    effect(() => {
      if (!this.viewer.open()) return;
      this.zoom.set(MIN_ZOOM);
      this.panX.set(0);
      this.panY.set(0);
    });

    effect((onCleanup) => {
      if (!this.viewer.open() || !this.browser) return;
      const root = document.documentElement;
      const previous = root.style.overflow;
      root.style.overflow = 'hidden';
      onCleanup(() => {
        root.style.overflow = previous;
      });
    });

    effect((onCleanup) => {
      const target = this.viewer.current();
      if (!target || this.isImage()) {
        this.pages.set([]);
        return;
      }
      onCleanup(this.renderPdf(target.file));
    });

    if (this.browser) {
      const onKeydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && this.viewer.open()) this.viewer.close();
      };
      window.addEventListener('keydown', onKeydown);
      destroy.onDestroy(() => window.removeEventListener('keydown', onKeydown));
    }
  }

  protected go(tool: ToolDef): void {
    this.viewer.close();
    const lang = this.i18n.currentLang();
    void this.router.navigateByUrl(`/${lang}/${toolPath(tool, lang)}`);
  }

  // ---- zoom e deslocamento ------------------------------------------------

  /** Ponteiros vivos sobre a superfície. Dois = pinça; um = arrasto. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private pinchZoom = MIN_ZOOM;

  protected onPointerDown(event: PointerEvent): void {
    const surface = event.currentTarget as HTMLElement;
    surface.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 2) {
      this.pinchDistance = this.spread();
      this.pinchZoom = this.zoom();
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size >= 2) {
      if (this.pinchDistance > 0) {
        this.setZoom((this.spread() / this.pinchDistance) * this.pinchZoom);
      }
      return;
    }

    // Um dedo só desloca quando há para onde deslocar. Sem isto, arrastar a
    // imagem inteiramente visível a faz escorregar para fora da tela e parecer
    // que o visualizador perdeu o arquivo.
    if (this.zoom() <= MIN_ZOOM) return;

    // O deslocamento é aplicado ANTES da escala no `transform`, então o
    // movimento do dedo precisa ser dividido por ela — sem isso a imagem corre
    // mais que o dedo quanto maior o zoom.
    this.pan(
      this.panX() + (event.clientX - previous.x) / this.zoom(),
      this.panY() + (event.clientY - previous.y) / this.zoom(),
    );
  }

  protected onPointerUp(event: PointerEvent): void {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchDistance = 0;
  }

  protected toggleZoom(event: MouseEvent): void {
    event.preventDefault();
    this.setZoom(this.zoom() > MIN_ZOOM ? MIN_ZOOM : DOUBLE_TAP_ZOOM);
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private setZoom(next: number): void {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    this.zoom.set(clamped);
    if (clamped <= MIN_ZOOM) {
      this.panX.set(0);
      this.panY.set(0);
      return;
    }
    this.pan(this.panX(), this.panY());
  }

  /**
   * Segura a imagem dentro da moldura.
   *
   * O limite é metade do que a escala acrescentou, dividido pela própria escala
   * porque o deslocamento é aplicado antes dela. Sem o limite dá para arrastar a
   * foto para fora da tela e ficar olhando para um retângulo preto.
   */
  private pan(x: number, y: number): void {
    const box = this.surface()?.nativeElement.getBoundingClientRect();
    if (!box) return;

    const scale = this.zoom();
    const limitX = (box.width * (scale - 1)) / (2 * scale);
    const limitY = (box.height * (scale - 1)) / (2 * scale);

    this.panX.set(Math.min(limitX, Math.max(-limitX, x)));
    this.panY.set(Math.min(limitY, Math.max(-limitY, y)));
  }

  // ---- PDF ----------------------------------------------------------------

  /**
   * Abre o documento, mede as páginas e rasteriza só as que estão perto da tela.
   *
   * Devolve a limpeza para o `onCleanup` do effect: fechar o visualizador com um
   * documento aberto tem que derrubar o worker do pdf.js, senão cada abertura
   * deixa um para trás.
   */
  private renderPdf(file: File | null): () => void {
    if (!file || !this.browser) {
      this.failed.set(true);
      return () => undefined;
    }

    this.loading.set(true);
    this.failed.set(false);

    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    let close: (() => void) | undefined;

    void (async () => {
      try {
        const doc = await openPdf(file, this.workspace.pdfPassword() ?? undefined);
        if (cancelled) {
          void closePdf(doc);
          return;
        }
        close = () => void closePdf(doc);

        const measured: PdfPage[] = [];
        for (let index = 1; index <= doc.numPages; index++) {
          const viewport = (await doc.getPage(index)).getViewport({ scale: 1 });
          measured.push({ index, ratio: viewport.width / viewport.height });
        }
        if (cancelled) return;

        this.pages.set(measured);
        this.loading.set(false);

        // Espera o Angular pintar os `<canvas>` reservados antes de procurá-los.
        await new Promise((resolve) => setTimeout(resolve));
        if (cancelled) return;

        const rendered = new Set<number>();
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const canvas = entry.target as HTMLCanvasElement;
              const index = Number(canvas.dataset['page']);

              if (!entry.isIntersecting) {
                if (rendered.size > RENDER_WINDOW && rendered.delete(index)) releaseCanvas(canvas);
                continue;
              }
              if (rendered.has(index)) continue;
              rendered.add(index);

              void doc.getPage(index).then((page) => {
                if (cancelled) return;
                const viewport = page.getViewport({ scale: 1 });
                const scale = pageRenderScale({
                  pageWidth: viewport.width,
                  pageHeight: viewport.height,
                  pageCount: RENDER_WINDOW,
                  displayScale: canvas.clientWidth / viewport.width,
                  devicePixelRatio: window.devicePixelRatio,
                });
                void renderPageIntoCanvas(doc, index, scale, canvas);
              });
            }
          },
          { root: this.surface()?.nativeElement ?? null, rootMargin: RENDER_MARGIN },
        );

        for (const canvas of this.surface()?.nativeElement.querySelectorAll('canvas') ?? []) {
          observer.observe(canvas);
        }
      } catch {
        // Um PDF que não abre aqui não é erro de ferramenta: o visualizador diz
        // que não sabe mostrar e a página continua exatamente como estava.
        if (cancelled) return;
        this.loading.set(false);
        this.failed.set(true);
      }
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      close?.();
      this.pages.set([]);
    };
  }
}
