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
    <section [class]="pageClass()" [style.--sheet-h]="sheetHeight()">
      <!-- O CABEÇALHO ENCOLHE NO CELULAR ASSIM QUE HÁ ARQUIVO.

           Ícone de 40px, h1 de 22px e subtítulo: isso é a abertura de um ARTIGO,
           e é o que fazia a pessoa sair da tela cheia do visualizador e sentir
           que tinha caído num site. Com arquivo na mão o assunto já não é qual
           ferramenta é esta — é o arquivo.

           O h1 CONTINUA renderizado, menor. Escondê-lo com display:none seria de
           graça em pixels e caro em SEO: é o único h1 da página, e a indexação é
           mobile-first, então o que o celular não mostra é o que o Google não vê.
           O subtítulo, esse pode sair — ele repete o descKey que a grade da
           home e o rail já disseram para chegar aqui. -->
      <header [class]="headerClass()">
        <span
          [style.--tone-fg]="'var(--tone-' + tool().tone + '-fg)'"
          [style.--tone-bg]="'var(--tone-' + tool().tone + '-bg)'"
          [class]="toneClass()"
        >
          <app-icon [name]="tool().icon" [size]="19" />
        </span>

        <div class="min-w-0">
          <h1 [class]="headlineClass()">{{ headline() }}</h1>
          <p [class]="subtitleClass()">{{ subtitle() }}</p>
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

        <div [class]="stageClass()">
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
   * A ALTURA DA FOLHA, publicada como token para o palco poder subtrair.
   *
   * Ela existia duas vezes — no `max-h` do aside e, implicitamente, no `pb` da
   * página — e agora existe UMA, porque o palco também precisa dela: o que sobra
   * de tela para o arquivo é exatamente o que a folha não ocupa. Sem token, o dia
   * em que alguém trocar 46dvh por 50dvh deixaria um vão ou uma sobreposição, e
   * nada apontaria para a linha que causou. É a mesma decisão do `--mobile-bar-h`
   * no `styles.css`, pelo mesmo motivo.
   *
   * Só o celular lê: no `md:` o aside volta a ser coluna e o palco perde a altura.
   */
  protected readonly sheetHeight = computed(() => (this.sheetOpen() ? '46dvh' : '2.9rem'));

  /**
   * O QUE NÃO É PALCO, no celular.
   *
   * A soma, termo a termo, do que já está ocupado quando o arquivo aparece:
   *
   *   3.5rem            a barra do topo, que é sticky e fica sempre visível
   *   3rem              a barra de arquivo (py-2 em volta de uma miniatura de 32px)
   *   3.25rem           o cabeçalho encolhido, mais a margem dele
   *   1.5rem            o `py-6` do <main>
   *   --safe-top/bottom os recuos do sistema no app empacotado
   *   --mobile-bar-h    a barra de ferramentas do celular
   *   --sheet-h         a folha de controles
   *
   * O resto é do arquivo. Os quatro primeiros são medidas de outros componentes
   * copiadas para cá, e isso é dívida conhecida: um cabeçalho que cresça deixa o
   * palco alto demais e a página rola um pouco. Degrada em rolagem, nunca em
   * conteúdo escondido — que é o motivo de ser `min-height` e não `height`.
   *
   * ── E ELA É UM LITERAL INTEIRO, NUNCA MONTADA POR INTERPOLAÇÃO ────────────
   *
   * O Tailwind não interpreta este arquivo: ele o VARRE atrás de nomes de classe.
   * Escrita como `min-h-[calc(100dvh-` + uma constante, a classe existe em tempo
   * de execução e o CSS dela nunca é gerado — o varredor só viu um fragmento
   * quebrado. O atributo sai no HTML, não casa com regra nenhuma, e o palco
   * simplesmente não tem altura: sem erro, sem aviso, e parecendo que a conta
   * está errada em vez de ausente. Aconteceu ao escrever isto, e só apareceu ao
   * procurar a regra no CSS do build.
   */
  private readonly STAGE_FILL =
    'min-h-[calc(100dvh-3.5rem-3rem-3.25rem-1.5rem-var(--safe-top)-var(--safe-bottom)-var(--mobile-bar-h)-var(--sheet-h))]';



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
   * O `bottom` é o que impede a folha de cobrir a barra de
   * ferramentas do celular; o token mora no `styles.css` e a própria barra é
   * medida por ele, para as duas não divergirem no dia em que um rótulo crescer.
   */
  private readonly SHEET =
    'fixed inset-x-0 bottom-[calc(var(--mobile-bar-h)+var(--safe-bottom))] z-30 overflow-y-auto overscroll-contain rounded-t-xl ' +
    'border-t border-line bg-surface px-5 pb-4 shadow-pop ' +
    'md:static md:inset-x-auto md:bottom-auto md:z-auto md:max-h-none md:overflow-visible ' +
    'md:rounded-none md:border-t-0 md:bg-transparent md:px-0 md:pb-0 md:shadow-none';

  protected readonly panelClass = computed(() => {
    const base = 'min-w-0 order-1 lg:order-2';
    if (!this.loaded()) return base;

    // A altura sai do MESMO token que o palco subtrai, e não de um segundo par
    // de números — ver `sheetHeight`.
    return `${base} max-h-[var(--sheet-h)] ${this.SHEET}`;
  });

  /** Recolhida, o conteúdo é escondido de verdade: um painel só clipado ainda recebe Tab. */
  protected readonly panelContentClass = computed(() =>
    this.loaded() && !this.sheetOpen() ? 'hidden md:block' : '',
  );

  /**
   * O PALCO OCUPA O QUE SOBRA DA TELA, no celular e só com arquivo.
   *
   * Antes ele era o que o componente de dentro pedisse — 420px no
   * `app-preview-surface` —, um número escolhido sem saber o tamanho da tela: num
   * aparelho alto sobrava vão morto entre o palco e a folha, e num baixo o
   * arquivo espremia. Agora a altura é derivada, e o vão deixa de existir nos
   * dois.
   *
   * `min-height`, nunca `height`: se a conta de `STAGE_FILL` errar para mais, o
   * pior caso é a página rolar um pouco — com `height` seria conteúdo cortado.
   *
   * `md:min-h-0` desfaz no desktop, onde o palco volta a ser uma célula da grade
   * e quem manda na altura é a ferramenta.
   */
  protected readonly stageClass = computed(() => {
    const base = 'min-w-0 order-2 lg:order-1';
    if (!this.loaded()) return base;
    return `${base} flex flex-col justify-center ${this.STAGE_FILL} md:block md:min-h-0`;
  });

  /**
   * O cabeçalho, nas duas formas.
   *
   * Com arquivo no celular ele vira uma linha; no desktop e sem arquivo continua
   * o de sempre. Ver o comentário no template para por que o h1 encolhe em vez
   * de sumir.
   */
  protected readonly headerClass = computed(() =>
    this.loaded() ? 'mb-2 flex items-center gap-2 md:mb-5 md:items-start md:gap-3' : 'mb-5 flex items-start gap-3',
  );

  protected readonly toneClass = computed(() => {
    const base = 'flex shrink-0 items-center justify-center rounded-lg bg-[var(--tone-bg)] text-[color:var(--tone-fg)]';
    return this.loaded()
      ? `${base} h-7 w-7 md:mt-0.5 md:h-10 md:w-10`
      : `${base} mt-0.5 h-10 w-10`;
  });

  protected readonly headlineClass = computed(() =>
    this.loaded() ? 'truncate text-base md:text-2xl' : 'text-2xl',
  );

  protected readonly subtitleClass = computed(() =>
    this.loaded() ? 'mt-0.5 hidden text-md text-muted md:block' : 'mt-0.5 text-md text-muted',
  );
}
