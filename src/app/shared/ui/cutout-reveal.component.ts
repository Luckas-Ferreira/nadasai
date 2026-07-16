import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';
import { ButtonDirective } from './button.directive';

/**
 * The cutout, revealed: the original wipes away under a scan line and what is left
 * is the result.
 *
 * This replaces the compare slider on remove-bg, and the difference is who does the
 * work. The slider put the answer to "did it work?" behind a gesture — drag me —
 * and simply showed two half-images to anyone who never made it. The wipe answers
 * the question on its own, which is the same reason remove.bg opens this way.
 *
 * The animation runs ONCE, on arrival, and settles on the result. It is a reveal,
 * not a loop: a background that keeps flashing back is one you cannot judge the
 * edges against. `forwards` holds the end state, and prefers-reduced-motion
 * collapses the whole thing straight onto it (see styles.css) — nothing here means
 * anything that only the motion says.
 *
 * The original stays one press away, because "did it eat a shoulder?" is a real
 * question and answering it needs both images in the same box, at the same size.
 * The toggle appears only once the wipe has settled — offering it mid-animation
 * would be offering to interrupt the thing the user is still watching.
 */
@Component({
  selector: 'app-cutout-reveal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonDirective],
  template: `
    <div
      class="relative select-none overflow-hidden rounded-xl border border-stage-line bg-stage"
      [style.min-height.px]="minHeight()"
    >
      <!-- The result. A null background means transparent, which is what earns the
           checkerboard; a solid backdrop paints the surround instead. -->
      <div
        class="flex h-full items-center justify-center p-6"
        [class.checkerboard]="!background()"
        [style.background-color]="background()"
      >
        <img
          [src]="after()"
          [alt]="i18n.t()['common.result']"
          draggable="false"
          class="max-h-[min(62vh,600px)] max-w-full object-contain"
        />
      </div>

      <!-- The original, on top: wiped away on arrival, restored while the toggle is on.
           Both layers use the same box and the same max sizes, so the subject does not
           shift by a pixel between them — the whole point is judging the edges. -->
      @if (!settled() || showOriginal()) {
        <div
          class="absolute inset-0 bg-stage"
          [class.cutout-wipe]="!settled()"
          (animationend)="wiped.set(true)"
        >
          <div class="flex h-full items-center justify-center p-6">
            <img
              [src]="before()"
              [alt]="i18n.t()['common.original']"
              draggable="false"
              class="max-h-[min(62vh,600px)] max-w-full object-contain"
            />
          </div>
        </div>
      }

      @if (!settled()) {
        <!-- Rides the wiping edge. Purely decorative: it says "something is being
             cut here" and nothing that is not already said by the image itself. -->
        <span
          aria-hidden="true"
          class="cutout-scan pointer-events-none absolute inset-y-0 w-20 -translate-x-1/2
                 bg-gradient-to-r from-transparent via-white/60 to-transparent"
        ></span>
      }

      <span
        class="pointer-events-none absolute left-4 top-4 rounded-sm bg-black/60 px-2 py-1 text-2xs
               font-medium uppercase text-white/80"
      >
        {{ showOriginal() ? i18n.t()['common.original'] : i18n.t()['common.result'] }}
      </span>

      @if (settled()) {
        <div class="absolute bottom-4 right-4">
          <button
            appButton
            variant="secondary"
            size="sm"
            [attr.aria-pressed]="showOriginal()"
            (click)="showOriginal.set(!showOriginal())"
          >
            {{ showOriginal() ? i18n.t()['bg.view_result'] : i18n.t()['bg.view_original'] }}
          </button>
        </div>
      }
    </div>
  `,
})
export class CutoutRevealComponent {
  protected readonly i18n = inject(TranslationService);

  readonly before = input.required<string>();
  readonly after = input.required<string>();
  /** Solid surround behind the cutout; null means transparent, i.e. the checkerboard. */
  readonly background = input<string | null>(null);
  readonly minHeight = input(420);
  /**
   * False lands straight on the result. The wipe belongs to a run, and this
   * component is remounted by things that are not runs — leaving the retouch
   * editor, for one, where replaying it would wipe away an original the user has
   * just spent a minute painting against.
   */
  readonly animate = input(true);

  protected readonly wiped = signal(false);
  protected readonly settled = computed(() => this.wiped() || !this.animate());
  protected readonly showOriginal = signal(false);
}
