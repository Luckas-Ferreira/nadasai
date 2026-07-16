import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { canvasToBlob, loadImage } from '../../core/image/image-file.util';
import { TranslationService } from '../../core/services/translation.service';

export type BrushMode = 'erase' | 'restore';

interface Stroke {
  readonly mode: BrushMode;
  /** Line width in natural image pixels, not screen pixels. */
  readonly width: number;
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

/**
 * Manual repair for what the model got wrong: paint to erase a leftover, or to
 * restore a shoulder it chewed off.
 *
 * No mask comes back from the service and none is needed. The cutout is already
 * a PNG with an alpha channel, so the two edits are just composite operations on
 * it — `destination-out` punches alpha away, and restoring paints the original's
 * own pixels back. That second one is why `originalPattern` exists: a pattern is
 * anchored to the canvas origin, so stroking with it lays down exactly the pixels
 * that were at those coordinates all along. No per-stroke masking, no third
 * buffer, no resampling.
 *
 * Strokes are kept as points, never as bitmaps. Undo replays from the pristine
 * cutout, which is what makes it free: an ImageData snapshot per stroke would be
 * ~48 MB on a 12 MP photo, and a stack of them is how a tab dies. It also means
 * undo is exact — a stroke removed leaves nothing of itself behind, however many
 * strokes crossed it.
 *
 * The canvas is always at natural resolution and only ever displayed scaled, so
 * a retouch on a 12 MP photo edits 12 MP. Everything the pointer reports is in
 * CSS pixels and has to be mapped; brush size stays in CSS pixels deliberately,
 * so the brush is the size it looks on screen no matter the image.
 */
@Component({
  selector: 'app-cutout-brush',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="relative flex touch-none select-none items-center justify-center overflow-hidden rounded-xl
             border border-stage-line bg-stage p-6"
      [style.min-height.px]="minHeight()"
      [class.checkerboard]="!background()"
      [style.background-color]="background()"
      (pointerenter)="hovering.set(true)"
      (pointerleave)="onLeave($event)"
      (pointermove)="trackCursor($event)"
    >
      <canvas
        #canvas
        class="max-h-[min(62vh,600px)] max-w-full cursor-none"
        [class.invisible]="!ready()"
        (pointerdown)="startStroke($event)"
        (pointermove)="moveStroke($event)"
        (pointerup)="endStroke($event)"
        (pointercancel)="endStroke($event)"
      ></canvas>

      <!-- The cursor IS the brush: a ring the exact size of what will be painted.
           A crosshair would leave you guessing at the width, which is the one
           thing you need to know before you press. -->
      @if (hovering() && ready()) {
        <span
          aria-hidden="true"
          class="pointer-events-none absolute rounded-full border border-white/90 bg-white/10
                 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          [style.left.px]="cursor().x"
          [style.top.px]="cursor().y"
          [style.width.px]="brushSize()"
          [style.height.px]="brushSize()"
          [style.transform]="'translate(-50%, -50%)'"
        ></span>
      }
    </div>
  `,
})
export class CutoutBrushComponent {
  protected readonly i18n = inject(TranslationService);

  readonly cutout = input.required<Blob>();
  readonly original = input.required<Blob>();
  readonly mode = input.required<BrushMode>();
  /** Diameter in CSS pixels — what the ring on screen measures. */
  readonly brushSize = input(36);
  readonly background = input<string | null>(null);
  readonly minHeight = input(420);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly ready = signal(false);
  protected readonly hovering = signal(false);
  protected readonly cursor = signal({ x: 0, y: 0 });

  /** Bumped on every committed stroke; drives the undo button's disabled state. */
  private readonly strokeCount = signal(0);
  readonly canUndo = computed(() => this.strokeCount() > 0);
  readonly isDirty = computed(() => this.strokeCount() > 0);

  private ctx: CanvasRenderingContext2D | null = null;
  private cutoutImg: HTMLImageElement | null = null;
  private originalPattern: CanvasPattern | null = null;
  private readonly strokes: Stroke[] = [];
  private active: { mode: BrushMode; width: number; points: { x: number; y: number }[] } | null = null;

  constructor() {
    // Both inputs are Blobs, so this re-arms if the cutout is ever replaced under
    // us; the strokes belong to the image they were painted on, so they go too.
    effect(() => {
      const cutout = this.cutout();
      const original = this.original();
      void this.load(cutout, original);
    });
  }

  private async load(cutout: Blob, original: Blob): Promise<void> {
    this.ready.set(false);
    this.strokes.length = 0;
    this.strokeCount.set(0);

    const [cutoutImg, originalImg] = await Promise.all([loadImage(cutout), loadImage(original)]);

    const canvas = this.canvasRef().nativeElement;
    canvas.width = cutoutImg.naturalWidth;
    canvas.height = cutoutImg.naturalHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // The original is redrawn at the cutout's size rather than used directly. It
    // already matches today (the service composites onto a canvas sized from the
    // source), but the pattern silently paints at 1:1 — so if that ever drifts,
    // restore would smear a misaligned image instead of failing.
    const normalized = document.createElement('canvas');
    normalized.width = canvas.width;
    normalized.height = canvas.height;
    normalized.getContext('2d')?.drawImage(originalImg, 0, 0, canvas.width, canvas.height);

    this.ctx = ctx;
    this.cutoutImg = cutoutImg;
    this.originalPattern = ctx.createPattern(normalized, 'no-repeat');

    this.render();
    this.ready.set(true);
  }

  protected startStroke(event: PointerEvent): void {
    if (!this.ready()) return;

    // Without this the browser drags the canvas or starts selecting the page, and
    // the pointer stream dies mid-stroke — same trap as the compare slider.
    event.preventDefault();
    this.canvasRef().nativeElement.setPointerCapture?.(event.pointerId);

    const point = this.toCanvas(event);
    this.active = { mode: this.mode(), width: this.naturalBrushWidth(), points: [point] };

    // Paint immediately, so a tap leaves a dot rather than nothing.
    this.paint({ ...this.active, points: [point] });
  }

  protected moveStroke(event: PointerEvent): void {
    if (!this.active) return;

    const point = this.toCanvas(event);
    const previous = this.active.points[this.active.points.length - 1];
    this.active.points.push(point);

    // Only the new segment is painted, not the whole stroke list. Both operations
    // are idempotent where the round caps overlap, so an incremental segment and a
    // full replay land on the same pixels.
    this.paint({ ...this.active, points: [previous, point] });
  }

  protected endStroke(event: PointerEvent): void {
    if (!this.active) return;

    this.canvasRef().nativeElement.releasePointerCapture?.(event.pointerId);
    this.strokes.push({ ...this.active, points: [...this.active.points] });
    this.active = null;
    this.strokeCount.update((n) => n + 1);
  }

  protected onLeave(event: PointerEvent): void {
    this.hovering.set(false);
    this.endStroke(event);
  }

  undo(): void {
    if (!this.strokes.length) return;

    this.strokes.pop();
    this.strokeCount.update((n) => n - 1);
    this.render();
  }

  discard(): void {
    if (!this.strokes.length) return;

    this.strokes.length = 0;
    this.strokeCount.set(0);
    this.render();
  }

  /** The retouched cutout. PNG, because the alpha is the entire point. */
  toBlob(): Promise<Blob> {
    return canvasToBlob(this.canvasRef().nativeElement, 'image/png');
  }

  private render(): void {
    const ctx = this.ctx;
    const image = this.cutoutImg;
    if (!ctx || !image) return;

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(image, 0, 0);
    for (const stroke of this.strokes) this.paint(stroke);
  }

  private paint(stroke: Stroke): void {
    const ctx = this.ctx;
    if (!ctx || !stroke.points.length) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.width;

    if (stroke.mode === 'erase') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.originalPattern ?? '#000';
    }

    ctx.beginPath();
    const [first, ...rest] = stroke.points;
    ctx.moveTo(first.x, first.y);
    // A zero-length path draws nothing even with a round cap, so a single point
    // has to be given somewhere to go.
    if (!rest.length) ctx.lineTo(first.x, first.y);
    for (const point of rest) ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Bound on the host, not the canvas, so the ring keeps following through the
   * padding around the image. During a stroke the canvas holds pointer capture,
   * which retargets the event but does not stop it bubbling to here.
   */
  protected trackCursor(event: PointerEvent): void {
    const host = this.canvasRef().nativeElement.parentElement;
    if (!host) return;

    const rect = host.getBoundingClientRect();
    this.cursor.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  private toCanvas(event: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  /** CSS pixels in, image pixels out — the canvas is displayed scaled down. */
  private naturalBrushWidth(): number {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();

    return this.brushSize() * (canvas.width / Math.max(1, rect.width));
  }
}
