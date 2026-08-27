import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, signal } from '@angular/core';
import { input } from '@angular/core';
import { FaqComponent } from './faq.component';
import { RelatedToolsComponent } from './related-tools.component';
import { ToolArticleComponent } from './tool-article.component';
import type { FormatPair } from '../../core/seo/format-pairs';
import { WorkspaceService } from '../../core/services/workspace.service';
import { TranslationService } from '../../core/services/translation.service';
import { ToolId, toolById } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';

/**
 * Shell for a tool: heading + stage/panel split.
 *
 * Left-aligned 22px heading. Every tool used to open with its own centred
 * `text-6xl font-black` hero, which pushed the actual work below the fold and
 * was the loudest generated-looking tell in the old design.
 *
 * The body has TWO layouts, keyed off whether a file is loaded:
 *
 * - Empty (no file): a single, narrower column centred in the page. The panel
 *   is empty until there is a file to act on, so the old fixed two-column grid
 *   reserved a 324px track that was always blank — the dropzone sat shoved to
 *   the left with dead space beside and below it, which read as broken.
 * - Loaded: the stage/panel split, where the controls finally have content.
 */
@Component({
  selector: 'app-tool-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, FaqComponent, ToolArticleComponent, RelatedToolsComponent],
  template: `
    <section [class]="pageClass()">
      <header class="mb-5 flex items-start gap-3">
        <span
          [style.--tone-fg]="'var(--tone-' + tool().tone + '-fg)'"
          [style.--tone-bg]="'var(--tone-' + tool().tone + '-bg)'"
          class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--tone-bg)] text-[color:var(--tone-fg)]"
        >
          <app-icon [name]="tool().icon" [size]="19" />
        </span>

        <div>
          <h1 class="text-2xl">{{ headline() }}</h1>
          <p class="mt-0.5 text-md text-muted">{{ subtitle() }}</p>
        </div>
      </header>

      <ng-content select="[banner]" />

      <!-- One container, two shapes. The ng-content slots are declared ONCE (each
           slot projects exactly once), and only the wrapper's classes change: a
           centred single column while empty, the stage/panel grid once loaded.
           The aside simply renders nothing until the tool fills its panel. -->
      <div [class]="loaded() ? loadedLayout : emptyLayout">
        <aside [class]="panelClass()">
          <!-- A ALÇA, só no celular e só com arquivo. Ela é o que transforma a
               coluna de controles numa folha: recolhida, o palco fica com a tela
               inteira; aberta, os controles voltam sem tirar o arquivo de vista.

               Ela fica FORA do ng-content de propósito — o slot é projetado uma
               vez só, então não dá para ter um painel de desktop e uma folha de
               celular com o mesmo conteúdo. O que muda é a classe do aside, que é
               a mesma regra que este componente já segue para as duas formas.
               (Sem crase em nenhum comentário daqui: este template é uma template
               string, e uma crase dentro dele a TERMINA.) -->
          @if (loaded()) {
            <button
              type="button"
              class="sticky top-0 z-10 -mt-1 flex w-full items-center justify-between gap-2 rounded-t-xl bg-surface px-1 py-2.5 md:hidden"
              [attr.aria-expanded]="sheetOpen()"
              [attr.aria-label]="sheetOpen() ? i18n.t()['viewer.hide_controls'] : i18n.t()['viewer.show_controls']"
              (click)="sheetOpen.set(!sheetOpen())"
            >
              <span class="text-sm font-semibold text-text">{{ i18n.t()['viewer.controls'] }}</span>
              <span class="text-muted transition-transform" [class.rotate-180]="!sheetOpen()">
                <app-icon name="chevronDown" [size]="16" />
              </span>
            </button>
          }

          <div [class]="panelContentClass()">
            <ng-content select="[panel]" />
          </div>
        </aside>

        <div class="min-w-0 order-2 lg:order-1">
          <ng-content select="[stage]" />
        </div>
      </div>

      <!-- Below the fold on every tool, in BOTH shapes. A SIBLING of the layout
           wrapper, never a child: inside the loaded grid it would become a third
           cell and land in a column, and inside the empty shape it would be
           squeezed into the 680px dropzone column. Outside, it spans the full
           width either way.

           Placed here rather than in 31 templates — the component already knows
           its toolId, so every tool gains the sections (and its FAQ markup) from
           these three lines.

           A ORDEM É LEITURA, não SEO: o texto longo explica a ferramenta que a
           pessoa acabou de usar, o FAQ responde o que sobrou, e as relacionadas
           são a saída. Juntas elas dão à página a hierarquia que ela não tinha —
           h1 no cabeçalho, h2 por seção do texto, h3 nas perguntas. Medido no
           build: /pt/imagem/cortar saiu de 223 para 891 palavras visíveis, de um
           h2 para seis, e de zero h3 para três.

           O texto longo cobre as ferramentas de maior volume de busca primeiro e
           NÃO renderiza nada onde ainda não existe — 36 páginas de texto ruim de
           uma vez seria pior do que oito boas. -->
      @if (showFaq()) {
        <app-tool-article [toolId]="toolId()" [pair]="pair()" />
        <app-faq [toolId]="toolId()" [pair]="pair()" />
        <app-related-tools [toolId]="toolId()" />
      }
    </section>
  `,
})
export class ToolPageComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly state = inject(WorkspaceService);

  readonly toolId = input.required<ToolId>();
  readonly forceLoaded = input<boolean | undefined>(undefined);
  /** The PDF editor is a full workspace; it can opt out with one attribute. */
  readonly showFaq = input(true, { transform: booleanAttribute });

  /**
   * Preenchido só nas páginas de par de formato (/png-para-jpg e as outras
   * onze). Elas abrem a MESMA ferramenta, mas o h1, o subtítulo, o texto longo
   * e o FAQ são do par: "PNG para JPG" responde à busca que trouxe a pessoa,
   * "Converter" não responde. Sem isto, doze URLs mostrariam o mesmo cabeçalho
   * e o mesmo texto — que é a definição de porta de entrada.
   *
   * O ícone, o tom e o rail continuam sendo os da ferramenta: a página É a
   * ferramenta, e fingir o contrário confundiria quem já a conhece.
   */
  readonly pair = input<FormatPair | null>(null);

  protected readonly tool = computed(() => toolById(this.toolId()));

  private readonly pairContent = computed(() => {
    const pair = this.pair();
    if (!pair) return null;
    return this.i18n.currentLang() === 'en' ? pair.en : pair.pt;
  });

  protected readonly headline = computed(
    () => this.pairContent()?.h1 ?? this.i18n.t()[this.tool().titleKey],
  );

  protected readonly subtitle = computed(
    () => this.pairContent()?.sub ?? this.i18n.t()[this.tool().descKey],
  );

  /**
   * Drives the layout: the panel only has content once THIS tool has a file.
   *
   * `accepts`, not `currentFile()`: a single session now carries whatever the
   * last tool produced, so a PDF in the chain would otherwise put every image
   * tool into the loaded two-column shape with an empty stage and an empty
   * panel — the exact "reserved 324px track that is always blank" this layout
   * was written to get rid of.
   */
  protected readonly loaded = computed(() => {
    const forced = this.forceLoaded();
    if (forced !== undefined) return forced;
    return this.state.accepts(this.toolId());
  });

  /**
   * A folha do celular é `fixed`, então ela FLUTUA sobre o fim da página: sem
   * esta folga o último controle — e depois o texto longo — ficam para sempre
   * atrás dela, sem nada indicando que existe conteúdo ali embaixo.
   */
  protected readonly pageClass = computed(() => {
    const base = 'mx-auto w-full max-w-[1240px]';
    if (!this.loaded()) return base;
    return `${base} ${this.sheetOpen() ? 'pb-[48dvh]' : 'pb-14'} md:pb-0`;
  });

  protected readonly loadedLayout = 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_324px]';
  protected readonly emptyLayout = 'mx-auto w-full max-w-[680px]';

  /**
   * A folha está aberta? Só o celular lê isto.
   *
   * Começa ABERTA, e a escolha é deliberada. Na maioria das 57 ferramentas os
   * controles SÃO a ferramenta — o seletor de formato, a régua de qualidade, as
   * páginas marcadas —, e escondê-los atrás de um toque tornaria cada uso um
   * passo mais longo para ganhar uma tela cheia que o visualizador já entrega
   * melhor (`app-file-viewer`, alcançado pela miniatura da barra de arquivo, sem
   * cromagem nenhuma). Quem quer o arquivo grande enquanto mexe recolhe a folha,
   * e ela fica recolhida enquanto durar a sessão.
   *
   * Inverter o padrão é trocar `true` por `false` aqui, e nada mais.
   */
  protected readonly sheetOpen = signal(true);

  /**
   * O `aside`, em três formas com um conjunto de classes só.
   *
   * O celular é o caso base e o `md:` DESFAZ — nunca `max-md:`. A diferença
   * importa: uma variante que não existisse geraria CSS vazio em silêncio, e o
   * defeito apareceria como "a folha não virou folha" sem nenhum erro em lugar
   * nenhum. `md:` é usado em todo o repositório, então é conhecido bom.
   *
   * `bottom-[var(--mobile-bar-h)]` é o que impede a folha de cobrir a barra de
   * ferramentas do celular; o token mora no `styles.css` e a própria barra é
   * medida por ele, para as duas não divergirem no dia em que um rótulo crescer.
   */
  private readonly SHEET =
    'fixed inset-x-0 bottom-[var(--mobile-bar-h)] z-30 overflow-y-auto overscroll-contain rounded-t-xl ' +
    'border-t border-line bg-surface px-5 pb-4 shadow-pop ' +
    'md:static md:inset-x-auto md:bottom-auto md:z-auto md:max-h-none md:overflow-visible ' +
    'md:rounded-none md:border-t-0 md:bg-transparent md:px-0 md:pb-0 md:shadow-none';

  protected readonly panelClass = computed(() => {
    const base = 'min-w-0 order-1 lg:order-2';
    if (!this.loaded()) return base;

    const height = this.sheetOpen() ? 'max-h-[46dvh]' : 'max-h-[2.9rem]';
    return `${base} ${height} ${this.SHEET}`;
  });

  /** Recolhida, o conteúdo é escondido de verdade: um painel só clipado ainda recebe Tab. */
  protected readonly panelContentClass = computed(() =>
    this.loaded() && !this.sheetOpen() ? 'hidden md:block' : '',
  );
}
