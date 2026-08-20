import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationService } from '../../core/services/translation.service';
import { type ToolDef, type ToolId, relatedTools, toolPath } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';

/**
 * "Ferramentas relacionadas", no corpo de toda página de ferramenta.
 *
 * A lista vem de `relatedTools()`, que a deriva de `accepts`/`produces` — então
 * ela não é uma curadoria que envelhece ao lado da fonte, e uma ferramenta nova
 * entra nas relacionadas das outras sem ninguém editar nada. O comentário lá
 * explica por que uma das vagas é reservada a outro módulo.
 *
 * Renderiza `<a routerLink>` de verdade, e não chips que navegam por clique: a
 * seção só tem valor de link interno se for um link interno — um `(click)` com
 * `navigateByUrl` não é seguido por crawler nenhum, e some inteiro do HTML
 * prerenderizado.
 */
@Component({
  selector: 'app-related-tools',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    @if (tools().length > 0) {
      <section class="mt-16 w-full border-t border-line/80 pt-12">
        <div class="mx-auto max-w-3xl text-center">
          <h2 class="text-xl font-semibold tracking-tight text-text">{{ i18n.t()['related.title'] }}</h2>
          <p class="mt-2.5 text-sm font-medium leading-relaxed text-muted">
            {{ i18n.t()['related.subtitle'] }}
          </p>
        </div>

        <ul class="mx-auto mt-8 grid max-w-4xl gap-4 sm:grid-cols-2">
          @for (tool of tools(); track tool.id) {
            <li>
              <a
                [routerLink]="path(tool)"
                [style.--tone-fg]="'var(--tone-' + tool.tone + '-fg)'"
                [style.--tone-bg]="'var(--tone-' + tool.tone + '-bg)'"
                class="group flex h-full items-start gap-3.5 rounded-lg border border-line bg-surface p-4
                       transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--tone-fg)] hover:bg-raised"
              >
                <span
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--tone-bg)]
                         text-[color:var(--tone-fg)] transition-transform group-hover:scale-105"
                >
                  <app-icon [name]="tool.icon" [size]="20" />
                </span>

                <span class="min-w-0 flex-1">
                  <span class="block text-base font-semibold text-text transition-colors group-hover:text-accent">
                    {{ i18n.t()[tool.navKey] }}
                  </span>
                  <span class="mt-1 block text-xs text-muted">{{ i18n.t()[tool.descKey] }}</span>
                </span>

                <span
                  class="ml-1 self-center text-faint opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
                >
                  <app-icon name="arrowRight" [size]="16" />
                </span>
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class RelatedToolsComponent {
  protected readonly i18n = inject(TranslationService);

  readonly toolId = input.required<ToolId>();

  protected readonly tools = computed(() => relatedTools(this.toolId()));

  protected path(tool: ToolDef): string {
    const lang = this.i18n.currentLang();
    return `/${lang}/${toolPath(tool, lang)}`;
  }
}
