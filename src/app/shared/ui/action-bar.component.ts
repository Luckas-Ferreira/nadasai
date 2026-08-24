import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { Router } from '@angular/router';
import type { FileKind } from '../../core/files/kind';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService } from '../../core/services/translation.service';
import {
  MAX_NEXT_TOOL_CHIPS,
  type ToolDef,
  type ToolId,
  nextToolsFor,
  toolById,
  toolPath,
} from '../../core/tools/tools';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon/icon.component';

/**
 * Apply / Download / Start over, previously duplicated in all five tools.
 *
 * `primaryLabel` is nullable, and every tool passes null once pressing the button
 * could only reproduce the result already on screen — see each tool's `stale`.
 * A primary button that recomputes identical bytes reads as "it didn't work", and
 * on remove-bg it re-ran seconds of inference to land back where you started.
 *
 * The label comes back the moment a setting changes, which is the whole point of
 * keeping it after a run: the templates before this kit hid it behind
 * `*ngIf="!result()"`, so trying a different quality or format meant starting
 * over and re-uploading the file.
 *
 * **Toda a parte de encadeamento é resolvida aqui, a partir de `toolId`.**
 *
 * - **Os destinos** saem de `accepts`/`produces` via `nextToolsFor`.
 * - **A navegação** é feita aqui mesmo, porque o commit do resultado pendente
 *   acontece no `NavigationStart` (ver `PendingTransitionService`): quem clica
 *   num chip não precisa aplicar nada antes, basta navegar.
 * - **Se há o que continuar** é exatamente `hasPending()`.
 *
 * `resultKind` existe para as duas saídas que não são fixas: split-pdf e
 * pdf-to-img devolvem um zip quando geram vários arquivos, e oferecer "assinar
 * PDF" para um zip é pior do que não oferecer nada.
 */
@Component({
  selector: 'app-action-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective, IconComponent],
  template: `
    <div class="flex flex-col gap-2">
      @if (primaryLabel(); as label) {
        <button
          appButton
          variant="primary"
          size="lg"
          block
          [busy]="busy()"
          [disabled]="primaryDisabled() || busy()"
          (click)="primary.emit()"
        >
          @if (busy()) {
            <span class="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"></span>
            {{ i18n.t()['common.processing'] }}
          } @else {
            {{ label }}
          }
        </button>
      }

      @if (canDownload()) {
        <button
          appButton
          variant="secondary"
          size="lg"
          block
          (click)="download.emit()"
        >
          <app-icon name="download" [size]="16" />
          {{ i18n.t()['common.download'] }}
        </button>

        @if (canContinue() && nextTools().length > 0) {
          <div class="rounded-lg border border-line bg-raised px-3 py-2.5">
            <p class="mb-2 text-2xs font-medium uppercase tracking-wider text-faint">
              {{ i18n.t()['common.next_tool'] }}
            </p>
            <div class="flex flex-wrap gap-1.5">
              @for (tool of nextTools(); track tool.id) {
                <button
                  appButton
                  variant="ghost"
                  size="sm"
                  class="group gap-1.5 transition-all duration-150 hover:border-[color:var(--tone-fg)] hover:bg-[color:var(--tone-bg)]"
                  [style.--tone-fg]="'var(--tone-' + tool.tone + '-fg)'"
                  [style.--tone-bg]="'var(--tone-' + tool.tone + '-bg)'"
                  (click)="go(tool)"
                >
                  <span class="shrink-0 text-[color:var(--tone-fg)]">
                    <app-icon [name]="tool.icon" [size]="13" />
                  </span>
                  <span class="text-text">{{ i18n.t()[tool.navKey] }}</span>
                  <span class="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100">
                    <app-icon name="arrowRight" [size]="11" />
                  </span>
                </button>
              }
            </div>
          </div>
        }

        <p class="mt-0.5 text-center text-xs text-faint">{{ i18n.t()['common.download_hint'] }}</p>
      }

      <!-- Getting out of trouble: one quiet row, away from the doing.
           Undo is deliberately NOT here — it lives in the file bar, which is on
           screen everywhere, and the moment you actually want undo you may well
           be looking at a tool that never produced a result at all. -->
      <div class="mt-1 flex justify-center border-t border-line pt-2">
        <button appButton variant="ghost" size="sm" (click)="reset.emit()">
          {{ i18n.t()['common.reset'] }}
        </button>
      </div>
    </div>
  `,
})
export class ActionBarComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly pendingTransition = inject(PendingTransitionService);
  private readonly router = inject(Router);

  /** Quem está pedindo. É daqui que saem os chips. */
  readonly toolId = input.required<ToolId>();
  /**
   * O tipo REAL do resultado, quando ele difere do `produces` declarado.
   * `undefined` (o padrão) usa o declarado; `null` desliga os chips.
   */
  readonly resultKind = input<FileKind | null | undefined>(undefined);

  readonly primaryLabel = input<string | null>(null);
  readonly primaryDisabled = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly canDownload = input(false, { transform: booleanAttribute });

  readonly primary = output<void>();
  readonly download = output<void>();
  readonly reset = output<void>();

  private readonly tool = computed(() => toolById(this.toolId()));

  /**
   * Há um resultado registrado que qualquer navegação levaria junto.
   *
   * É exatamente `hasPending()`, e a tentação de aceitar também "a sessão já é
   * do tipo que eu produzo" foi testada e está errada: o conversor produz
   * `image` e trabalha sobre uma sessão `image`, então com aquela regra ele
   * oferecia continuar mesmo tendo acabado de gerar um PDF, que ele
   * deliberadamente NÃO registra. A pergunta certa é "há o que levar", e só o
   * registro responde isso.
   */
  protected readonly canContinue = this.pendingTransition.hasPending;

  private readonly kind = computed<FileKind | null>(() => {
    const override = this.resultKind();
    return override === undefined ? this.tool().produces : override;
  });

  protected readonly nextTools = computed<readonly ToolDef[]>(() =>
    nextToolsFor(this.kind(), this.toolId(), MAX_NEXT_TOOL_CHIPS),
  );

  protected go(tool: ToolDef): void {
    const lang = this.i18n.currentLang();
    void this.router.navigateByUrl(`/${lang}/${toolPath(tool, lang)}`);
  }
}
