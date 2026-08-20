import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslationService } from '../../core/services/translation.service';
import { SeoService } from '../../core/services/seo.service';
import { GENERIC_FAQ_KEYS, TOOL_CONTENT, type FaqEntry } from '../../core/seo/tool-content';
import { type ToolId, toolById } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';

/**
 * The FAQ below a tool, and the SOURCE of that page's FAQPage markup.
 *
 * It registers what it renders with SeoService (see setVisibleFaq), which is
 * what makes the structured data incapable of describing questions the page
 * does not show — the previous arrangement injected five hardcoded questions
 * about PDFs onto all 72 URLs, including pages with no FAQ at all.
 */
@Component({
  selector: 'app-faq',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (entries().length > 0) {
      <section class="mt-16 mb-12 w-full border-t border-line/80 pt-12">
        <div class="mx-auto max-w-3xl text-center">
          <div class="mb-3.5 inline-flex items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3.5 py-1.5 text-xs font-semibold text-accent">
            <app-icon name="check" [size]="14" />
            <span>{{ i18n.t()['faq.badge'] }}</span>
          </div>
          <!--
            Como PÁGINA o título é h1; como seção, h2.

            Este componente nasceu seção — ele fecha toda página de ferramenta,
            que já tem o próprio h1, e ali h2 é o nível certo. Só que as rotas
            /pt/faq e /en/faq montam o MESMO componente como página inteira, e
            nessas duas o h2 era o único cabeçalho do documento: uma página
            sobre perguntas, sem h1, que é justamente a que deveria aparecer
            para busca em forma de pergunta. Auditoria das 74 páginas geradas
            acusou exatamente essas duas.
          -->
          @if (isPage) {
            <h1 class="text-2xl font-semibold tracking-tight text-text">{{ heading() }}</h1>
          } @else {
            <h2 class="text-xl font-semibold tracking-tight text-text">{{ heading() }}</h2>
          }
          @if (!toolId()) {
            <p class="mt-2.5 text-sm font-medium leading-relaxed text-muted">{{ i18n.t()['faq.subtitle'] }}</p>
          }
        </div>

        <div class="mx-auto mt-8 max-w-3xl space-y-4">
          @for (item of entries(); track item.q) {
            <details
              class="group rounded-xl border border-line-strong bg-surface p-5 shadow-sm transition-all duration-200 hover:border-accent [&[open]]:border-accent [&[open]]:border-l-4 [&[open]]:border-l-accent [&[open]]:bg-raised/60"
            >
              <!--
                A pergunta é CABEÇALHO, não um span.

                Medido nas 74 páginas geradas: uma página de ferramenta tinha
                h1 (o nome da ferramenta), um h2 (o título desta seção) e mais
                nada abaixo — as perguntas, que são justamente o texto que casa
                com busca em forma de pergunta, não existiam na estrutura do
                documento. Um nível abaixo do cabeçalho da seção: h3 dentro de
                uma ferramenta, h2 na rota /faq, onde o cabeçalho acima é h1.

                O elemento summary aceita conteúdo de cabeçalho pelo HTML
                Standard, e o heading tem que ficar DENTRO dele: fora, o clique
                que abre o details deixaria de alcançar o texto da pergunta.
              -->
              <summary class="flex cursor-pointer select-none list-none items-center justify-between text-text [&::-webkit-details-marker]:hidden">
                @if (isPage) {
                  <h2 class="pr-4 text-base font-semibold leading-snug text-text">{{ item.q }}</h2>
                } @else {
                  <h3 class="pr-4 text-base font-semibold leading-snug text-text">{{ item.q }}</h3>
                }
                <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-accent transition-transform duration-200 group-open:rotate-180 group-open:bg-accent-soft">
                  <app-icon name="chevronDown" [size]="18" />
                </span>
              </summary>
              <div class="mt-3.5 border-t border-line/80 pt-3.5 text-sm leading-relaxed text-muted">
                {{ item.a }}
              </div>
            </details>
          }
        </div>
      </section>
    }
  `,
})
export class FaqComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly seo = inject(SeoService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Absent → the generic sitewide set from the dictionary. */
  readonly toolId = input<ToolId | undefined>(undefined);

  /**
   * Verdadeiro quando este componente É a rota, e não uma seção dentro de outra.
   *
   * Lido uma vez na construção, e não como signal, porque é isso que o mantém
   * estável entre o prerender e a hidratação: um componente de rota só é
   * instanciado depois que a navegação resolveu, então `router.url` já vale o
   * mesmo dos dois lados. Reavaliar depois só abriria espaço para o servidor
   * ter escrito h1 e o cliente decidir h2 — que é exatamente o mismatch que
   * faria o Angular descartar e re-renderizar esta subárvore.
   *
   * O `toolId` sozinho não serve como sinal: ele também é ausente na home, onde
   * o FAQ aparece como seção sob um h1 que já existe.
   */
  protected readonly isPage = /\/faq$/.test(inject(Router).url.split(/[?#]/)[0]);

  protected readonly entries = computed<readonly FaqEntry[]>(() => {
    const dict = this.i18n.t();
    const id = this.toolId();
    const content = id ? TOOL_CONTENT[id] : undefined;

    if (content) return content[this.i18n.currentLang() === 'en' ? 'en' : 'pt'].faq;

    // Falls back to faq.q1..q5, which already drive the /faq route and the home
    // page. A tool with no entry of its own shows the generic set rather than
    // nothing, and the markup follows suit.
    return GENERIC_FAQ_KEYS.map((keys) => ({ q: dict[keys.q], a: dict[keys.a] }));
  });

  /** A tool's FAQ heading carries its name — the page's second-heaviest heading. */
  protected readonly heading = computed(() => {
    const id = this.toolId();
    if (!id || !TOOL_CONTENT[id]) return this.i18n.t()['faq.title'];
    return `${this.i18n.t()['faq.about']} ${this.i18n.t()[toolById(id).titleKey]}`;
  });

  constructor() {
    effect(() => {
      this.seo.setVisibleFaq(this.entries(), this.router.url.split(/[?#]/)[0]);
    });
    this.destroyRef.onDestroy(() => this.seo.clearVisibleFaq());
  }
}
