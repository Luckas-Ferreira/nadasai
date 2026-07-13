import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, inject, input, signal, viewChild } from '@angular/core';
import { TranslationService } from '../../core/services/translation.service';

/**
 * Before/after divider. Replaces the two-tab hack in remove-bg, which made you
 * flip back and forth instead of seeing both at once.
 */
@Component({
  selector: 'app-compare-slider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #frame
      class="relative select-none overflow-hidden rounded-xl border border-stage-line bg-stage"
      [style.min-height.px]="minHeight()"
      (pointerdown)="startDrag($event)"
      (pointermove)="drag($event)"
      (pointerup)="endDrag($event)"
      (pointercancel)="endDrag($event)"
    >
      <div class="flex h-full items-center justify-center p-6" [class.checkerboard]="checkerboard()">
        <img
          [src]="after()"
          [alt]="i18n.t()['common.result']"
          class="max-h-[min(62vh,600px)] max-w-full object-contain"
        />
      </div>

      <!-- The "before" layer is clipped, so both images stay pinned to the same box. -->
      <div class="absolute inset-0 overflow-hidden" [style.clip-path]="'inset(0 ' + (100 - position()) + '% 0 0)'">
        <div class="flex h-full items-center justify-center bg-stage p-6">
          <img
            [src]="before()"
            [alt]="i18n.t()['common.original']"
            class="max-h-[min(62vh,600px)] max-w-full object-contain"
          />
        </div>
      </div>

      <div
        class="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90 shadow-sm"
        [style.left.%]="position()"
      >
        <span
          class="absolute top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center
                 rounded-full border-2 border-white bg-accent text-2xs text-white"
        >
          ‹›
        </span>
      </div>

      <input
        type="range"
        min="0"
        max="100"
        [value]="position()"
        (input)="onRange($event)"
        [attr.aria-label]="i18n.t()['common.original'] + ' / ' + i18n.t()['common.result']"
        class="absolute inset-x-0 bottom-4 mx-auto w-[60%] cursor-ew-resize opacity-0 focus-visible:opacity-100"
      />

      <span class="pointer-events-none absolute left-4 top-4 rounded-sm bg-black/60 px-2 py-1 text-2xs font-medium uppercase text-white/80">
        {{ i18n.t()['common.original'] }}
      </span>
      <span class="pointer-events-none absolute right-4 top-4 rounded-sm bg-black/60 px-2 py-1 text-2xs font-medium uppercase text-white/80">
        {{ i18n.t()['common.result'] }}
      </span>
    </div>
  `,
})
export class CompareSliderComponent {
  protected readonly i18n = inject(TranslationService);

  readonly before = input.required<string>();
  readonly after = input.required<string>();
  readonly checkerboard = input(false, { transform: booleanAttribute });
  readonly minHeight = input(420);

  private readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  protected readonly position = signal(50);
  private dragging = false;

  protected startDrag(event: PointerEvent): void {
    this.dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.moveTo(event);
  }

  protected drag(event: PointerEvent): void {
    if (this.dragging) this.moveTo(event);
  }

  protected endDrag(event: PointerEvent): void {
    this.dragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  protected onRange(event: Event): void {
    this.position.set(Number((event.target as HTMLInputElement).value));
  }

  private moveTo(event: PointerEvent): void {
    const rect = this.frame().nativeElement.getBoundingClientRect();
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    this.position.set(Math.min(100, Math.max(0, pct)));
  }
}
