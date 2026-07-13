import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input, output } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';

/**
 * The image stage. Dark in both themes on purpose: a light surround measurably
 * changes how you perceive an image's brightness and colour, which is why every
 * serious editor puts the canvas on near-black.
 */
@Component({
  selector: 'app-preview-surface',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="relative flex items-center justify-center overflow-hidden rounded-xl border border-stage-line bg-stage p-6"
      [style.min-height.px]="minHeight()"
    >
      @if (src(); as source) {
        <div
          class="relative flex max-h-full items-center justify-center rounded-sm"
          [class.checkerboard]="checkerboard() && !background()"
          [style.background-color]="background()"
        >
          <img
            [src]="source"
            [alt]="alt()"
            class="max-h-[min(62vh,600px)] max-w-full object-contain"
            (error)="loadError.emit()"
          />
        </div>
      }

      @if (busy()) {
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stage/85 backdrop-blur-[3px]">
          <div class="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-accent"></div>

          <p class="text-sm font-medium text-white">{{ busyLabel() || i18n.t()['common.processing'] }}</p>

          @if (progress() !== null) {
            <div class="w-56">
              <div class="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  class="h-full rounded-full bg-accent transition-[width] duration-300"
                  [style.width.%]="progress()"
                ></div>
              </div>
              <p class="mt-2 text-center text-xs text-white/50 tabular" aria-live="polite">{{ progress() }}%</p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PreviewSurfaceComponent {
  protected readonly i18n = inject(TranslationService);

  readonly src = input<string | null>(null);
  readonly alt = input('');
  readonly checkerboard = input(false, { transform: booleanAttribute });
  readonly background = input<string | null>(null);
  readonly busy = input(false, { transform: booleanAttribute });
  readonly busyLabel = input<string | null>(null);
  readonly progress = input<number | null>(null);
  readonly minHeight = input(420);

  readonly loadError = output<void>();
}
