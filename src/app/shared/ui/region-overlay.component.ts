import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  type RedactMode,
  type Rect,
  type Region,
  isDegenerate,
  makeRegion,
  normalizeDrag,
  regionsOnPage,
} from '../../core/geometry/region';
import { IconComponent } from './icon/icon.component';
import { TranslationService } from '../../core/services/translation.service';

/**
 * A transparent layer that owns POINTER EVENTS ONLY and emits regions in
 * percent space. It knows nothing about what is underneath it — an <img>, a
 * <canvas>, a PDF page sheet — which is exactly what lets redact-image and
 * redact-pdf share it.
 *
 * The seam is deliberately between the interaction and the rendering. The two
 * tools' pointer maths are identical; their substrates are not. Duplicating
 * would mean two copies of the scale mapping and the pointer capture, which is
 * the code that was already subtly wrong once.
 *
 * This also deletes two bugs by construction:
 *
 * - redact-image redrew the full-resolution canvas on every mousemove — a
 *   drawImage of a 12 MP photo plus a downsample/upsample pass per existing
 *   box, per event. Moving a <div> costs one style write.
 * - It needed `setTimeout(…, 50)` because @ViewChild('canvas') was undefined
 *   when the file arrived. With the boxes as DOM there is nothing to wait for.
 *
 * Pointer events rather than the four mouse/touch handler pairs they replace:
 * setPointerCapture also fixes a drag that leaves the element, which the old
 * mouseup-on-target version dropped.
 */
@Component({
  selector: 'app-region-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div
      #layer
      class="absolute inset-0 touch-none"
      [class.cursor-crosshair]="!disabled()"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="onUp($event)"
      (pointercancel)="onCancel($event)"
    >
      @for (region of visible(); track region.id) {
        <div
          class="group absolute border-2"
          [class.border-accent]="region.mode === 'black'"
          [class.bg-black]="region.mode === 'black'"
          [class.border-line-strong]="region.mode !== 'black'"
          [class.border-dashed]="region.mode !== 'black'"
          [class.bg-raised]="region.mode !== 'black'"
          [style.left.%]="region.xPct"
          [style.top.%]="region.yPct"
          [style.width.%]="region.wPct"
          [style.height.%]="region.hPct"
        >
          @if (!disabled()) {
            <button
              type="button"
              class="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-danger shadow-panel transition hover:bg-danger-soft"
              [attr.aria-label]="i18n.t()['redact.remove_box']"
              (pointerdown)="$event.stopPropagation()"
              (click)="remove($event, region.id)"
            >
              <app-icon name="close" [size]="11" />
            </button>
          }
        </div>
      }

      @if (draft(); as d) {
        <div
          class="pointer-events-none absolute border-2 border-dashed border-accent bg-accent-soft/40"
          [style.left.%]="d.xPct"
          [style.top.%]="d.yPct"
          [style.width.%]="d.wPct"
          [style.height.%]="d.hPct"
        ></div>
      }
    </div>
  `,
})
export class RegionOverlayComponent {
  protected readonly i18n = inject(TranslationService);

  /**
   * The LAYER, not the host.
   *
   * The host is a bare custom element — `display: inline` with nothing but an
   * absolutely positioned child, so its own box is 0×0. Measuring it made
   * toPercent() hit its zero-size guard on every event and return {0,0}, so
   * every drag normalised to a 0×0 rect, every rect was degenerate, and no
   * region was ever emitted: drawing was silently dead in both redact tools.
   * The layer is the element that actually covers the surface.
   */
  private readonly layer = viewChild.required<ElementRef<HTMLElement>>('layer');

  readonly regions = input.required<readonly Region[]>();
  readonly page = input(1);
  readonly mode = input<RedactMode>('black');
  readonly disabled = input(false, { transform: booleanAttribute });

  readonly regionAdded = output<Region>();
  readonly regionRemoved = output<string>();

  protected readonly draft = signal<Rect | null>(null);
  protected readonly visible = computed(() => regionsOnPage(this.regions(), this.page()));

  private start: { x: number; y: number } | null = null;

  private toPercent(event: PointerEvent): { x: number; y: number } {
    const rect = this.layer().nativeElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  }

  protected onDown(event: PointerEvent): void {
    if (this.disabled() || event.button !== 0) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.start = this.toPercent(event);
    this.draft.set({ xPct: this.start.x, yPct: this.start.y, wPct: 0, hPct: 0 });
    event.preventDefault();
  }

  protected onMove(event: PointerEvent): void {
    if (!this.start) return;
    const now = this.toPercent(event);
    this.draft.set(normalizeDrag(this.start.x, this.start.y, now.x, now.y));
  }

  protected onUp(event: PointerEvent): void {
    if (!this.start) return;
    const now = this.toPercent(event);
    const rect = normalizeDrag(this.start.x, this.start.y, now.x, now.y);
    this.start = null;
    this.draft.set(null);

    // A click that wobbled is not a region. The threshold is in percent, so it
    // no longer depends on the zoom level the way a pixel one did.
    if (isDegenerate(rect)) return;
    this.regionAdded.emit(makeRegion(rect, this.mode(), this.page()));
  }

  protected onCancel(_event: PointerEvent): void {
    this.start = null;
    this.draft.set(null);
  }

  protected remove(event: Event, id: string): void {
    event.stopPropagation();
    this.regionRemoved.emit(id);
  }
}
