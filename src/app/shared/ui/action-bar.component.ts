import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input, output } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
import { type ToolDef } from '../../core/tools/tools';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon/icon.component';

/**
 * Apply / Download / Keep editing / Start over, previously duplicated in all
 * five tools.
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
 * When `nextTools` is provided (image module only), the generic "keep editing"
 * button is replaced by labelled chips — one per chainable tool — so the user
 * can go directly to the next step without passing through the home launcher.
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

      <!-- Using the result: side by side, because they are alternatives to each
           other, not a sequence. -->
      @if (canDownload()) {
        <div class="flex gap-2">
          <button appButton variant="secondary" size="lg" class="flex-1" (click)="download.emit()">
            <app-icon name="download" [size]="16" />
            {{ i18n.t()['common.download'] }}
          </button>

          <!-- Legacy fallback: audio/PDF tools pass canContinue but no nextTools. -->
          @if (canContinue() && nextTools().length === 0) {
            <button
              appButton
              variant="secondary"
              size="lg"
              class="flex-1 whitespace-nowrap"
              (click)="continueEdit.emit()"
            >
              {{ i18n.t()['common.continue'] }}
            </button>
          }
        </div>

        <!-- Tool chips: shown when the caller provides a list of peer tools. -->
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
                  (click)="continueToTool.emit(tool)"
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
           screen everywhere. A tool reads its source once, on construction, so
           undoing from inside one would swap the file underneath a view that
           never re-reads it; and the moment you actually want undo, you are back
           on the home page, where no action bar exists. -->
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

  readonly primaryLabel = input<string | null>(null);
  readonly primaryDisabled = input(false, { transform: booleanAttribute });
  readonly busy = input(false, { transform: booleanAttribute });
  readonly canDownload = input(false, { transform: booleanAttribute });
  readonly canContinue = input(false, { transform: booleanAttribute });
  /** Chainable peer tools to display as chips. Empty for audio/PDF tools. */
  readonly nextTools = input<readonly ToolDef[]>([]);

  readonly primary = output<void>();
  readonly download = output<void>();
  /** Legacy: emitted when canContinue is true but nextTools is empty. */
  readonly continueEdit = output<void>();
  /** Emitted when the user picks a specific next tool from the chips. */
  readonly continueToTool = output<ToolDef>();
  readonly reset = output<void>();
}


