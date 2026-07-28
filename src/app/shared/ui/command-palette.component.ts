import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { CommandPaletteService } from '../../core/services/command-palette.service';
import { TranslationService } from '../../core/services/translation.service';
import { TOOLS, type ToolDef, moduleById, toolPath } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';

/**
 * Fold accents and case away so "juncao" finds "Junção" and "pdf" finds "PDF".
 *
 * Portuguese is the default language and half the tool names carry a diacritic;
 * a plain `includes` would make those tools reachable only by typing the accent,
 * which nobody does mid-search.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

interface Hit {
  readonly tool: ToolDef;
  readonly label: string;
  readonly moduleName: string;
  readonly score: number;
}

/**
 * The command palette: every tool of every module, one query away.
 *
 * This is the half of the navigation that scales without bound. The rail is
 * scoped to the current module by design, so it deliberately cannot show you a
 * tool from somewhere else — this is what covers that, and it is why the rail is
 * allowed to stay short. A module added tomorrow is searchable here for free.
 *
 * Matching is prefix-first (`score`), because a list reordered by relevance is
 * the difference between typing two letters and reading nine results. The list
 * is FLAT rather than grouped by module, with the module name on the right: a
 * grouped list needs the keyboard index to walk across group boundaries, which
 * is a whole class of off-by-one bugs bought for nothing here.
 */
@Component({
  selector: 'app-command-palette',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (palette.open()) {
      <div
        class="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
        (click)="palette.close()"
      >
        <div class="absolute inset-0 bg-black/40"></div>

        <div
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="i18n.t()['nav.search_open']"
          class="relative w-full max-w-[560px] overflow-hidden rounded-lg border border-line bg-surface shadow-pop"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center gap-2.5 border-b border-line px-3.5">
            <span class="shrink-0 text-faint"><app-icon name="search" [size]="18" /></span>
            <input
              #field
              type="text"
              autocomplete="off"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              [attr.aria-activedescendant]="hits().length ? 'palette-hit-' + cursor() : null"
              [attr.aria-label]="i18n.t()['nav.search_open']"
              [placeholder]="i18n.t()['nav.search_placeholder']"
              [value]="query()"
              (input)="onQuery($event)"
              (keydown)="onKey($event)"
              class="h-12 w-full min-w-0 bg-transparent text-md text-text outline-none placeholder:text-faint"
            />
          </div>

          @if (hits().length) {
            <ul id="palette-results" role="listbox" class="max-h-[46vh] overflow-y-auto p-1.5">
              @for (hit of hits(); track hit.tool.id; let i = $index) {
                <li>
                  <button
                    type="button"
                    role="option"
                    [id]="'palette-hit-' + i"
                    [attr.aria-selected]="i === cursor()"
                    (click)="go(hit.tool)"
                    (mousemove)="cursor.set(i)"
                    [class]="i === cursor() ? rowActive : rowIdle"
                  >
                    <span
                      [style.--tone-fg]="'var(--tone-' + hit.tool.tone + '-fg)'"
                      [style.--tone-bg]="'var(--tone-' + hit.tool.tone + '-bg)'"
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--tone-bg)] text-[color:var(--tone-fg)]"
                    >
                      <app-icon [name]="hit.tool.icon" [size]="15" />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-left">{{ hit.label }}</span>
                    <span class="shrink-0 text-xs text-faint">{{ hit.moduleName }}</span>
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p class="px-4 py-6 text-center text-sm text-muted">{{ i18n.t()['nav.search_empty'] }}</p>
          }

          <p class="border-t border-line px-3.5 py-2 text-2xs text-faint">
            {{ i18n.t()['nav.search_hint'] }}
          </p>
        </div>
      </div>
    }
  `,
})
export class CommandPaletteComponent {
  protected readonly palette = inject(CommandPaletteService);
  protected readonly i18n = inject(TranslationService);
  private readonly router = inject(Router);

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly query = signal('');
  protected readonly cursor = signal(0);

  private readonly ROW =
    'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors';
  protected readonly rowActive = `${this.ROW} bg-accent-soft text-accent`;
  protected readonly rowIdle = `${this.ROW} text-text`;

  /**
   * Every tool, indexed for search: label, description, and extensive synonyms (PT & EN).
   *
   * Rebuilt when the language changes and not per keystroke — `i18n.t()` is a
   * signal, so reading it here is what makes the index switch dictionaries.
   */
  private readonly index = computed(() => {
    const dict = this.i18n.t();
    return TOOLS.map((tool) => {
      const label = dict[tool.navKey];
      const moduleName = dict[moduleById(tool.category).nameKey];
      const shortKey = dict[tool.shortKey];
      const title = dict[tool.titleKey];
      const desc = dict[tool.descKey];

      const allKeywords = [...tool.keywordsPt, ...tool.keywordsEn].join(' ');
      const haystack = fold(`${label} ${shortKey} ${moduleName} ${title} ${desc} ${allKeywords}`);

      return { tool, label, moduleName, haystack };
    });
  });

  protected readonly hits = computed<Hit[]>(() => {
    const rawQuery = fold(this.query().trim());
    const entries = this.index();

    if (!rawQuery) {
      return entries.map(({ tool, label, moduleName }) => ({ tool, label, moduleName, score: 0 }));
    }

    const tokens = rawQuery.split(/\s+/).filter(Boolean);

    return entries
      .map(({ tool, label, moduleName, haystack }) => {
        const matchesAll = tokens.every((token) => haystack.includes(token));
        if (!matchesAll) return null;

        const firstToken = tokens[0];
        const labelFolded = fold(label);
        let score = 2;
        if (labelFolded.startsWith(firstToken)) {
          score = 0;
        } else if (labelFolded.includes(` ${firstToken}`)) {
          score = 1;
        }

        return { tool, label, moduleName, score };
      })
      .filter((hit): hit is Hit => hit !== null)
      .sort((a, b) => a.score - b.score);
  });

  constructor() {
    const destroy = inject(DestroyRef);

    /**
     * The shortcut lives on the window because it must work from anywhere,
     * including while the focus sits in a tool's own input.
     */
    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.palette.toggle();
        return;
      }
      // Also on the window, not only on the input: clicking the dialog's chrome
      // moves focus off the field, and Escape has to keep working there.
      if (event.key === 'Escape' && this.palette.open()) this.palette.close();
    };
    window.addEventListener('keydown', onKeydown);
    destroy.onDestroy(() => window.removeEventListener('keydown', onKeydown));

    // Opening resets the query: a palette that reopens with the last search
    // already typed hides the full list behind a filter nobody asked for twice.
    effect(() => {
      if (!this.palette.open()) return;
      this.query.set('');
      this.cursor.set(0);
      // Deferred by a task: at the moment `open` flips, the @if has not rendered
      // the input yet, so the view query still reads undefined.
      setTimeout(() => this.field()?.nativeElement.focus());
    });

    /**
     * The page must not scroll behind the overlay. Set on the element rather than
     * the body because `body` is not the scroll container here — the shell is.
     */
    effect((onCleanup) => {
      if (!this.palette.open()) return;
      const root = document.documentElement;
      const previous = root.style.overflow;
      root.style.overflow = 'hidden';
      onCleanup(() => {
        root.style.overflow = previous;
      });
    });
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.cursor.set(0);
  }

  protected onKey(event: KeyboardEvent): void {
    const total = this.hits().length;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.palette.close();
        return;
      case 'ArrowDown':
        event.preventDefault();
        if (total) this.cursor.update((i) => (i + 1) % total);
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (total) this.cursor.update((i) => (i - 1 + total) % total);
        return;
      case 'Enter': {
        event.preventDefault();
        const hit = this.hits()[this.cursor()];
        if (hit) this.go(hit.tool);
        return;
      }
    }
  }

  protected go(tool: ToolDef): void {
    const lang = this.i18n.currentLang();
    this.palette.close();
    void this.router.navigateByUrl(`/${lang}/${toolPath(tool, lang)}`);
  }
}
