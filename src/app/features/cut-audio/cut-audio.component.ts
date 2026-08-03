import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AudioEngine, type Segment } from '../../core/audio/audio-engine';
import {
  MAX_AUDIO_SECONDS,
  ACCEPT_AUDIO_ATTR,
  assertUsableAudio,
  formatClock,
  formatTimecode,
  parseTimecode,
} from '../../core/audio/audio-file.util';
import { computePeaks, rulerStep, type Peaks } from '../../core/audio/waveform';
import { wavByteLength } from '../../core/audio/wav';
import { AppError, toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes } from '../../core/image/image-file.util';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { AudioStateService } from '../../core/services/audio-state.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { AudioCutterService, type CutMode, type CutResult } from './services/audio-cutter.service';

/** CSS pixels. The ruler strip lives inside the same canvas, at the top. */
const CANVAS_HEIGHT = 208;
const RULER_HEIGHT = 24;

/**
 * Peaks are computed ONCE per file, at a resolution that covers the deepest
 * zoom — never per pixel width and never per scroll position.
 *
 * A pass costs O(samples), not O(buckets), so asking for 131072 costs the same
 * as asking for 4096 and buys every zoom level with it: the draw slices the
 * range the window covers and downsamples from there. Recomputing per view
 * instead would re-scan a third of a podcast on every scrollbar tick, and
 * deriving the count from the canvas width would do it on every resize.
 */
const PEAK_BUCKETS = 131_072;

const MIN_ZOOM = 1;
const MAX_ZOOM = 64;

/** How close to a handle a pointer must land to grab it instead of starting a new selection. */
const HANDLE_HIT_PX = 11;

/** Below this the drag reads as a click, and a click must not wipe the selection. */
const DRAG_SLOP_PX = 3;

/** Dragging a handle within this of an edge pulls the view along with it. */
const EDGE_SCROLL_PX = 28;
const EDGE_SCROLL_SPEED = 9;

const MIN_SELECTION_SECONDS = 0.02;

type DragTarget = 'start' | 'end' | null;

interface WaveColors {
  idle: string;
  keep: string;
  drop: string;
  grid: string;
  label: string;
  playhead: string;
}

@Component({
  selector: 'app-cut-audio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    AlertComponent,
    IconComponent,
    SegmentedComponent,
    ActionBarComponent,
    ButtonDirective,
  ],
  templateUrl: './cut-audio.component.html',
})
export class CutAudioComponent implements OnDestroy {
  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('cut-audio');
  private readonly cutter = inject(AudioCutterService);
  private readonly audioState = inject(AudioStateService);
  private readonly router = inject(Router);

  /**
   * Owned by the component, not injected. It holds a live AudioContext and
   * running source nodes — per-run state that has to die with the view, or a
   * track keeps playing over whichever tool you navigated to next.
   */
  private readonly engine = new AudioEngine();

  protected readonly acceptAttr = ACCEPT_AUDIO_ATTR;
  protected readonly canvasHeight = CANVAS_HEIGHT;

  // Source
  protected readonly file = signal<File | null>(null);
  protected readonly buffer = signal<AudioBuffer | null>(null);
  protected readonly loading = signal(false);

  // Selection
  protected readonly selStart = signal(0);
  protected readonly selEnd = signal(0);
  protected readonly mode = signal<CutMode>('keep');
  protected readonly fadeIn = signal(0);
  protected readonly fadeOut = signal(0);

  // View: how much of the timeline the stage is showing, and from where.
  protected readonly zoomLevel = signal(1);
  protected readonly viewStart = signal(0);
  /**
   * Visible width of the scroller, in CSS pixels — and the width the sheet is
   * pinned at.
   *
   * It has to be bound explicitly. `w-full` on the sheet resolves against the
   * scroll spacer, which is the whole timeline wide, so at 40x the sheet became
   * 30000px, the canvas stretched its 747px backing store across all of it, and
   * `sticky` had nothing left to pin — the zoom looked like a blurry smear and
   * every pointer x mapped to the wrong time.
   */
  protected readonly viewWidth = signal(0);

  // Playback
  protected readonly playing = signal(false);
  /** Position on the SOURCE timeline, so the head tracks the waveform under it. */
  protected readonly playhead = signal<number | null>(null);

  // Run
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly result = signal<CutResult | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  private readonly ranSignature = signal<string | null>(null);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('wave');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');

  /** The handle the arrow keys move. Set by whichever one was last touched. */
  protected readonly activeHandle = signal<'start' | 'end'>('end');

  private drag: DragTarget = null;
  private dragOrigin = { x: 0, start: 0, end: 0, moved: false };
  private edgeScroll = 0;
  private edgeFrame = 0;
  private pinchDistance = 0;
  private pinchZoom = 1;
  private observer: ResizeObserver | null = null;
  private frame = 0;
  private colors: WaveColors | null = null;

  protected readonly duration = computed(() => this.buffer()?.duration ?? 0);

  protected readonly peaks = computed<Peaks | null>(() => {
    const buffer = this.buffer();
    if (!buffer) return null;

    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
    return computePeaks(channels, Math.min(PEAK_BUCKETS, buffer.length));
  });

  /** Seconds across the visible window. */
  protected readonly viewLength = computed(() => this.duration() / this.zoomLevel());

  /** Width of the scrolling spacer: the whole timeline at the current zoom. */
  protected readonly scrollWidth = computed(() => Math.round(this.viewWidth() * this.zoomLevel()));

  protected readonly selectionLength = computed(() => Math.max(0, this.selEnd() - this.selStart()));

  /** What the exported file will last — the selection, or everything but it. */
  protected readonly resultLength = computed(() =>
    this.mode() === 'keep' ? this.selectionLength() : Math.max(0, this.duration() - this.selectionLength()),
  );

  protected readonly estimatedSize = computed(() => {
    const buffer = this.buffer();
    if (!buffer) return null;
    const frames = Math.round(this.resultLength() * buffer.sampleRate);
    return formatBytes(wavByteLength(frames, buffer.numberOfChannels));
  });

  protected readonly modeOptions = computed<SegmentOption<CutMode>[]>(() => [
    { value: 'keep', label: this.i18n.t()['cut_audio.mode_keep'] },
    { value: 'remove', label: this.i18n.t()['cut_audio.mode_remove'] },
  ]);

  private readonly signature = computed(
    () =>
      `${this.mode()}|${this.selStart().toFixed(4)}|${this.selEnd().toFixed(4)}|` +
      `${this.fadeIn().toFixed(3)}|${this.fadeOut().toFixed(3)}`,
  );

  /**
   * The action bar's primary label hangs off this. Pressing "cut" again with
   * every setting untouched would spend seconds rebuilding bytes identical to
   * the ones already downloadable, which reads as the button not working.
   */
  protected readonly stale = computed(() => this.signature() !== this.ranSignature());

  protected readonly canRun = computed(() => this.resultLength() >= MIN_SELECTION_SECONDS);

  protected readonly zoomPercent = computed(() => Math.round(this.zoomLevel() * 100));
  protected readonly canZoomOut = computed(() => this.zoomLevel() > MIN_ZOOM + 1e-6);
  protected readonly canZoomIn = computed(() => this.zoomLevel() < MAX_ZOOM - 1e-6);

  protected readonly sourceSize = computed(() => {
    const file = this.file();
    return file ? formatBytes(file.size) : '';
  });

  constructor() {
    // The stage only exists once a file is loaded, so the observer is wired and
    // torn down as the view child comes and goes.
    effect((onCleanup) => {
      const el = this.scrollerRef()?.nativeElement;
      if (!el) return;

      const observer = new ResizeObserver((entries) => {
        const width = Math.round(entries[0].contentRect.width);
        if (width > 0) this.viewWidth.set(width);
      });
      observer.observe(el);
      this.observer = observer;

      onCleanup(() => {
        observer.disconnect();
        this.observer = null;
      });
    });

    // One redraw path for every input that changes the picture.
    effect(() => {
      this.peaks();
      this.viewWidth();
      this.viewStart();
      this.zoomLevel();
      this.selStart();
      this.selEnd();
      this.mode();
      this.playhead();
      this.activeHandle();
      this.draw();
    });

    // Auto-load the persisted audio file when the user navigates to this tool.
    const savedFile = this.audioState.currentFile();
    if (savedFile) void this.onFile(savedFile);
  }

  ngOnDestroy(): void {
    // Só cancela o que chegou a ser agendado.
    //
    // Não é higiene: a geração estática destrói o app depois de renderizar cada
    // rota, e `cancelAnimationFrame` não existe no Node. Chamado sem guarda ele
    // lançava DEPOIS do HTML já estar pronto — então o sintoma não era uma
    // página faltando, era o worker do prerender morrendo e derrubando em
    // cascata todas as rotas que ainda estavam na fila dele, incluindo páginas
    // estáticas como /pt/sobre, que não têm nada a ver com áudio.
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.edgeFrame) cancelAnimationFrame(this.edgeFrame);
    this.engine.close();
    this.observer?.disconnect();
  }

  // ---------------------------------------------------------------- loading

  protected async onFile(file: File): Promise<void> {
    this.stopPlayback();
    this.errorKey.set(null);
    this.result.set(null);
    this.ranSignature.set(null);
    this.loading.set(true);

    try {
      assertUsableAudio(file);
      const buffer = await this.engine.decode(file);
      if (buffer.duration > MAX_AUDIO_SECONDS) throw new AppError('audio_too_long');

      this.file.set(file);
      this.buffer.set(buffer);
      this.audioState.load(file);   // persist across tool navigation
      this.mode.set('keep');
      this.fadeIn.set(0);
      this.fadeOut.set(0);
      this.selStart.set(0);
      this.selEnd.set(buffer.duration);
      this.activeHandle.set('end');
      this.zoomLevel.set(1);
      this.viewStart.set(0);
    } catch (err) {
      console.error('[CutAudio] could not open the audio file:', err);
      this.file.set(null);
      this.buffer.set(null);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected reset(): void {
    this.stopPlayback();
    this.file.set(null);
    this.buffer.set(null);
    this.result.set(null);
    this.errorKey.set(null);
    this.ranSignature.set(null);
    this.selStart.set(0);
    this.selEnd.set(0);
    this.fadeIn.set(0);
    this.fadeOut.set(0);
    this.mode.set('keep');
    this.zoomLevel.set(1);
    this.viewStart.set(0);
    this.audioState.clear();   // clear the global bar too
  }

  // -------------------------------------------------------------- selection

  protected setMode(mode: CutMode): void {
    this.stopPlayback();
    this.mode.set(mode);
  }

  protected setStart(seconds: number): void {
    this.stopPlayback();
    const max = this.selEnd() - MIN_SELECTION_SECONDS;
    this.selStart.set(clamp(seconds, 0, Math.max(0, max)));
  }

  protected setEnd(seconds: number): void {
    this.stopPlayback();
    const min = this.selStart() + MIN_SELECTION_SECONDS;
    this.selEnd.set(clamp(seconds, Math.min(min, this.duration()), this.duration()));
  }

  protected selectAll(): void {
    this.stopPlayback();
    this.selStart.set(0);
    this.selEnd.set(this.duration());
  }

  /**
   * Reads a typed timecode and writes the field back from the signal.
   *
   * The write-back is the point: an unparseable or out-of-range entry leaves the
   * signal alone, and without it the input would keep showing "9:99" next to a
   * selection that never moved.
   */
  protected commitTime(input: HTMLInputElement, edge: 'start' | 'end'): void {
    const parsed = parseTimecode(input.value);
    if (parsed !== null) {
      if (edge === 'start') this.setStart(parsed);
      else this.setEnd(parsed);
    }
    input.value = formatTimecode(edge === 'start' ? this.selStart() : this.selEnd());
  }

  protected commitFade(input: HTMLInputElement, edge: 'in' | 'out'): void {
    const value = Number(input.value.replace(',', '.'));
    const limit = this.resultLength() / 2;
    const next = Number.isFinite(value) ? clamp(value, 0, Math.max(0, limit)) : 0;

    this.stopPlayback();
    if (edge === 'in') this.fadeIn.set(next);
    else this.fadeOut.set(next);

    input.value = next.toFixed(1);
  }

  // ------------------------------------------------------------------ zoom

  /**
   * Zooms around an anchor instead of around the left edge.
   *
   * Anchoring at the edge is what makes a zoom control feel broken: you point at
   * the passage you want a closer look at, press +, and it slides off screen.
   * `anchorFraction` is where on the stage that time should stay — the pointer's
   * own position for a ctrl-wheel, the middle for the buttons.
   */
  protected setZoom(next: number, anchorTime?: number, anchorFraction = 0.5): void {
    const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
    const anchor = anchorTime ?? this.viewStart() + this.viewLength() / 2;

    this.zoomLevel.set(clamped);

    const length = this.duration() / clamped;
    const start = clamp(anchor - anchorFraction * length, 0, Math.max(0, this.duration() - length));
    this.viewStart.set(start);

    // The spacer's width is a binding, so it is only that wide after the next
    // render — scrolling before then lands against the OLD width and snaps back.
    requestAnimationFrame(() => {
      const el = this.scrollerRef()?.nativeElement;
      if (!el || this.duration() <= 0) return;
      el.scrollLeft = (start / this.duration()) * this.scrollWidth();
    });
  }

  protected zoomBy(factor: number): void {
    this.setZoom(this.zoomLevel() * factor);
  }

  protected setZoomFromInput(input: HTMLInputElement): void {
    const value = parseInt(input.value, 10);
    if (!Number.isNaN(value)) this.setZoom(value / 100);
    input.value = String(this.zoomPercent());
  }

  protected fitAll(): void {
    this.setZoom(MIN_ZOOM);
  }

  /** Frames the selection with a margin, which is the zoom people actually want. */
  protected zoomToSelection(): void {
    const length = this.selectionLength();
    if (length <= 0 || this.duration() <= 0) return;

    this.setZoom(this.duration() / (length * 1.25), this.selStart() + length / 2);
  }

  protected onScroll(): void {
    const el = this.scrollerRef()?.nativeElement;
    const width = this.scrollWidth();
    if (!el || width <= 0 || this.duration() <= 0) return;

    this.viewStart.set(clamp((el.scrollLeft / width) * this.duration(), 0, this.duration()));
  }

  protected onWheel(event: WheelEvent): void {
    const el = this.scrollerRef()?.nativeElement;
    if (!el) return;

    if (event.ctrlKey || event.metaKey) {
      if (event.cancelable) event.preventDefault();
      const fraction = clamp((event.clientX - el.getBoundingClientRect().left) / el.clientWidth, 0, 1);
      const anchor = this.viewStart() + fraction * this.viewLength();
      this.setZoom(this.zoomLevel() * (event.deltaY > 0 ? 1 / 1.2 : 1.2), anchor, fraction);
      return;
    }

    // A horizontally scrolling strip ignores a vertical wheel, and a vertical
    // wheel is what a mouse has. Only while zoomed in, or the page would stop
    // scrolling every time the cursor crossed the waveform.
    if (this.zoomLevel() > MIN_ZOOM && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      if (event.cancelable) event.preventDefault();
      el.scrollLeft += event.deltaY;
    }
  }

  protected onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 2) return;

    // A pinch starts life as a one-finger drag; undo whatever that already did.
    this.cancelDrag();
    this.pinchDistance = touchDistance(event);
    this.pinchZoom = this.zoomLevel();
  }

  protected onTouchMove(event: TouchEvent): void {
    if (event.touches.length !== 2 || this.pinchDistance <= 0) return;
    if (event.cancelable) event.preventDefault();

    this.setZoom((this.pinchZoom * touchDistance(event)) / this.pinchDistance);
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) this.pinchDistance = 0;
  }

  // ------------------------------------------------------------- playback

  protected async togglePlay(): Promise<void> {
    if (this.playing()) {
      this.stopPlayback();
      return;
    }

    const buffer = this.buffer();
    if (!buffer || !this.canRun()) return;

    const segments = this.segments();
    await this.engine.play({ buffer, segments, fadeIn: this.fadeIn(), fadeOut: this.fadeOut() }, () =>
      this.stopPlayback(),
    );

    this.playing.set(true);
    this.trackPlayhead();
  }

  private stopPlayback(): void {
    cancelAnimationFrame(this.frame);
    this.engine.stop();
    this.playing.set(false);
    this.playhead.set(null);
  }

  /** The pieces that survive the cut, in output order — what the cutter concatenates. */
  private segments(): Segment[] {
    if (this.mode() === 'keep') return [[this.selStart(), this.selEnd()]];
    return [
      [0, this.selStart()],
      [this.selEnd(), this.duration()],
    ];
  }

  private trackPlayhead(): void {
    const step = () => {
      const elapsed = this.engine.elapsed();
      if (elapsed === null) return;

      // Result time back onto the source timeline: in remove mode everything
      // after the join is displaced by the length of what was cut out.
      const source =
        this.mode() === 'keep'
          ? this.selStart() + elapsed
          : elapsed < this.selStart()
            ? elapsed
            : elapsed + this.selectionLength();

      this.playhead.set(source);
      this.followPlayhead(source);
      this.frame = requestAnimationFrame(step);
    };

    this.frame = requestAnimationFrame(step);
  }

  /** Zoomed in, a playhead that runs off the right edge is a playhead you lost. */
  private followPlayhead(source: number): void {
    if (this.zoomLevel() <= MIN_ZOOM || this.drag) return;

    const length = this.viewLength();
    if (source >= this.viewStart() && source <= this.viewStart() + length * 0.92) return;

    const el = this.scrollerRef()?.nativeElement;
    if (!el || this.duration() <= 0) return;

    const start = clamp(source - length * 0.1, 0, Math.max(0, this.duration() - length));
    el.scrollLeft = (start / this.duration()) * this.scrollWidth();
  }

  // -------------------------------------------------------------- pointer

  protected onPointerDown(event: PointerEvent): void {
    // The second finger of a pinch must not open a selection drag.
    if (!event.isPrimary) return;

    const el = this.canvasRef()?.nativeElement;
    const width = this.viewWidth();
    if (!el || width <= 0 || this.duration() <= 0) return;

    const x = event.clientX - el.getBoundingClientRect().left;
    const startX = this.timeToX(this.selStart());
    const endX = this.timeToX(this.selEnd());

    el.setPointerCapture(event.pointerId);
    this.dragOrigin = { x, start: this.selStart(), end: this.selEnd(), moved: false };

    if (Math.abs(x - startX) <= HANDLE_HIT_PX) {
      this.drag = 'start';
    } else if (Math.abs(x - endX) <= HANDLE_HIT_PX) {
      this.drag = 'end';
    } else {
      // A fresh selection: anchor where the pointer went down and grow the end.
      // It is only committed once the pointer actually travels — see onPointerUp.
      this.drag = 'end';
      const time = this.xToTime(x);
      this.stopPlayback();
      this.selStart.set(time);
      this.selEnd.set(Math.min(this.duration(), time + MIN_SELECTION_SECONDS));
    }

    this.activeHandle.set(this.drag);
    event.preventDefault();
  }

  protected onPointerMove(event: PointerEvent): void {
    const el = this.canvasRef()?.nativeElement;
    const width = this.viewWidth();
    if (!el || width <= 0) return;

    const x = event.clientX - el.getBoundingClientRect().left;

    if (!this.drag) {
      const near =
        Math.abs(x - this.timeToX(this.selStart())) <= HANDLE_HIT_PX ||
        Math.abs(x - this.timeToX(this.selEnd())) <= HANDLE_HIT_PX;
      el.style.cursor = near ? 'ew-resize' : 'crosshair';
      return;
    }

    if (Math.abs(x - this.dragOrigin.x) > DRAG_SLOP_PX) this.dragOrigin.moved = true;

    const time = this.xToTime(x);

    // Dragging one handle past the other swaps which one you are holding, which
    // is what every editor does and what the hand expects — without it the
    // selection collapses against an invisible wall.
    if (this.drag === 'start' && time > this.selEnd()) {
      this.selStart.set(this.selEnd());
      this.drag = 'end';
    } else if (this.drag === 'end' && time < this.selStart()) {
      this.selEnd.set(this.selStart());
      this.drag = 'start';
    }

    if (this.drag === 'start') this.setStart(time);
    else this.setEnd(time);

    this.activeHandle.set(this.drag);
    this.updateEdgeScroll(x, width);
  }

  protected onPointerUp(event: PointerEvent): void {
    const el = this.canvasRef()?.nativeElement;
    if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);

    // A tap that never moved was not an attempt to select 20 ms of audio.
    if (this.drag && !this.dragOrigin.moved) {
      this.selStart.set(this.dragOrigin.start);
      this.selEnd.set(this.dragOrigin.end);
    }

    this.drag = null;
    this.stopEdgeScroll();
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    this.selStart.set(this.dragOrigin.start);
    this.selEnd.set(this.dragOrigin.end);
    this.drag = null;
    this.stopEdgeScroll();
  }

  /**
   * Dragging a handle to the edge pulls the view along.
   *
   * Zoomed in, the other end of a trim is routinely off screen, and without this
   * the only way there is to drop the handle, scroll, and pick it up again —
   * which loses the position you were tuning. It runs on its own frame loop
   * rather than off pointermove, because the gesture that needs it most is
   * holding still against the edge, which fires no move events at all.
   */
  private updateEdgeScroll(x: number, width: number): void {
    if (this.zoomLevel() <= MIN_ZOOM) return;

    const direction = x < EDGE_SCROLL_PX ? -1 : x > width - EDGE_SCROLL_PX ? 1 : 0;
    this.edgeScroll = direction * EDGE_SCROLL_SPEED;

    if (direction === 0) {
      this.stopEdgeScroll();
      return;
    }
    if (this.edgeFrame) return;

    const step = () => {
      const el = this.scrollerRef()?.nativeElement;
      if (!el || !this.drag || this.edgeScroll === 0) {
        this.edgeFrame = 0;
        return;
      }

      el.scrollLeft += this.edgeScroll;
      // The handle stays pinned to the edge it is being held against.
      const time = this.xToTime(this.edgeScroll < 0 ? 0 : this.viewWidth());
      if (this.drag === 'start') this.setStart(time);
      else this.setEnd(time);

      this.edgeFrame = requestAnimationFrame(step);
    };

    this.edgeFrame = requestAnimationFrame(step);
  }

  private stopEdgeScroll(): void {
    this.edgeScroll = 0;
    cancelAnimationFrame(this.edgeFrame);
    this.edgeFrame = 0;
  }

  protected onCanvasKey(event: KeyboardEvent): void {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      void this.togglePlay();
      return;
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      this.zoomBy(1.5);
      return;
    }
    if (event.key === '-') {
      event.preventDefault();
      this.zoomBy(1 / 1.5);
      return;
    }

    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!direction) return;

    event.preventDefault();
    // The nudge follows the zoom. A fixed tenth of a second is a third of the
    // stage at 16x, which is the opposite of the fine control this is here for.
    const step = (event.shiftKey ? 10 : 1) * direction * (this.viewLength() / 400);

    if (this.activeHandle() === 'start') this.setStart(this.selStart() + step);
    else this.setEnd(this.selEnd() + step);
  }

  protected focusHandle(edge: 'start' | 'end'): void {
    this.activeHandle.set(edge);
  }

  // ------------------------------------------------------------------ run

  protected async run(): Promise<void> {
    const buffer = this.buffer();
    const file = this.file();
    if (!buffer || !file || this.busy()) return;

    this.stopPlayback();
    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const res = await this.cutter.cut({
        buffer,
        originalName: file.name,
        start: this.selStart(),
        end: this.selEnd(),
        mode: this.mode(),
        fadeIn: this.fadeIn(),
        fadeOut: this.fadeOut(),
        onProgress: (percent) => this.progress.set(percent),
      });

      this.result.set(res);
      this.ranSignature.set(this.signature());

      // Save output in session history (past[] and history[]) so undo and tool chaining work seamlessly.
      this.audioState.apply('cut-audio', res.blob, this.tool.suffix, 'wav');

      const resultFile = this.audioState.currentFile();
      if (resultFile) {
        try {
          const cutCtx = new AudioContext();
          const cutBuffer = await cutCtx.decodeAudioData(await res.blob.arrayBuffer());
          void cutCtx.close();
          this.file.set(resultFile);
          this.buffer.set(cutBuffer);
          this.selStart.set(0);
          this.selEnd.set(cutBuffer.duration);
          this.zoomLevel.set(1);
          this.viewStart.set(0);
        } catch {
          // Non-fatal fallback
        }
      }
    } catch (err) {
      console.error('[CutAudio] cut failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const res = this.result();
    if (res) saveBlob(res.blob, res.filename);
  }

  protected continueEdit(): void {
    const res = this.result();
    if (!res) return;

    try {
      this.audioState.apply('cut-audio', res.blob, this.tool.suffix, 'wav');
      void this.router.navigate(['/']);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  // ------------------------------------------------------------ formatting

  protected timecode(seconds: number): string {
    return formatTimecode(seconds);
  }

  protected clock(seconds: number): string {
    return formatClock(seconds);
  }

  // -------------------------------------------------------------- painting

  /** Time → x within the visible window. */
  private timeToX(seconds: number): number {
    const length = this.viewLength();
    return length > 0 ? ((seconds - this.viewStart()) / length) * this.viewWidth() : 0;
  }

  private xToTime(x: number): number {
    const time = this.viewStart() + (x / this.viewWidth()) * this.viewLength();
    return clamp(time, 0, this.duration());
  }

  private draw(): void {
    const el = this.canvasRef()?.nativeElement;
    const peaks = this.peaks();
    const width = this.viewWidth();
    const duration = this.duration();
    if (!el || !peaks || width <= 0 || duration <= 0) return;

    // The backing store follows the device pixel ratio; anything less and the
    // 1px ruler ticks and handle lines land between pixels and go grey.
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(CANVAS_HEIGHT * dpr);
    if (el.width !== pixelWidth || el.height !== pixelHeight) {
      el.width = pixelWidth;
      el.height = pixelHeight;
    }

    const ctx = el.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, CANVAS_HEIGHT);

    const colors = this.waveColors();
    const startX = this.timeToX(this.selStart());
    const endX = this.timeToX(this.selEnd());

    this.drawRuler(ctx, width, colors);
    this.drawSelectionBand(ctx, startX, endX, colors);
    this.drawWaveform(ctx, peaks, width, startX, endX, colors);
    this.drawHandles(ctx, startX, endX, colors);
    this.drawPlayhead(ctx, colors);
  }

  private drawRuler(ctx: CanvasRenderingContext2D, width: number, colors: WaveColors): void {
    const length = this.viewLength();
    const from = this.viewStart();
    const step = rulerStep(length, width);

    ctx.font = '10px ui-monospace, "Segoe UI Mono", Menlo, monospace';
    ctx.textBaseline = 'top';

    // Ticks land on absolute times, not on multiples of the window — so they
    // stay put under the audio while scrolling instead of crawling with it.
    for (let time = Math.ceil(from / step) * step; time <= from + length + 1e-6; time += step) {
      const x = Math.round(this.timeToX(time)) + 0.5;

      ctx.fillStyle = colors.grid;
      ctx.fillRect(x, RULER_HEIGHT - 6, 1, 6);
      ctx.fillRect(x, RULER_HEIGHT, 1, CANVAS_HEIGHT - RULER_HEIGHT);

      // Under a second apart, whole seconds would print the same label twice.
      const label = step < 1 ? formatTimecode(time).slice(0, -2) : formatClock(time);
      const labelWidth = ctx.measureText(label).width;
      // A label that would hang off either edge is dropped, not clipped.
      if (x + labelWidth + 4 > width || x < 2) continue;

      ctx.fillStyle = colors.label;
      ctx.fillText(label, x + 4, 3);
    }
  }

  private drawSelectionBand(
    ctx: CanvasRenderingContext2D,
    startX: number,
    endX: number,
    colors: WaveColors,
  ): void {
    ctx.save();
    // globalAlpha rather than an eight-digit hex: the tokens resolve through
    // var(--accent), so the component never gets to assume the string it read
    // is a hex it can staple two more characters onto.
    ctx.globalAlpha = this.mode() === 'keep' ? 0.08 : 0.1;
    ctx.fillStyle = this.mode() === 'keep' ? colors.keep : colors.drop;
    ctx.fillRect(startX, RULER_HEIGHT, Math.max(1, endX - startX), CANVAS_HEIGHT - RULER_HEIGHT);
    ctx.restore();
  }

  private drawWaveform(
    ctx: CanvasRenderingContext2D,
    peaks: Peaks,
    width: number,
    startX: number,
    endX: number,
    colors: WaveColors,
  ): void {
    const top = RULER_HEIGHT;
    const height = CANVAS_HEIGHT - RULER_HEIGHT;
    const mid = top + height / 2;
    const scale = (height / 2) * 0.9;

    // What survives the cut is the strong colour, whichever side of the
    // selection that happens to be — so switching to "remove" visibly repaints
    // the meaning of the selection instead of only changing a label.
    const inside = this.mode() === 'keep' ? colors.keep : colors.drop;
    const outside = this.mode() === 'keep' ? colors.idle : colors.keep;

    // Only the buckets the window covers, which is what makes zooming mean more
    // detail rather than a stretched picture.
    const total = peaks.max.length;
    const bucketFrom = (this.viewStart() / this.duration()) * total;
    const bucketSpan = (this.viewLength() / this.duration()) * total;

    const columns = Math.floor(width);
    const perColumn = bucketSpan / columns;

    for (let column = 0; column < columns; column++) {
      const from = Math.floor(bucketFrom + column * perColumn);
      const to = Math.max(from + 1, Math.floor(bucketFrom + (column + 1) * perColumn));

      let lo = 0;
      let hi = 0;
      for (let i = Math.max(0, from); i < to && i < total; i++) {
        if (peaks.min[i] < lo) lo = peaks.min[i];
        if (peaks.max[i] > hi) hi = peaks.max[i];
      }

      const x = column + 0.5;
      ctx.fillStyle = x >= startX && x <= endX ? inside : outside;

      // Always at least a hairline: a silent passage that renders as nothing at
      // all reads as "the file failed to load", not as silence.
      const yTop = mid - hi * scale;
      const yBottom = mid - lo * scale;
      ctx.fillRect(column, yTop, 1, Math.max(1, yBottom - yTop));
    }
  }

  private drawHandles(
    ctx: CanvasRenderingContext2D,
    startX: number,
    endX: number,
    colors: WaveColors,
  ): void {
    const colour = this.mode() === 'keep' ? colors.keep : colors.drop;

    for (const [x, edge] of [
      [startX, 'start'],
      [endX, 'end'],
    ] as const) {
      const line = Math.round(x) + 0.5;
      const active = this.activeHandle() === edge;

      ctx.fillStyle = colour;
      ctx.fillRect(line - 1, RULER_HEIGHT, 2, CANVAS_HEIGHT - RULER_HEIGHT);

      // The grip. Bigger than it needs to look, because it doubles as the visual
      // promise that the 11px hit area exists.
      const knobHeight = 34;
      const knobY = RULER_HEIGHT + (CANVAS_HEIGHT - RULER_HEIGHT - knobHeight) / 2;
      roundedRect(ctx, line - 5, knobY, 10, knobHeight, 4);
      ctx.fill();

      ctx.save();
      ctx.globalAlpha = active ? 0.95 : 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(line - 2, knobY + 11, 1, 12);
      ctx.fillRect(line + 1, knobY + 11, 1, 12);
      ctx.restore();
    }
  }

  private drawPlayhead(ctx: CanvasRenderingContext2D, colors: WaveColors): void {
    const head = this.playhead();
    if (head === null) return;

    const x = Math.round(this.timeToX(head)) + 0.5;
    ctx.fillStyle = colors.playhead;
    ctx.fillRect(x - 0.5, RULER_HEIGHT - 4, 1.5, CANVAS_HEIGHT - RULER_HEIGHT + 4);

    ctx.beginPath();
    ctx.moveTo(x - 4, RULER_HEIGHT - 8);
    ctx.lineTo(x + 4, RULER_HEIGHT - 8);
    ctx.lineTo(x, RULER_HEIGHT - 2);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Colours come from the design tokens, read off the root element.
   *
   * A canvas cannot carry a Tailwind class, and the rule against hardcoding a
   * hex in a component does not stop being true at the canvas boundary — so the
   * values are resolved from `--color-wave-*` at paint time instead. Read once:
   * there is a single theme, and getComputedStyle in a 60fps loop is a layout
   * read nobody needs.
   */
  private waveColors(): WaveColors {
    if (this.colors) return this.colors;

    const style = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;

    this.colors = {
      idle: token('--color-wave-idle', '#94a3b8'),
      keep: token('--color-wave-keep', '#1d4ed8'),
      drop: token('--color-wave-drop', '#b91c1c'),
      grid: token('--color-wave-grid', '#e2e8f0'),
      label: token('--color-wave-label', '#475569'),
      playhead: token('--color-wave-playhead', '#0f172a'),
    };
    return this.colors;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function touchDistance(event: TouchEvent): number {
  const a = event.touches[0];
  const b = event.touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
