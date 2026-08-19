import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ActiveToolService } from '../../core/services/active-tool.service';
import { TranslationService } from '../../core/services/translation.service';
import { type ToolDef, moduleById, toolPath, toolsOfModule } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';

const LINK =
  'relative flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors';
// Rail tokens, not white/xx: the rail is light, and literal white text on it is
// invisible.
const ACTIVE = `${LINK} bg-rail-active text-accent`;
const IDLE = `${LINK} text-rail-muted hover:bg-rail-hover hover:text-rail-text`;

/**
 * The rail: the tools of the module you are in, and nothing else.
 *
 * Plain `routerLink`s. Carrying the current tool's pending result forward is
 * `PendingTransitionService`'s job, and it does it on `NavigationStart` — the rail
 * used to intercept its own clicks for that, which worked here and left every other
 * way out of a module (palette, module switcher, Back) dropping the file.
 *
 * Active state is resolved in TS rather than with an arbitrary [&.is-active]:
 * Tailwind variant — the CSS parser silently DROPS those rules, which would leave
 * the current tool with no highlight at all.
 */
@Component({
  selector: 'app-tool-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    @if (module(); as mod) {
      <nav class="flex flex-col gap-0.5" [attr.aria-label]="i18n.t()['nav.tools']">
        <p
          class="flex items-baseline gap-2 px-2.5 pb-1.5 pt-1 text-2xs font-semibold uppercase tracking-wider text-rail-faint"
        >
          <span>{{ i18n.t()[mod.nameKey] }}</span>
          <span class="font-mono tabular normal-case tracking-normal">{{ tools().length }}</span>
        </p>

        @for (tool of tools(); track tool.id) {
          <a
            [routerLink]="path(tool)"
            routerLinkActive
            #rla="routerLinkActive"
            [attr.aria-current]="rla.isActive ? 'page' : null"
            [class]="rla.isActive ? active : idle"
          >
            @if (rla.isActive) {
              <span
                class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent"
              ></span>
            }
            <span
              [style.--tone-fg]="'var(--tone-' + tool.tone + '-fg)'"
              class="shrink-0 text-[color:var(--tone-fg)]"
            >
              <app-icon [name]="tool.icon" [size]="16" />
            </span>
            {{ i18n.t()[tool.navKey] }}
          </a>
        }

        <a
          [routerLink]="'/' + i18n.currentLang()"
          class="mt-2 flex items-center gap-2.5 rounded-md border-t border-rail-line px-2.5 pb-2 pt-3 text-xs text-rail-faint transition-colors hover:text-rail-text"
        >
          <app-icon name="modules" [size]="14" class="shrink-0" />
          {{ i18n.t()['nav.modules'] }}
        </a>
      </nav>
    }
  `,
})
export class ToolNavComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly activeTool = inject(ActiveToolService);

  protected readonly active = ACTIVE;
  protected readonly idle = IDLE;

  protected readonly module = computed(() => {
    const id = this.activeTool.module();
    return id ? moduleById(id) : null;
  });

  protected readonly tools = computed(() => {
    const id = this.activeTool.module();
    return id ? toolsOfModule(id) : [];
  });

  protected path(tool: ToolDef): string {
    const lang = this.i18n.currentLang();
    return `/${lang}/${toolPath(tool, lang)}`;
  }
}
