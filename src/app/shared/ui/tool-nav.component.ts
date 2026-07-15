import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslationService } from '../../core/services/translation.service';
import { TOOLS } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';

const LINK =
  'relative flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors';
// Rail tokens, not white/xx: the rail is light in the light theme, and literal
// white text on it is invisible.
const ACTIVE = `${LINK} bg-rail-active text-accent`;
const IDLE = `${LINK} text-rail-muted hover:bg-rail-hover hover:text-rail-text`;

/**
 * The sidebar rail (and, on mobile, a scrollable strip).
 *
 * Active state is resolved in TS rather than with an arbitrary `[&.is-active]:`
 * Tailwind variant — the CSS parser silently DROPS those rules, which would
 * leave the current tool with no highlight at all.
 */
@Component({
  selector: 'app-tool-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <nav
      class="flex gap-0.5"
      [class.flex-col]="!horizontal()"
      [attr.aria-label]="i18n.t()['nav.tools']"
    >
      @for (tool of tools; track tool.id) {
        <a
          [routerLink]="'/' + tool.path"
          routerLinkActive
          #rla="routerLinkActive"
          [attr.aria-current]="rla.isActive ? 'page' : null"
          [class]="rla.isActive ? active : idle"
        >
          @if (rla.isActive && !horizontal()) {
            <span class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent"></span>
          }

          <!-- The icon keeps the tool's tone in both states, so the rail carries the
               same colour coding as the home grid; the label stays a rail token. -->
          <span
            [style.--tone-fg]="'var(--tone-' + tool.tone + '-fg)'"
            class="shrink-0 text-[color:var(--tone-fg)]"
          >
            <app-icon [name]="tool.icon" [size]="16" />
          </span>
          {{ i18n.t()[tool.navKey] }}
        </a>
      }
    </nav>
  `,
})
export class ToolNavComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tools = TOOLS;
  protected readonly active = ACTIVE;
  protected readonly idle = IDLE;

  readonly horizontal = input(false, { transform: booleanAttribute });
}
