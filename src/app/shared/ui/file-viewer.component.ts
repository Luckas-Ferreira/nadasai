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
import { setImmersive } from '../../core/platform/native-shell';
import { ActiveToolService } from '../../core/services/active-tool.service';
import { FileViewerService } from '../../core/services/file-viewer.service';
import { TranslationService } from '../../core/services/translation.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { type ToolDef, nextToolsFor, toolPath } from '../../core/tools/tools';
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
 * ── POR QUE ELE NÃO FICAVA EM TELA CHEIA NO ANDROID ─────────────────────────
 *
 * `fixed inset-0` sempre cobriu a tela inteira. O que faltava era o app saber
 * ONDE FICAM AS BORDAS dela: do targetSdk 35 em diante o Android desenha a
 * janela de borda a borda, e este projeto está em 36. O cabeçalho daqui saía por
 * baixo do relógio e a fileira de destinos por baixo do risco da navegação por
 * gestos — a tela estava cheia, e cortada nas duas pontas.
 *
 * A medida vem do nativo (`SystemBars.java`, publicada em `--safe-*`), e este
 * componente faz a outra metade: **ele esconde as barras enquanto está aberto**
 * (`setImmersive`), que é o que separa uma página que ocupa a tela de um
 * visualizador de galeria. Ao esconder, os recuos viram zero sozinhos e a
 * cromagem encosta na borda de verdade. Na web nada disso existe e o componente
 * é o mesmo — `setImmersive` é no-op fora do app empacotado.
 *
 * ── QUATRO COISAS QUE NÃO SÃO ÓBVIAS ────────────────────────────────────────
 *
 * **A cromagem FLUTUA e carrega o próprio fundo.** Ela é a única superfície do
 * produto que fica por cima de conteúdo arbitrário — a foto de outra pessoa, que
 * pode ser branca —, então nenhum token de primeiro plano serve: todos são
 * afinados para AAA sobre branco. Os tokens `--color-viewer-*` existem para
 * isso, e quem garante o contraste é o véu escuro, não a cor do texto. Empurrar
 * a imagem para baixo de um cabeçalho opaco seria a alternativa, e é justamente
 * a que fazia o arquivo caber num pedaço da tela.
 *
 * **A cromagem se esconde sozinha, e volta ao toque.** É o gesto que todo app de
 * fotos tem, e sem ele a promessa de "tela cheia" fica pela metade: sobrariam
 * cabeçalho e rodapé cobrindo um terço de um retrato. O relógio de esconder só
 * corre para IMAGEM — num PDF a pessoa está rolando, e uma cromagem que some
 * enquanto se lê é ruído, não elegância.
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

/**
 * Quanto tempo a cromagem fica antes de sumir sozinha, numa imagem.
 *
 * Longo o bastante para ler o nome do arquivo e achar o botão de voltar; curto o
 * bastante para que quem abriu só para OLHAR não precise fazer nada.
 */
const CHROME_HIDE_MS = 2600;

/**
 * Quanto o dedo precisa descer para fechar, e o quanto ele pode desviar.
 *
 * O desvio importa: sem o segundo limite, um arrasto na diagonal para mover uma
 * imagem ampliada fecharia o visualizador no meio do gesto.
 */
const DISMISS_DISTANCE = 110;
const DISMISS_SLOPE = 1.2;

/**
 * Quanto o visualizador espera antes de aceitar um toque como UM toque.
 *
 * É a janela do duplo toque do zoom. Ver `scheduleChromeToggle`.
 */
const TAP_SETTLE_MS = 260;

interface PdfPage {
  readonly index: number;
  /** Proporção da página, para o espaço reservado ter a altura certa antes de existir raster. */
  readonly ratio: number;
}

@Component({
  selector: 'app-file-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (viewer.current(); as target) {
      <div
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="i18n.t()['viewer.title']"
        class="fixed inset-0 z-[60] overflow-hidden"
        [class.bg-stage]="isImage()"
        [class.bg-doc-stage]="!isImage()"
      >
        @if (isImage()) {
          <!-- touch-action:none é o que impede o navegador de sequestrar o gesto
               e rolar a página em vez de deixar a pinça chegar até aqui. (Sem
               crase: este template é uma template string, e uma crase dentro de
               um comentário HTML a TERMINA — o erro sai como "',' expected" numa
               linha de classes CSS, longe de qualquer coisa que pareça a causa.) -->
          <div
            class="absolute inset-0 flex touch-none select-none items-center justify-center"
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
              [style.opacity]="dismissOpacity()"
              [style.cursor]="zoom() > MIN_ZOOM ? 'grab' : 'zoom-in'"
            />
          </div>
        } @else {
          <!-- O toque aqui NÃO pode ser (click) no contêiner que rola: um toque
               que termina uma rolagem inercial dispara click no Android, e a
               cromagem piscaria a cada arrasto. O alternador do PDF é o próprio
               cabeçalho, mais o toque na folha, que não rola. -->
          <div class="absolute inset-0 overflow-y-auto px-4" #surface>
            @if (loading()) {
              <p class="py-10 text-center text-sm text-muted">{{ i18n.t()['common.processing'] }}</p>
            } @else if (failed()) {
              <p class="py-10 text-center text-sm text-muted">{{ i18n.t()['viewer.no_preview'] }}</p>
            }

            <div
              class="mx-auto flex max-w-[820px] flex-col gap-4"
              [style.padding-top]="contentInset().top"
              [style.padding-bottom]="contentInset().bottom"
              (click)="chrome.set(!chrome())"
            >
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

        <!-- ── A CROMAGEM ───────────────────────────────────────────────────
             Flutua sobre o conteúdo, some sozinha e volta ao toque. O recuo é
             --safe-*, que no app vira zero enquanto as barras estão escondidas
             e volta ao valor real assim que alguém as traz de volta com um
             deslize — então ela nunca fica nem colada na borda nem por baixo do
             relógio. O pointer-events-none no invólucro é para que o gesto da
             imagem atravesse a área vazia entre o cabeçalho e o rodapé.

             O inert é o que a torna INALCANÇÁVEL quando escondida, e ele existe
             no lugar de um visibility:hidden por dois motivos: hidden aplica na
             hora e mataria o esmaecimento, e uma cromagem apenas transparente
             continuaria recebendo Tab e clique — a mesma armadilha que a folha
             de controles do app-tool-page já documenta. Escondida, o toque
             atravessa e cai na imagem, que é justamente o que a traz de volta. -->
        <div
          class="pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-200"
          [class.opacity-0]="!chrome()"
          [attr.aria-hidden]="!chrome()"
          [attr.inert]="!chrome() ? '' : null"
        >
          <header
            class="pointer-events-auto flex items-center gap-2 bg-viewer-scrim px-2 pb-2 text-viewer-text"
            [style.padding-top]="'max(0.5rem, var(--safe-top))'"
            [style.padding-left]="'max(0.5rem, var(--safe-left))'"
            [style.padding-right]="'max(0.5rem, var(--safe-right))'"
          >
            <!-- Uma SETA DE VOLTAR, e não um "Fechar" com rótulo. É o controle
                 que todo app de Android põe nesse canto, e o alvo tem 44px de
                 verdade — o botão de antes era um ghost sm de 28px de altura,
                 que é metade do mínimo de toque. -->
            <button
              type="button"
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-viewer-hover"
              [attr.aria-label]="i18n.t()['common.close']"
              (click)="close()"
            >
              <app-icon name="chevronLeft" [size]="20" />
            </button>

            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ target.name }}</span>

            @if (isImage()) {
              <span class="shrink-0 px-2 font-mono tabular text-xs text-viewer-muted">{{ zoomLabel() }}</span>
            } @else if (pages().length) {
              <span class="shrink-0 px-2 font-mono tabular text-xs text-viewer-muted">{{ pages().length }}</span>
            }
          </header>

          @if (destinations().length) {
            <footer
              class="pointer-events-auto bg-viewer-scrim pt-2.5 text-viewer-text"
              [style.padding-bottom]="'max(0.75rem, var(--safe-bottom))'"
              [style.padding-left]="'max(0.25rem, var(--safe-left))'"
              [style.padding-right]="'max(0.25rem, var(--safe-right))'"
            >
              <p class="mb-2 px-3 text-xs font-medium text-viewer-muted">
                {{ i18n.t()['viewer.open_with'] }}
              </p>

              <!-- Uma fileira que rola, e não uma grade: a lista tem o tamanho do
                   que o produto faz com aquele tipo, e no celular uma grade de
                   dezessete destinos empurraria o arquivo para fora da tela. -->
              <ul class="flex gap-1 overflow-x-auto px-2 pb-1">
                @for (tool of destinations(); track tool.id) {
                  <li class="shrink-0">
                    <button
                      type="button"
                      (click)="go(tool)"
                      class="flex w-[76px] flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-center transition-colors hover:bg-viewer-hover"
                    >
                      <span
                        [style.--tone-fg]="'var(--tone-' + tool.tone + '-fg)'"
                        [style.--tone-bg]="'var(--tone-' + tool.tone + '-bg)'"
                        class="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--tone-bg)] text-[color:var(--tone-fg)]"
                      >
                        <app-icon [name]="tool.icon" [size]="19" />
                      </span>
                      <span class="line-clamp-2 text-2xs leading-tight">{{
                        i18n.t()[tool.navKey]
                      }}</span>
                    </button>
                  </li>
                }
              </ul>
            </footer>
          }
        </div>
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

  /** Quanto o dedo já desceu no gesto de fechar, em pixels. */
  protected readonly dismissY = signal(0);

  /** A cromagem está à mostra? */
  protected readonly chrome = signal(true);

  protected readonly pages = signal<readonly PdfPage[]>([]);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  protected readonly isImage = computed(() => {
    const kind = this.viewer.current()?.kind;
    return kind === 'image' || kind === 'svg';
  });

  protected readonly transform = computed(
    () =>
      `translateY(${this.dismissY()}px) scale(${this.zoom()}) translate(${this.panX()}px, ${this.panY()}px)`,
  );

  /**
   * A imagem some conforme o gesto de fechar avança.
   *
   * Não é enfeite: sem ela o arrasto para baixo não dá retorno nenhum até o
   * momento em que a tela simplesmente desaparece, e um gesto que só tem dois
   * estados parece defeito enquanto não termina.
   */
  protected readonly dismissOpacity = computed(() =>
    Math.max(0.35, 1 - this.dismissY() / (DISMISS_DISTANCE * 2.4)),
  );

  protected readonly zoomLabel = computed(() => `${Math.round(this.zoom() * 100)}%`);

  /**
   * A folga que a cromagem cobre, no PDF.
   *
   * Ela flutua, então a primeira e a última página ficariam por baixo dela. Os
   * valores acompanham `--safe-*` pelo mesmo motivo da cromagem: no app eles são
   * zero enquanto as barras estão escondidas.
   */
  protected readonly contentInset = computed(() => ({
    top: 'calc(3.75rem + var(--safe-top))',
    bottom: this.destinations().length
      ? 'calc(7.5rem + var(--safe-bottom))'
      : 'calc(1rem + var(--safe-bottom))',
  }));

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

  /** O relógio que esconde a cromagem sozinha. */
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * O ponteiro é um dedo?
   *
   * Lido UMA vez, no construtor, e não por `matchMedia().addEventListener`: o
   * que ele decide é se a cromagem se esconde sozinha, e trocar de mouse para
   * dedo no meio de uma visualização não é um caso que valha um listener vivo em
   * toda sessão. `false` fora do navegador, onde não há ponteiro nenhum.
   */
  private readonly coarse =
    this.browser && window.matchMedia('(pointer: coarse)').matches;

  constructor() {
    const destroy = inject(DestroyRef);

    // Zoom, deslocamento e cromagem zeram a cada abertura: reabrir e encontrar a
    // imagem onde a última sessão a deixou parece defeito, não memória.
    effect(() => {
      if (!this.viewer.open()) return;
      this.zoom.set(MIN_ZOOM);
      this.panX.set(0);
      this.panY.set(0);
      this.dismissY.set(0);
      this.chrome.set(true);
      // Um relógio de toque sobrevivente da sessão anterior apagaria a cromagem
      // que esta linha acabou de acender, um quarto de segundo depois de abrir.
      clearTimeout(this.tapTimer);
    });

    /**
     * AS BARRAS DO SISTEMA, escondidas enquanto a tela cheia está aberta.
     *
     * O `onCleanup` é o que garante o par mesmo quando ninguém fecha a tela: uma
     * navegação que destrói o componente, ou o próprio app sendo recarregado,
     * devolvem as barras. Sem ele, sair por um caminho não previsto deixaria o
     * aparelho sem barra de navegação — que é o pior defeito possível aqui,
     * porque a pessoa não tem como voltar.
     */
    effect((onCleanup) => {
      if (!this.viewer.open() || !this.browser) return;
      void setImmersive(true);
      onCleanup(() => void setImmersive(false));
    });

    /**
     * O relógio da cromagem.
     *
     * Duas condições, e as duas são a mesma pergunta: "há um gesto barato para
     * trazê-la de volta?".
     *
     * Só IMAGEM, porque num PDF a pessoa está rolando e uma cromagem que some no
     * meio da leitura é ruído, não elegância.
     *
     * E só com PONTEIRO GROSSO — dedo. Num celular, esconder é o certo: a tela é
     * pequena, o toque devolve a cromagem, e é o que toda galeria faz. Com mouse
     * é o contrário: a tela é grande, a cromagem não atrapalha, e some sem nada
     * tê-la mandado sumir, o que lê como defeito. É a mesma distinção que separa
     * o rail da barra do celular — não é plataforma, é o gesto disponível.
     */
    effect((onCleanup) => {
      if (!this.viewer.open() || !this.browser) return;
      if (!this.isImage() || !this.chrome() || !this.coarse) return;

      this.hideTimer = setTimeout(() => this.chrome.set(false), CHROME_HIDE_MS);
      onCleanup(() => clearTimeout(this.hideTimer));
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
        if (event.key === 'Escape' && this.viewer.open()) this.close();
      };
      window.addEventListener('keydown', onKeydown);

      /**
       * O BOTÃO VOLTAR DO ANDROID.
       *
       * `MainActivity` só desvia o botão para cá enquanto o modo imersivo está
       * ligado, ou seja, enquanto ESTE componente está aberto — é o mesmo sinal,
       * usado para dois efeitos, e não um segundo estado a manter em dia. Sem
       * isto, voltar dentro da tela cheia navegava a rota por baixo dela e o
       * visualizador continuava aberto sobre uma ferramenta diferente.
       */
      const onBack = () => {
        if (this.viewer.open()) this.close();
      };
      window.addEventListener('nadasai:back', onBack);

      destroy.onDestroy(() => {
        window.removeEventListener('keydown', onKeydown);
        window.removeEventListener('nadasai:back', onBack);
      });
    }
  }

  protected close(): void {
    this.viewer.close();
  }

  protected go(tool: ToolDef): void {
    this.close();
    const lang = this.i18n.currentLang();
    void this.router.navigateByUrl(`/${lang}/${toolPath(tool, lang)}`);
  }

  // ---- zoom e deslocamento ------------------------------------------------

  /** Ponteiros vivos sobre a superfície. Dois = pinça; um = arrasto. */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private pinchZoom = MIN_ZOOM;

  /** Onde o dedo tocou, para separar um toque de um arrasto no fim do gesto. */
  private downAt: { x: number; y: number; at: number } | null = null;
  private moved = false;

  protected onPointerDown(event: PointerEvent): void {
    const surface = event.currentTarget as HTMLElement;
    surface.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 1) {
      this.downAt = { x: event.clientX, y: event.clientY, at: Date.now() };
      this.moved = false;
    }

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
      this.moved = true;
      if (this.pinchDistance > 0) {
        this.setZoom((this.spread() / this.pinchDistance) * this.pinchZoom);
      }
      return;
    }

    const start = this.downAt;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) this.moved = true;

    // Sem zoom, um dedo não tem para onde deslocar — e é aí que o arrasto para
    // BAIXO vira o gesto de fechar, que é como toda galeria de Android fecha uma
    // foto. Com zoom ele volta a ser deslocamento, senão seria impossível
    // arrastar uma imagem ampliada para baixo sem fechar a tela.
    if (this.zoom() <= MIN_ZOOM) {
      const down = Math.max(0, dy);
      this.dismissY.set(down > 0 && down > Math.abs(dx) / DISMISS_SLOPE ? down : 0);
      return;
    }

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
    if (this.pointers.size > 0) return;

    if (this.dismissY() >= DISMISS_DISTANCE) {
      this.close();
      return;
    }
    this.dismissY.set(0);

    // Um toque que não virou arrasto alterna a cromagem. É o gesto de toda
    // galeria, e é o que devolve o cabeçalho depois que ele some sozinho.
    if (!this.moved) this.scheduleChromeToggle();
    this.downAt = null;
  }

  /**
   * Alterna a cromagem, mas só depois de ter certeza de que era UM toque.
   *
   * Sem a espera, o duplo toque do zoom alterna duas vezes — o cabeçalho pisca
   * para dentro e para fora antes de a imagem ampliar, o que faz o gesto parecer
   * defeito. Cada toque cancela o relógio do anterior e o `dblclick` cancela o do
   * segundo, então dois toques não alternam nada e um toque alterna uma vez.
   *
   * O atraso custa nada onde importa: quem quer o zoom não está esperando a
   * cromagem, e quem quer a cromagem não percebe um quarto de segundo.
   */
  private scheduleChromeToggle(): void {
    clearTimeout(this.tapTimer);
    this.tapTimer = setTimeout(() => this.chrome.set(!this.chrome()), TAP_SETTLE_MS);
  }

  private tapTimer: ReturnType<typeof setTimeout> | undefined;

  protected toggleZoom(event: MouseEvent): void {
    event.preventDefault();
    clearTimeout(this.tapTimer);
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
