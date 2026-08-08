import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ActiveToolService } from '../../core/services/active-tool.service';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService } from '../../core/services/translation.service';
import { type ToolDef, toolPath, toolsOfModule } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';

/**
 * The phone equivalent of the rail: the current module's tools, one row.
 *
 * The previous version was a `grid-cols-5` of every tool in a module, which was
 * true to its comment ("shows every tool at once, nothing behind a scroll") only
 * while a module had five tools. With nine it silently became two rows eating
 * ~130px of a phone screen, and it would have grown a third.
 *
 * So: one row, scrolled horizontally, with the active tool pulled into view on
 * every navigation. That last part is what makes the scroll acceptable — the old
 * scroll strip this replaced was abandoned precisely because the current tool
 * could sit off-screen with nothing saying so.
 *
 * Hidden outside a module, like the rail: on the home page the grid IS the
 * navigation, and a bar repeating part of it would just cover it.
 *
 * Like the rail, clicks are intercepted to commit any pending result before the
 * route change — so navigating from this bar also skips the home detour.
 */
@Component({
  selector: 'app-mobile-tool-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    @if (tools().length) {
      <div
        class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <nav
          #strip
          class="flex snap-x snap-mandatory gap-1 overflow-x-auto px-2 py-1.5"
          [attr.aria-label]="i18n.t()['nav.module_tools']"
        >
          @for (tool of tools(); track tool.id) {
            <a
              [routerLink]="path(tool)"
              routerLinkActive
              #rla="routerLinkActive"
              [attr.aria-current]="rla.isActive ? 'page' : null"
              [class]="rla.isActive ? itemActive : itemIdle"
              (click)="onToolClick(tool)"
            >
              <span
                [style.--tone-fg]="'var(--tone-' + tool.tone + '-fg)'"
                class="text-[color:var(--tone-fg)]"
              >
                <app-icon [name]="tool.icon" [size]="20" />
              </span>
              <span class="max-w-full truncate">{{ i18n.t()[tool.shortKey] }}</span>
            </a>
          }
        </nav>
      </div>
    }
  `,
})
export class MobileToolBarComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly activeTool = inject(ActiveToolService);
  private readonly pendingTransition = inject(PendingTransitionService);
  private readonly strip = viewChild<ElementRef<HTMLElement>>('strip');

  private readonly ITEM =
    'flex min-w-[68px] shrink-0 snap-center flex-col items-center gap-1 rounded-md px-2 py-1.5 text-2xs font-medium transition-colors';
  protected readonly itemActive = `${this.ITEM} bg-raised text-accent`;
  protected readonly itemIdle = `${this.ITEM} text-muted`;

  protected readonly tools = computed(() => {
    const id = this.activeTool.module();
    return id ? toolsOfModule(id) : [];
  });

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    effect(() => {
      // Tracked so this reruns per navigation; the element itself is read after a
      // task, because aria-current is stamped by RouterLinkActive during the same
      // change detection pass that this effect is queued in.
      this.activeTool.tool();

      // Rolar não significa nada em tempo de build, e o DOM do platform-server
      // não implementa scrollIntoView — chamá-lo derruba a rota inteira.
      if (!this.isBrowser) return;

      setTimeout(() => {
        const current = this.strip()?.nativeElement.querySelector('[aria-current="page"]');
        current?.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
    });
  }

  protected path(tool: ToolDef): string {
    const lang = this.i18n.currentLang();
    return `/${lang}/${toolPath(tool, lang)}`;
  }

  /**
   * Commit any pending result before letting RouterLink complete the navigation,
   * mirroring the rail behaviour so the mobile bar also skips the home detour.
   */
  protected onToolClick(tool: ToolDef): void {
    if (!this.pendingTransition.hasPending()) return;
    this.pendingTransition.tryCommit();
  }
}
