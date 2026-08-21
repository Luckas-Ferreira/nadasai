import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { input } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
import { TOOL_ARTICLE, type ArticleSection } from '../../core/seo/tool-article';
import type { FormatPair } from '../../core/seo/format-pairs';
import type { ToolId } from '../../core/tools/tools';

/**
 * O texto longo da ferramenta, entre o trabalho e o FAQ.
 *
 * Renderiza NADA quando a ferramenta não tem entrada em `TOOL_ARTICLE` — as 36
 * páginas não vão ganhar o texto no mesmo dia, e uma seção vazia com um título
 * genérico seria pior do que a ausência dela. A cobertura cresce por arquivo de
 * conteúdo, sem tocar em componente nenhum.
 *
 * `h2` por seção, sob o `h1` do cabeçalho da página e acima dos `h3` das
 * perguntas do FAQ. Essa é a hierarquia inteira do documento, e ela não existia:
 * antes deste componente a página tinha um h1 e um único h2, que era o título do
 * FAQ.
 */
@Component({
  selector: 'app-tool-article',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sections().length > 0) {
      <article class="mx-auto mt-16 w-full max-w-3xl border-t border-line/80 pt-12">
        @for (section of sections(); track section.h) {
          <section class="mb-9 last:mb-0">
            <h2 class="mb-3 text-xl font-semibold tracking-tight text-text">{{ section.h }}</h2>

            @for (paragraph of section.p; track paragraph) {
              <p class="mb-3 text-sm leading-relaxed text-muted last:mb-0">{{ paragraph }}</p>
            }

            @if (section.steps; as steps) {
              <ol class="mt-4 space-y-2.5">
                @for (step of steps; track step; let i = $index) {
                  <li class="flex gap-3 text-sm leading-relaxed text-muted">
                    <span
                      class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent-soft font-mono tabular text-xs font-semibold text-accent"
                      aria-hidden="true"
                    >{{ i + 1 }}</span>
                    <span class="min-w-0">{{ step }}</span>
                  </li>
                }
              </ol>
            }
          </section>
        }
      </article>
    }
  `,
})
export class ToolArticleComponent {
  private readonly i18n = inject(TranslationService);

  readonly toolId = input.required<ToolId>();

  /**
   * Numa página de par de formato o texto é o DO PAR, não o da ferramenta.
   * Sem isto, /png-para-jpg renderizaria o artigo de "converter" — o mesmo
   * texto em doze URLs, que é conteúdo duplicado fino e pior do que não ter
   * seção nenhuma.
   */
  readonly pair = input<FormatPair | null>(null);

  protected readonly sections = computed<readonly ArticleSection[]>(() => {
    const en = this.i18n.currentLang() === 'en';

    const pair = this.pair();
    if (pair) return (en ? pair.en : pair.pt).sections;

    const entry = TOOL_ARTICLE[this.toolId()];
    if (!entry) return [];
    return en ? entry.en : entry.pt;
  });
}
