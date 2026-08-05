import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ActiveToolService } from '../../core/services/active-tool.service';
import {
  CommandPaletteService,
  PALETTE_HOTKEY_LABEL,
} from '../../core/services/command-palette.service';
import { SplashScreenService } from '../../core/services/splash-screen.service';
import { TranslationService } from '../../core/services/translation.service';
import { MODULES, type ModuleId, moduleById, toolPath, toolsOfModule } from '../../core/tools/tools';
import { IconComponent } from './icon/icon.component';
import { NetworkBadgeComponent } from './network-badge.component';

/**
 * The shell's one identity surface: wordmark, where you are, and how to get out.
 *
 * It replaced two things — a 24px logo tucked at the top of the rail, and a
 * separate mobile header that repeated it — so the brand is stated once, at a
 * size that can actually carry it, on every viewport.
 *
 * The module switcher is what lets the rail be scoped. Since the rail only lists
 * the current module, crossing to another one needs a control that is always
 * present, and this is it. Picking a module lands on its first tool rather than
 * on a landing page of its own: there is no such route (adding one means two
 * localized paths plus an SEO mapping), and the rail reveals the whole module the
 * moment you arrive, so nothing is hidden by the shortcut.
 */
@Component({
  selector: 'app-top-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, NetworkBadgeComponent],
  /**
   * O sticky mora AQUI, no host, e não no <header> lá dentro.
   *
   * `app-top-bar` é filho de um flex column, e todo item de flex é blockificado
   * — então o host vira um bloco de exatamente 56px, a altura do próprio
   * cabeçalho. Um `sticky` dentro dele fica preso a um contêiner do seu próprio
   * tamanho: não sobra folga nenhuma para deslizar, e ao descer a página a
   * barra ia embora junto, como se não fosse sticky. A regra existia e não
   * fazia efeito.
   *
   * É a mesma armadilha que `app-region-overlay` já documenta por outro
   * motivo: a caixa do elemento host não é a que se imagina lendo só o
   * template. O `top-14` do rail depende desta barra ficar mesmo no topo.
   */
  host: { class: 'sticky top-0 z-40 shrink-0' },
  template: `
    <header
      class="flex h-14 items-center gap-1.5 sm:gap-2 border-b border-line bg-surface px-3 sm:px-4 md:px-6"
    >
      <a
        [routerLink]="'/' + i18n.currentLang()"
        (click)="splash.show()"
        class="flex h-10 shrink-0 items-center gap-2 sm:gap-2.5 rounded-md py-1 pr-1 text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
      >
        <img src="logo_nadasai.svg" alt="" class="h-7 w-7 shrink-0 object-contain" />
        <span class="text-lg sm:text-xl font-semibold tracking-[-0.015em] hidden min-[340px]:inline">Nada Sai</span>
      </a>

      <!-- Breadcrumb into the module switcher. The separator is decorative: the
           button already names itself for a screen reader. -->
      <span class="hidden shrink-0 text-faint sm:block" aria-hidden="true">
        <app-icon name="chevronRight" [size]="14" />
      </span>

      <!-- Present at every width, phones included: with the rail gone below md,
           this and the palette are the only ways out of a module without going
           home first. It costs ~90px, which fits beside a 130px wordmark. -->
      <div class="relative min-w-0 max-w-full shrink">
        <button
          type="button"
          [attr.aria-label]="i18n.t()['nav.module_switch']"
          [attr.aria-expanded]="menuOpen()"
          aria-haspopup="menu"
          (click)="menuOpen.set(!menuOpen())"
          class="flex h-10 max-w-full min-w-0 items-center gap-1.5 sm:gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-text transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          @if (current(); as mod) {
            <span
              [style.--tone-fg]="'var(--tone-' + mod.tone + '-fg)'"
              class="shrink-0 text-[color:var(--tone-fg)]"
            >
              <app-icon [name]="mod.icon" [size]="16" />
            </span>
            <span class="truncate min-w-0">{{ i18n.t()[mod.nameKey] }}</span>
          } @else {
            <span class="shrink-0 text-faint"><app-icon name="modules" [size]="16" /></span>
            <span class="truncate min-w-0">{{ i18n.t()['nav.modules'] }}</span>
          }
          <app-icon name="chevronDown" [size]="14" class="shrink-0 text-faint" />
        </button>

        @if (menuOpen()) {
          <!-- Click-away lives on a full-screen sibling rather than a document
               listener: no listener to leak, and it cannot fire before the click
               that opened the menu has finished. -->
          <div class="fixed inset-0 z-40" (click)="menuOpen.set(false)"></div>

          <!-- Anchored to the viewport below sm, to the button above it. Anchored
               to the button at 390px, a 280px panel starting ~140px in runs off
               the right edge and clips the active module's check mark. -->
          <div
            role="menu"
            class="fixed inset-x-4 top-[58px] z-50 overflow-hidden rounded-lg border border-line bg-surface shadow-pop
                   sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1 sm:w-[280px]"
          >
            @for (mod of modules; track mod.id) {
              <a
                role="menuitem"
                [routerLink]="entryPath(mod.id)"
                (click)="menuOpen.set(false)"
                class="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-raised"
              >
                <span
                  [style.--tone-fg]="'var(--tone-' + mod.tone + '-fg)'"
                  [style.--tone-bg]="'var(--tone-' + mod.tone + '-bg)'"
                  class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--tone-bg)] text-[color:var(--tone-fg)]"
                >
                  <app-icon [name]="mod.icon" [size]="16" />
                </span>

                <span class="min-w-0 flex-1">
                  <span class="flex items-baseline gap-2">
                    <span class="text-sm font-medium text-text">{{ i18n.t()[mod.nameKey] }}</span>
                    <span class="font-mono text-2xs text-faint tabular">{{ count(mod.id) }}</span>
                  </span>
                  <span class="mt-0.5 block text-xs text-muted">{{ i18n.t()[mod.descKey] }}</span>
                </span>

                @if (mod.id === current()?.id) {
                  <span class="mt-1 shrink-0 text-accent"><app-icon name="check" [size]="15" /></span>
                }
              </a>
            }

            <a
              role="menuitem"
              [routerLink]="'/' + i18n.currentLang()"
              (click)="menuOpen.set(false)"
              class="flex items-center gap-2.5 border-t border-line px-3 py-2.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
            >
              <app-icon name="modules" [size]="15" class="shrink-0 text-faint" />
              {{ i18n.t()['nav.modules'] }}
            </a>
          </div>
        }
      </div>

      <span class="flex-1 min-w-[4px]"></span>

      <!-- Shaped like a field on desktop because that is what it behaves like;
           an icon on phones, where 200px of chrome for a label is not affordable. -->
      <button
        type="button"
        [attr.aria-label]="i18n.t()['nav.search_open']"
        (click)="palette.show()"
        class="flex h-10 min-w-[40px] shrink-0 items-center justify-center gap-2 rounded-md border border-line bg-raised px-2.5 text-sm text-faint transition-colors hover:border-line-strong hover:text-muted md:w-[240px] md:justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <app-icon name="search" [size]="16" class="shrink-0" />
        <span class="hidden flex-1 text-left md:block">{{ i18n.t()['nav.search'] }}</span>
        <span
          class="hidden shrink-0 rounded-sm border border-line bg-surface px-1.5 py-0.5 font-mono text-2xs text-faint md:block"
          >{{ hotkey }}</span
        >
      </button>

      <!-- O medidor de rede vive aqui porque esta barra é a única superfície
           presente em TODA rota — e sticky, então ele não sai da tela ao rolar.
           Enquanto morava só na home, ele aparecia exatamente onde não há
           arquivo nenhum em jogo e sumia quando a pessoa abria um documento de
           verdade, que é quando "saiu alguma coisa daqui?" importa. -->
      <app-network-badge class="ml-1 sm:ml-2 shrink-0" />
    </header>
  `,
})
export class TopBarComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly palette = inject(CommandPaletteService);
  protected readonly splash = inject(SplashScreenService);
  private readonly active = inject(ActiveToolService);

  protected readonly modules = MODULES;
  protected readonly hotkey = PALETTE_HOTKEY_LABEL;

  protected readonly current = computed(() => {
    const id = this.active.module();
    return id ? moduleById(id) : null;
  });

  protected readonly menuOpen = signal(false);

  constructor() {
    const destroy = inject(DestroyRef);
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && this.menuOpen()) this.menuOpen.set(false);
    };
    // Mesma razão da paleta: esta barra está em todas as rotas e `window` não
    // existe no Node da geração estática. Um Escape também não fecha menu
    // nenhum em tempo de build.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      window.addEventListener('keydown', onKeydown);
      destroy.onDestroy(() => window.removeEventListener('keydown', onKeydown));
    }
  }

  protected count(id: ModuleId): number {
    return toolsOfModule(id).length;
  }

  /** A module's entry point: its first tool, in the active language. */
  protected entryPath(id: ModuleId): string {
    const lang = this.i18n.currentLang();
    const first = toolsOfModule(id)[0];
    return `/${lang}/${toolPath(first, lang)}`;
  }
}
