import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import type { FileKind } from '../../core/files/kind';
import { formatBytes } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { ActiveToolService } from '../../core/services/active-tool.service';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService } from '../../core/services/translation.service';
import { FileViewerService } from '../../core/services/file-viewer.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { type ToolDef, nextToolsFor, toolById, toolPath } from '../../core/tools/tools';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon/icon.component';
import type { IconName } from './icon/icons';

/** Ícone e tom por tipo de arquivo. Áudio afina o tom pelo formato (ver `AUDIO_TONE`). */
const KIND_FACE: Record<FileKind, { icon: IconName; tone: string }> = {
  image: { icon: 'image', tone: 'sky' },
  pdf: { icon: 'pdf', tone: 'rose' },
  audio: { icon: 'audio', tone: 'violet' },
  video: { icon: 'video', tone: 'indigo' },
  text: { icon: 'text', tone: 'teal' },
  svg: { icon: 'palette', tone: 'sky' },
  docx: { icon: 'doc', tone: 'indigo' },
  zip: { icon: 'images', tone: 'amber' },
  binary: { icon: 'lock', tone: 'emerald' },
  any: { icon: 'doc', tone: 'sky' },
};

/** Herdado da barra de áudio: o tom acompanha o formato, que é o que muda ali. */
const AUDIO_TONE: Record<string, string> = {
  mp3: 'amber',
  wav: 'sky',
  ogg: 'emerald',
  oga: 'emerald',
  m4a: 'violet',
  aac: 'orange',
  flac: 'indigo',
  webm: 'teal',
  opus: 'fuchsia',
};

/**
 * O arquivo que está atravessando as ferramentas, em uma barra só.
 *
 * Substituiu `app-current-file-bar` e `app-current-audio-file-bar`, que eram a
 * mesma barra escrita duas vezes e tinham divergido: só a de imagem tinha
 * miniatura e o ponto pulsante de "resultado pronto"; só a de áudio tinha faixa
 * de cor por formato e um Limpar que navegava. Quem usava PDF ou privacidade não
 * tinha barra nenhuma — nem breadcrumb, nem desfazer.
 *
 * Três coisas aqui são de propósito:
 *
 * - **O "Enviar para…" existe ANTES de rodar qualquer coisa.** Os chips da barra
 *   de ações só aparecem depois que há um resultado, o que deixava a cadeia
 *   invisível justamente para quem abriu a ferramenta errada. Aqui a lista sai de
 *   `nextToolsFor(kind)`, então ela também é o único lugar sem limite de itens —
 *   os chips mostram seis, este popover mostra todos.
 * - **Desfazer não navega mais.** Antes fazia `navigate(['/'])` para forçar a
 *   ferramenta a se reconstruir com o arquivo restaurado — o que expulsava a
 *   pessoa da ferramenta, e de quebra trocava o idioma, porque a rota `''` é um
 *   `redirectTo: 'pt'` e quem estava em `/en/...` caía no site em português.
 *   `hydrateFromWorkspace` reage à sessão, então trocar o arquivo por baixo é o
 *   suficiente.
 * - **Sem miniatura fora de imagem.** Renderizar a primeira página de um PDF aqui
 *   custaria carregar o pdf.js em toda rota com um documento na sessão; o
 *   distintivo com o tom do tipo diz a mesma coisa por nada.
 */
@Component({
  selector: 'app-file-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [ButtonDirective, IconComponent],
  styles: [
    `
      .eq-wrap {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 18px;
        flex-shrink: 0;
      }

      .eq-bar {
        display: block;
        width: 3px;
        border-radius: 2px;
        animation: eq-dance 1.5s ease-in-out infinite;
        transform-origin: center bottom;
      }

      .eq-bar:nth-child(1) { height: 55%; animation-delay: 0s; }
      .eq-bar:nth-child(2) { height: 90%; animation-delay: 0.18s; }
      .eq-bar:nth-child(3) { height: 40%; animation-delay: 0.09s; }
      .eq-bar:nth-child(4) { height: 75%; animation-delay: 0.27s; }

      @keyframes eq-dance {
        0%, 100% { transform: scaleY(0.22); opacity: 0.55; }
        50% { transform: scaleY(1); opacity: 1; }
      }

      @media (prefers-reduced-motion: reduce) {
        .eq-bar { animation: none; transform: none; opacity: 0.7; }
      }

      .bar-enter {
        animation: bar-slide-down 0.22s var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)) both;
      }

      @keyframes bar-slide-down {
        from { opacity: 0; transform: translateY(-6px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `,
  ],
  template: `
    @if (workspace.session(); as session) {
      <!--
        z-50 SÓ enquanto o popover está aberto, e isso não é polimento.

        app-top-bar é sticky z-40 NO HOST, o que cria um contexto de
        empilhamento. Esta barra fica logo abaixo dela e não tem z-index, então
        vive na camada auto da raiz — ou seja, ABAIXO do cabeçalho inteiro. O
        z-50 do menu só competia dentro deste contexto, e o resultado era que os
        primeiros itens do "Enviar para…" ficavam por baixo do cabeçalho sticky e
        simplesmente não recebiam clique (o e2e falhava com "app-top-bar subtree
        intercepts pointer events"). É a mesma armadilha que o próprio
        app-top-bar documenta por outro motivo: a caixa do host não é a que se
        imagina lendo só o template.

        Elevar de vez seria pior: a barra não é sticky, então ao rolar a página
        ela passaria POR CIMA do cabeçalho. Elevada só enquanto o menu existe,
        cada estado fica na camada certa.
      -->
      <div
        class="bar-enter relative flex items-center gap-3 border-b border-line bg-surface px-5 py-2 md:px-8"
        [class.z-50]="menuOpen()"
        [style.background]="barBg()"
        [attr.aria-label]="i18n.t()['common.working_file']"
      >
        <span
          class="absolute left-0 top-0 h-full w-[3px] shrink-0 rounded-r-full"
          [style.background-color]="toneFg()"
          aria-hidden="true"
        ></span>

        <!-- A cara do arquivo: miniatura quando é imagem, equalizador quando é
             áudio, distintivo do tipo no resto.

             E onde há o que mostrar ela é o GATILHO do visualizador em tela
             cheia. É o único gatilho que serve para as 57 ferramentas: esta
             barra é a única faixa presente em toda rota e nos cinco módulos, e
             tocá-la não disputa gesto com ferramenta nenhuma — o palco de seis
             delas é uma caixa que se arrasta (cropper.js no recortar, no 3x4 e
             no recorte de vídeo; app-region-overlay nas três de censura), e ali
             um toque que abrisse visualizador quebraria a ferramenta para
             consertar a navegação. -->
        @if (viewable()) {
          <button
            type="button"
            class="ml-1 shrink-0 rounded-sm transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            [attr.aria-label]="i18n.t()['viewer.expand']"
            [title]="i18n.t()['viewer.expand']"
            (click)="expand()"
          >
            @if (thumb(); as src) {
              <img
                [src]="src"
                alt=""
                class="checkerboard h-8 w-8 rounded-sm border border-line object-cover"
              />
            } @else {
              <span
                class="flex h-8 w-8 items-center justify-center rounded-md"
                [style.background-color]="toneBg()"
                [style.color]="toneFg()"
              >
                <app-icon [name]="face().icon" [size]="16" />
              </span>
            }
          </button>
        } @else if (session.kind === 'audio') {
          <div class="eq-wrap ml-1.5" aria-hidden="true">
            <span class="eq-bar" [style.background-color]="toneFg()"></span>
            <span class="eq-bar" [style.background-color]="toneFg()"></span>
            <span class="eq-bar" [style.background-color]="toneFg()"></span>
            <span class="eq-bar" [style.background-color]="toneFg()"></span>
          </div>
        } @else {
          <span
            class="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
            [style.background-color]="toneBg()"
            [style.color]="toneFg()"
            aria-hidden="true"
          >
            <app-icon [name]="face().icon" [size]="16" />
          </span>
        }

        <!-- O nome do arquivo LEVA de volta para onde ele estava sendo mexido.
             Sair de uma ferramenta para a home era mão única: o arquivo continuava
             aqui na barra e voltar significava achar a ferramenta na grade outra
             vez. Vira botão só quando há destino e ele não é a página atual —
             um botão que não sai do lugar é pior do que texto. -->
        <button
          type="button"
          class="group flex min-w-0 flex-1 flex-col justify-center rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          [class.cursor-default]="!returnLabel()"
          [disabled]="!returnLabel()"
          [attr.aria-label]="returnLabel()"
          [title]="returnLabel()"
          (click)="openLastTool()"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="truncate text-sm font-medium text-text group-enabled:group-hover:underline">{{
              session.file.name
            }}</span>

            <span
              class="shrink-0 rounded-sm px-1.5 py-px font-mono text-2xs font-semibold uppercase tracking-wider"
              [style.background-color]="toneBg()"
              [style.color]="toneFg()"
              >{{ ext() }}</span
            >

            <span class="hidden shrink-0 font-mono text-xs text-faint tabular sm:inline">{{
              size()
            }}</span>

            @if (hasPending()) {
              <!-- Pulsa enquanto há resultado ainda não commitado: qualquer
                   navegação o leva junto, e o ponto é o que conta isso. -->
              <span class="shrink-0" [title]="i18n.t()['common.next_tool']" aria-hidden="true">
                <span class="relative flex h-2 w-2">
                  <span
                    class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"
                  ></span>
                  <span class="relative inline-flex h-2 w-2 rounded-full bg-accent"></span>
                </span>
              </span>
            }
          </div>

          @if (steps().length) {
            <span class="truncate text-xs text-faint">{{ steps().join('  →  ') }}</span>
          }
        </button>

        <div class="flex shrink-0 items-center gap-1.5 md:gap-2">
          <div class="relative">
            <button
              appButton
              variant="ghost"
              size="sm"
              [attr.aria-expanded]="menuOpen()"
              aria-haspopup="menu"
              (click)="menuOpen.set(!menuOpen())"
            >
              <span class="hidden sm:inline">{{ i18n.t()['common.send_to'] }}</span>
              <app-icon name="chevronDown" [size]="14" />
            </button>

            @if (menuOpen()) {
              <!-- Mesmo padrão do switcher de módulo: o clique-fora mora num irmão
                   em tela cheia, então não há listener global para vazar nem
                   corrida com o clique que abriu o menu. -->
              <div class="fixed inset-0 z-40" (click)="menuOpen.set(false)"></div>

              <div
                role="menu"
                class="fixed inset-x-4 top-[104px] z-50 max-h-[60vh] overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-pop
                       sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1 sm:w-[268px]"
              >
                @for (tool of destinations(); track tool.id) {
                  <button
                    role="menuitem"
                    type="button"
                    (click)="go(tool)"
                    class="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-raised"
                  >
                    <span
                      [style.--tone-fg]="'var(--tone-' + tool.tone + '-fg)'"
                      [style.--tone-bg]="'var(--tone-' + tool.tone + '-bg)'"
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--tone-bg)] text-[color:var(--tone-fg)]"
                    >
                      <app-icon [name]="tool.icon" [size]="15" />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-sm text-text">{{
                      i18n.t()[tool.navKey]
                    }}</span>
                    <span class="shrink-0 text-faint"><app-icon name="arrowRight" [size]="12" /></span>
                  </button>
                } @empty {
                  <p class="px-3 py-3 text-center text-xs text-muted">
                    {{ i18n.t()['common.send_to_empty'] }}
                  </p>
                }
              </div>
            }
          </div>

          @if (undoLabel(); as label) {
            <button appButton variant="ghost" size="sm" (click)="workspace.undo()">
              <app-icon name="undo" [size]="14" />
              <span class="hidden sm:inline">{{ label }}</span>
            </button>
          }

          <button appButton variant="ghost" size="sm" (click)="clear()">
            <app-icon name="close" [size]="14" />
            <span class="hidden sm:inline">{{ i18n.t()['common.clear'] }}</span>
          </button>
        </div>
      </div>
    }
  `,
})
export class FileBarComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly router = inject(Router);
  private readonly activeTool = inject(ActiveToolService);
  private readonly pendingTransition = inject(PendingTransitionService);

  protected readonly workspace = inject(WorkspaceService);
  private readonly viewer = inject(FileViewerService);
  protected readonly i18n = inject(TranslationService);

  protected readonly menuOpen = signal(false);
  protected readonly thumb = signal<string | null>(null);

  /** True when there is an uncommitted result — drives the pulsing dot. */
  protected readonly hasPending = this.pendingTransition.hasPending;

  protected readonly face = computed(() => KIND_FACE[this.workspace.kind() ?? 'any']);

  /**
   * Tem o que mostrar em tela cheia?
   *
   * Imagem e vetor têm pixels prontos; PDF é rasterizado dentro do visualizador,
   * e é por isso que ele entra aqui sem contradizer a regra desta barra de não
   * carregar o pdf.js — quem paga por ele é quem toca, não toda rota com um
   * documento na sessão. Áudio, vídeo e binário ficam de fora: não há o que ver,
   * e um botão que abre uma tela vazia é pior do que nenhum botão.
   */
  protected readonly viewable = computed(() => {
    const kind = this.workspace.kind();
    return kind === 'image' || kind === 'svg' || kind === 'pdf';
  });

  private readonly tone = computed(() => {
    const kind = this.workspace.kind();
    if (kind !== 'audio') return this.face().tone;
    return AUDIO_TONE[this.ext().toLowerCase()] ?? 'violet';
  });

  protected readonly toneFg = computed(() => `var(--tone-${this.tone()}-fg)`);
  protected readonly toneBg = computed(() => `var(--tone-${this.tone()}-bg)`);

  /** Um tom de nada atrás da barra, esvaindo para a superfície lisa. */
  protected readonly barBg = computed(
    () => `linear-gradient(to right, var(--tone-${this.tone()}-bg) 0%, transparent 35%)`,
  );

  protected readonly ext = computed(() => {
    const file = this.workspace.currentFile();
    return file?.name.split('.').pop()?.toUpperCase() ?? (this.workspace.kind() ?? '').toUpperCase();
  });

  protected readonly size = computed(() => {
    const file = this.workspace.currentFile();
    return file ? formatBytes(file.size) : '';
  });

  protected readonly steps = computed(() =>
    this.workspace.history().map((id) => this.i18n.t()[toolById(id).navKey]),
  );

  /** A lista inteira, sem `MAX_NEXT_TOOL_CHIPS`: um popover rola, um painel não. */
  protected readonly destinations = computed<readonly ToolDef[]>(() =>
    nextToolsFor(this.workspace.kind(), this.activeTool.tool()?.id ?? null),
  );


  /**
   * "Voltar para Marca d'Água" — o rótulo nomeia o destino, como o do desfazer.
   *
   * Null em dois casos, e nos dois o nome do arquivo fica sendo só texto: quando
   * não há ferramenta nenhuma para onde voltar (uma gravação que entrou sem id),
   * e quando a pessoa JÁ está nessa ferramenta. Um botão que não leva a lugar
   * nenhum é pior do que não ter botão.
   */
  protected readonly returnLabel = computed(() => {
    const tool = this.workspace.lastTool();
    if (!tool || tool === this.activeTool.tool()?.id) return null;

    return `${this.i18n.t()['common.back_to']} ${this.i18n.t()[toolById(tool).navKey]}`;
  });

  protected openLastTool(): void {
    const tool = this.workspace.lastTool();
    if (tool && this.returnLabel()) this.go(toolById(tool));
  }

  /**
   * "Desfazer Cortar", não "Desfazer" — o botão fica colado no breadcrumb, então
   * ele deve nomear o passo que vai tirar de lá. Null num upload intocado.
   */
  protected readonly undoLabel = computed(() => {
    const tool = this.workspace.undoableTool();
    return tool
      ? `${this.i18n.t()['common.undo_tool']} ${this.i18n.t()[toolById(tool).navKey]}`
      : null;
  });

  constructor() {
    effect(() => {
      const file = this.workspace.currentFile();
      const kind = this.workspace.kind();
      // SVG entra junto: é uma imagem, o <img> a desenha, e sem isto o vetor
      // cairia no distintivo genérico e o visualizador abriria sem nada dentro.
      const isImage = kind === 'image' || kind === 'svg';
      // `thumb` é lido untracked de propósito: rastreá-lo faria o efeito depender
      // do signal que ele mesmo escreve, e cada passada cunharia outra object URL
      // — um laço infinito que travava a aba assim que um arquivo entrava.
      const previous = untracked(this.thumb);

      if (!file || !isImage) {
        this.urls.revoke(previous);
        this.thumb.set(null);
        return;
      }

      this.thumb.set(this.urls.replace(previous, file));
    });

    const destroy = inject(DestroyRef);
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.menuOpen()) this.menuOpen.set(false);
    };
    // Mesma razão do top-bar: `window` não existe no Node da geração estática.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      window.addEventListener('keydown', onKeydown);
      destroy.onDestroy(() => window.removeEventListener('keydown', onKeydown));
    }
  }

  protected go(tool: ToolDef): void {
    this.menuOpen.set(false);
    const lang = this.i18n.currentLang();
    void this.router.navigateByUrl(`/${lang}/${toolPath(tool, lang)}`);
  }

  /** Abre o arquivo da SESSÃO em tela cheia — nunca um resultado ainda não commitado. */
  protected expand(): void {
    const session = this.workspace.session();
    if (!session) return;

    this.viewer.show({
      name: session.file.name,
      kind: session.kind,
      src: this.thumb(),
      file: session.file,
    });
  }

  /** Limpa sem navegar: a ferramenta aberta reage à sessão e volta para o dropzone. */
  protected clear(): void {
    this.menuOpen.set(false);
    this.pendingTransition.clear();
    this.workspace.clear();
  }
}
