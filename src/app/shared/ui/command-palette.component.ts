import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { CommandPaletteService } from '../../core/services/command-palette.service';
import { TranslationService } from '../../core/services/translation.service';
import { TOOLS, type ToolDef, moduleById, toolPath } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';

/**
 * Fold accents and normalize case to lower for accent-insensitive search.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Conversational stop words in Portuguese & English.
 * Stripping these allows natural language queries like "eu quero converter um áudio"
 * or "I want to compress an audio file" to isolate intent tokens ("converter", "audio").
 */
const STOP_WORDS = new Set(
  [
    // PT conversational phrases, pronouns, prepositions & articles
    'eu', 'tu', 'ele', 'ela', 'nós', 'nos', 'vós', 'vos', 'eles', 'elas', 'você', 'voce', 'vocês', 'voces',
    'quero', 'queria', 'gostaria', 'preciso', 'precisava', 'desejo', 'desejava', 'busco', 'buscando',
    'como', 'faço', 'faco', 'fazer', 'posso', 'consigo', 'pode', 'podemos', 'consiga',
    'modo', 'de', 'para', 'pra', 'por', 'em', 'um', 'uma', 'uns', 'umas',
    'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas', 'ao', 'aos',
    'se', 'que', 'tem', 'ter', 'com', 'sem', 'meu', 'minha', 'meus', 'minhas',
    'seu', 'sua', 'seus', 'suas', 'o', 'a', 'os', 'as', 'este', 'esta', 'isto',
    'arquivo', 'arquivos', 'ferramenta', 'ferramentas', 'opcao', 'opção',
    'ajuda', 'favor', 'obrigado', 'obrigada', 'qual', 'quais', 'onde',
    // EN conversational phrases, pronouns, prepositions & articles
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'want', 'wanted', 'would',
    'like', 'need', 'needed', 'how', 'can', 'could', 'do', 'does', 'did',
    'to', 'a', 'an', 'the', 'of', 'in', 'on', 'for', 'with', 'without',
    'my', 'your', 'our', 'their', 'file', 'files', 'tool', 'tools',
    'option', 'options', 'help', 'please', 'thanks', 'where', 'which', 'is', 'are'
  ].map((w) => fold(w))
);

interface Hit {
  readonly tool: ToolDef;
  readonly label: string;
  readonly moduleName: string;
  readonly score: number;
}

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

    const allTokens = rawQuery.split(/\s+/).filter(Boolean);
    const filteredTokens = allTokens.filter((t) => !STOP_WORDS.has(t));
    const tokens = filteredTokens.length > 0 ? filteredTokens : allTokens;

    return entries
      .map(({ tool, label, moduleName, haystack }) => {
        let score = 0;
        const labelFolded = fold(label);
        const shortKeyFolded = fold(this.i18n.t()[tool.shortKey]);
        const titleFolded = fold(this.i18n.t()[tool.titleKey]);

        // 1. Exact phrase match in full haystack
        if (haystack.includes(rawQuery)) {
          score += 120;
        }

        // 2. Token match checks
        let matchedTokenCount = 0;

        for (const token of tokens) {
          if (!token) continue;
          let tokenMatched = false;

          if (labelFolded.startsWith(token) || shortKeyFolded.startsWith(token)) {
            score += 80;
            tokenMatched = true;
          } else if (labelFolded.includes(token) || shortKeyFolded.includes(token)) {
            score += 50;
            tokenMatched = true;
          } else if (titleFolded.includes(token)) {
            score += 35;
            tokenMatched = true;
          }

          if (haystack.includes(token)) {
            score += 25;
            tokenMatched = true;
          } else if (token.length >= 3) {
            const stem = token.slice(0, Math.min(token.length, 5));
            if (haystack.includes(stem)) {
              score += 15;
              tokenMatched = true;
            }
          }

          if (tokenMatched) {
            matchedTokenCount++;
          }
        }

        // 3. Category boost
        const queryHasAudio = tokens.some((t) =>
          ['audio', 'som', 'musica', 'mp3', 'wav', 'ogg', 'm4a', 'flac', 'sound', 'song'].some((k) => t.includes(k))
        );
        if (queryHasAudio && tool.category === 'audio') {
          score += 40;
        }

        const queryHasPdf = tokens.some((t) =>
          ['pdf', 'documento', 'document', 'page', 'pagina'].some((k) => t.includes(k))
        );
        if (queryHasPdf && tool.category === 'pdf') {
          score += 40;
        }

        const queryHasImage = tokens.some((t) =>
          ['imagem', 'foto', 'photo', 'image', 'png', 'jpg', 'webp', 'figura'].some((k) => t.includes(k))
        );
        if (queryHasImage && tool.category === 'image') {
          score += 40;
        }

        if (matchedTokenCount === 0 && score <= 0) {
          return null;
        }

        if (matchedTokenCount === tokens.length) {
          score += 50;
        }

        return { tool, label, moduleName, score };
      })
      .filter((hit): hit is Hit => hit !== null)
      .sort((a, b) => b.score - a.score);
  });

  constructor() {
    const destroy = inject(DestroyRef);

    const onKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.palette.toggle();
        return;
      }
      if (event.key === 'Escape' && this.palette.open()) this.palette.close();
    };
    // A paleta está no shell, ou seja, em TODAS as 72 rotas — e `window` não
    // existe no Node. Sem esta guarda a geração estática morria em cada uma
    // delas, e a única mensagem era "erro ao pré-renderizar a rota X".
    // Um atalho de teclado também não tem o que fazer em tempo de build.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      window.addEventListener('keydown', onKeydown);
      destroy.onDestroy(() => window.removeEventListener('keydown', onKeydown));
    }

    effect(() => {
      if (!this.palette.open()) return;
      this.query.set('');
      this.cursor.set(0);
      setTimeout(() => this.field()?.nativeElement.focus());
    });

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
