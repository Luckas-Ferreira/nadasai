import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input, signal } from '@angular/core';
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
      class="flex gap-1"
      [class.flex-col]="!horizontal()"
      [attr.aria-label]="i18n.t()['nav.tools']"
    >
      @if (!horizontal()) {
        <!-- Image Module -->
        <button 
          (click)="imageOpen.set(!imageOpen())"
          class="group flex items-center justify-between w-full px-2.5 py-2 text-2xs font-semibold uppercase tracking-wider text-rail-faint hover:text-rail-text transition-colors mt-2 first:mt-0"
        >
          <span>Módulo de Imagem</span>
          <app-icon 
            [name]="imageOpen() ? 'chevronDown' : 'chevronRight'" 
            [size]="14" 
            class="opacity-60 group-hover:opacity-100 transition-opacity" 
          />
        </button>
        
        @if (imageOpen()) {
          <div class="flex flex-col gap-0.5 mb-2">
            @for (tool of imageTools; track tool.id) {
              <a
                [routerLink]="'/' + i18n.currentLang() + '/' + (i18n.currentLang() === 'en' ? tool.pathEn : tool.pathPt)"
                routerLinkActive
                #rla="routerLinkActive"
                [attr.aria-current]="rla.isActive ? 'page' : null"
                [class]="rla.isActive ? active : idle"
              >
                @if (rla.isActive) {
                  <span class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent"></span>
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
          </div>
        }

        <!-- PDF Module -->
        <button 
          (click)="pdfOpen.set(!pdfOpen())"
          class="group flex items-center justify-between w-full px-2.5 py-2 text-2xs font-semibold uppercase tracking-wider text-rail-faint hover:text-rail-text transition-colors mt-2"
        >
          <span>Módulo de PDF</span>
          <app-icon 
            [name]="pdfOpen() ? 'chevronDown' : 'chevronRight'" 
            [size]="14" 
            class="opacity-60 group-hover:opacity-100 transition-opacity" 
          />
        </button>
        
        @if (pdfOpen()) {
          <div class="flex flex-col gap-0.5">
            @for (tool of pdfTools; track tool.id) {
              <a
                [routerLink]="'/' + i18n.currentLang() + '/' + (i18n.currentLang() === 'en' ? tool.pathEn : tool.pathPt)"
                routerLinkActive
                #rla="routerLinkActive"
                [attr.aria-current]="rla.isActive ? 'page' : null"
                [class]="rla.isActive ? active : idle"
              >
                @if (rla.isActive) {
                  <span class="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent"></span>
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
          </div>
        }

      } @else {
        <!-- Mobile flat list fallback (if used somewhere else) -->
        @for (tool of tools; track tool.id) {
          <a
            [routerLink]="'/' + i18n.currentLang() + '/' + (i18n.currentLang() === 'en' ? tool.pathEn : tool.pathPt)"
            routerLinkActive
            #rla="routerLinkActive"
            [attr.aria-current]="rla.isActive ? 'page' : null"
            [class]="rla.isActive ? active : idle"
          >
            <span
              [style.--tone-fg]="'var(--tone-' + tool.tone + '-fg)'"
              class="shrink-0 text-[color:var(--tone-fg)]"
            >
              <app-icon [name]="tool.icon" [size]="16" />
            </span>
            {{ i18n.t()[tool.navKey] }}
          </a>
        }
      }
    </nav>
  `,
})
export class ToolNavComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tools = TOOLS;
  protected readonly imageTools = TOOLS.filter(t => t.category === 'image');
  protected readonly pdfTools = TOOLS.filter(t => t.category === 'pdf');
  protected readonly active = ACTIVE;
  protected readonly idle = IDLE;

  readonly horizontal = input(false, { transform: booleanAttribute });

  protected readonly imageOpen = signal(true);
  protected readonly pdfOpen = signal(true);
}
