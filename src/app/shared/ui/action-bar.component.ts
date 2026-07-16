import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input, output } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
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

          @if (canContinue()) {
            <!-- No icon here: the label is the longest of the two and the arrow
                 pushed it onto a second line at half width. -->
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

  readonly primary = output<void>();
  readonly download = output<void>();
  readonly continueEdit = output<void>();
  readonly reset = output<void>();
}
