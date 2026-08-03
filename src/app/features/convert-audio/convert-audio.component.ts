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
import { FormsModule } from '@angular/forms';
import { AudioEngine } from '../../core/audio/audio-engine';
import {
  ACCEPT_AUDIO_ATTR,
  assertUsableAudio,
  formatClock,
  formatTimecode,
} from '../../core/audio/audio-file.util';
import { computePeaks, rulerStep, type Peaks } from '../../core/audio/waveform';
import { AppError, toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { AudioStateService } from '../../core/services/audio-state.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  AudioBitrate,
  AudioChannels,
  AudioConverterService,
  ConvertResult,
  TargetAudioFormat,
} from './services/audio-converter.service';

/** CSS pixels. The ruler strip lives inside the same canvas, at the top. */
const CANVAS_HEIGHT = 208;
const RULER_HEIGHT = 24;

/**
 * Peaks are computed ONCE per file, at a resolution that covers the deepest
 * zoom — never per pixel width and never per scroll position.
 */
const PEAK_BUCKETS = 131_072;

const MIN_ZOOM = 1;
const MAX_ZOOM = 64;

interface WaveColors {
  idle: string;
  keep: string;
  drop: string;
  grid: string;
  label: string;
  playhead: string;
}

@Component({
  selector: 'app-convert-audio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    IconComponent,
    ButtonDirective,
  ],
  templateUrl: './convert-audio.component.html',
})
export class ConvertAudioComponent implements OnDestroy {
  protected readonly tool = toolById('convert-audio');
  private readonly converter = inject(AudioConverterService);
  private readonly audioState = inject(AudioStateService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(TranslationService);

  /**
   * Owned by the component — holds a live AudioContext for playback. Per-run
   * state that must die with the view.
   */
  private readonly engine = new AudioEngine();

  protected readonly acceptAttr = ACCEPT_AUDIO_ATTR;
  protected readonly canvasHeight = CANVAS_HEIGHT;

  // Source
  protected readonly currentFile = signal<File | null>(null);
  protected readonly audioBuffer = signal<AudioBuffer | null>(null);
  protected readonly loading = signal(false);
  protected readonly sourceFormat = signal<string>('MP3');

  // View
  protected readonly zoomLevel = signal(1);
  protected readonly viewStart = signal(0);
  protected readonly viewWidth = signal(0);

  // Playback
  protected readonly playing = signal(false);
  protected readonly playhead = signal<number | null>(null);

  // Run / convert
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly result = signal<{ blob: Blob; filename: string } | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  /** Actual output extension after conversion — may differ from targetFormat on fallback */
  protected readonly outputExt = signal<string>('');

  // Converter options
  protected readonly formats: readonly TargetAudioFormat[] = [
    'mp3',
    'wav',
    'ogg',
    'm4a',
    'webm',
    'flac',
  ];
  protected readonly targetFormat = signal<TargetAudioFormat>('mp3');
  protected readonly channels = signal<AudioChannels>('original');
  protected readonly sampleRate = signal<number>(0); // 0 = original
  protected readonly bitrate = signal<AudioBitrate>('320');

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('wave');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');

  private observer: ResizeObserver | null = null;
  private frame = 0;
  private colors: WaveColors | null = null;

  // ---------------------------------------------------------------- computed

  protected readonly duration = computed(() => this.audioBuffer()?.duration ?? 0);

  protected readonly sourceSize = computed(() => {
    const file = this.currentFile();
    return file ? formatBytes(file.size) : '';
  });

  protected readonly peaks = computed<Peaks | null>(() => {
    const buffer = this.audioBuffer();
    if (!buffer) return null;

    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));
    return computePeaks(channels, Math.min(PEAK_BUCKETS, buffer.length));
  });

  protected readonly viewLength = computed(() => this.duration() / this.zoomLevel());
  protected readonly scrollWidth = computed(() => Math.round(this.viewWidth() * this.zoomLevel()));

  protected readonly zoomPercent = computed(() => Math.round(this.zoomLevel() * 100));
  protected readonly canZoomOut = computed(() => this.zoomLevel() > MIN_ZOOM + 1e-6);
  protected readonly canZoomIn = computed(() => this.zoomLevel() < MAX_ZOOM - 1e-6);

  // ---------------------------------------------------------------- lifecycle

  constructor() {
    // Wire ResizeObserver when the scroller appears/disappears.
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

    // Single redraw path for all visual inputs.
    effect(() => {
      this.peaks();
      this.viewWidth();
      this.viewStart();
      this.zoomLevel();
      this.playhead();
      this.draw();
    });

    // Auto-load the persisted audio file when the user navigates to this tool.
    const savedFile = this.audioState.currentFile();
    if (savedFile) void this.onFile(savedFile);
  }

  ngOnDestroy(): void {
    // Só cancela o que chegou a ser agendado: a geração estática destrói o app
    // depois de cada rota, e cancelAnimationFrame não existe no Node — sem a
    // guarda, isto matava o worker do prerender e derrubava em cascata as rotas
    // que ainda estavam na fila dele. Ver cut-audio.component.ts.
    if (this.frame) cancelAnimationFrame(this.frame);
    this.engine.close();
    this.observer?.disconnect();
  }

  // ---------------------------------------------------------------- loading

  protected async onFile(file: File): Promise<void> {
    this.stopPlayback();
    this.errorKey.set(null);
    this.loading.set(true);

    try {
      assertUsableAudio(file);

      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      void ctx.close();

      if (buffer.duration > 3 * 3600) throw new AppError('audio_too_long');

      const fmt = file.name.split('.').pop()?.toLowerCase() ?? 'audio';
      this.sourceFormat.set(fmt.toUpperCase());

      this.currentFile.set(file);
      this.audioBuffer.set(buffer);
      this.audioState.load(file);   // persist across tool navigation
      this.zoomLevel.set(1);
      this.viewStart.set(0);

      // Default target: swap mp3↔wav
      this.targetFormat.set(fmt === 'mp3' ? 'wav' : 'mp3');
    } catch (err) {
      console.error('[ConvertAudio] could not open the audio file:', err);
      this.currentFile.set(null);
      this.audioBuffer.set(null);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected reset(): void {
    this.stopPlayback();
    this.currentFile.set(null);
    this.audioBuffer.set(null);
    this.result.set(null);
    this.errorKey.set(null);
    this.zoomLevel.set(1);
    this.viewStart.set(0);
    this.audioState.clear();   // clear the global bar too
  }

  // ---------------------------------------------------------------- zoom

  protected setZoom(next: number, anchorTime?: number, anchorFraction = 0.5): void {
    const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
    const anchor = anchorTime ?? this.viewStart() + this.viewLength() / 2;

    this.zoomLevel.set(clamped);

    const length = this.duration() / clamped;
    const start = clamp(anchor - anchorFraction * length, 0, Math.max(0, this.duration() - length));
    this.viewStart.set(start);

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

    if (this.zoomLevel() > MIN_ZOOM && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      if (event.cancelable) event.preventDefault();
      el.scrollLeft += event.deltaY;
    }
  }

  protected onTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 2) return;
    this._pinchDistance = touchDistance(event);
    this._pinchZoom = this.zoomLevel();
  }

  protected onTouchMove(event: TouchEvent): void {
    if (event.touches.length !== 2 || this._pinchDistance <= 0) return;
    if (event.cancelable) event.preventDefault();
    this.setZoom((this._pinchZoom * touchDistance(event)) / this._pinchDistance);
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) this._pinchDistance = 0;
  }

  private _pinchDistance = 0;
  private _pinchZoom = 1;

  // ---------------------------------------------------------------- canvas click → seek

  protected onCanvasClick(event: PointerEvent): void {
    const el = this.canvasRef()?.nativeElement;
    const width = this.viewWidth();
    if (!el || width <= 0 || this.duration() <= 0) return;

    const x = event.clientX - el.getBoundingClientRect().left;
    const time = this.xToTime(x);
    this.stopPlayback();
    this.startPlayback(time);
  }

  // ---------------------------------------------------------------- playback

  protected async togglePlay(): Promise<void> {
    if (this.playing()) {
      this.stopPlayback();
      return;
    }
    await this.startPlayback(this.playhead() ?? 0);
  }

  private async startPlayback(seekTime = 0): Promise<void> {
    const buffer = this.audioBuffer();
    if (!buffer) return;

    await this.engine.play(
      { buffer, segments: [[seekTime, buffer.duration]], fadeIn: 0, fadeOut: 0 },
      () => this.stopPlayback(),
    );

    this.playing.set(true);
    this.trackPlayhead(seekTime);
  }

  private stopPlayback(): void {
    cancelAnimationFrame(this.frame);
    this.engine.stop();
    this.playing.set(false);
    this.playhead.set(null);
  }

  private trackPlayhead(startOffset: number): void {
    const step = () => {
      const elapsed = this.engine.elapsed();
      if (elapsed === null) return;
      this.playhead.set(startOffset + elapsed);
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- run / convert

  protected async convert(): Promise<void> {
    const buffer = this.audioBuffer();
    const file = this.currentFile();
    if (!buffer || !file || this.busy()) return;

    this.stopPlayback();
    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(10);

    try {
      const { blob, ext }: ConvertResult = await this.converter.convertAudio(
        buffer,
        {
          targetFormat: this.targetFormat(),
          channels: this.channels(),
          sampleRate: this.sampleRate(),
          bitrate: this.bitrate(),
        },
        (pct) => this.progress.set(pct),
      );

      this.outputExt.set(ext);
      const filename = suffixedName(file.name, this.tool.suffix, ext);
      this.result.set({ blob, filename });

      // Save output in session history so undo and tool chaining work seamlessly.
      this.audioState.apply('convert-audio', blob, this.tool.suffix, ext);
    } catch (err) {
      console.error('[ConvertAudio] export error:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const r = this.result();
    if (r) saveBlob(r.blob, r.filename);
  }

  protected continueEdit(): void {
    const r = this.result();
    if (!r) return;

    try {
      this.audioState.apply('convert-audio', r.blob, this.tool.suffix, this.outputExt() || 'mp3');
      void this.router.navigate(['/']);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  // ---------------------------------------------------------------- formatting

  protected clock(seconds: number): string {
    return formatClock(seconds);
  }

  protected timecode(seconds: number): string {
    return formatTimecode(seconds);
  }

  // ---------------------------------------------------------------- painting

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

    this.drawRuler(ctx, width, colors);
    this.drawWaveform(ctx, peaks, width, colors);
    this.drawPlayhead(ctx, colors);
  }

  private drawRuler(ctx: CanvasRenderingContext2D, width: number, colors: WaveColors): void {
    const length = this.viewLength();
    const from = this.viewStart();
    const step = rulerStep(length, width);

    ctx.font = '10px ui-monospace, "Segoe UI Mono", Menlo, monospace';
    ctx.textBaseline = 'top';

    for (let time = Math.ceil(from / step) * step; time <= from + length + 1e-6; time += step) {
      const x = Math.round(this.timeToX(time)) + 0.5;

      ctx.fillStyle = colors.grid;
      ctx.fillRect(x, RULER_HEIGHT - 6, 1, 6);
      ctx.fillRect(x, RULER_HEIGHT, 1, CANVAS_HEIGHT - RULER_HEIGHT);

      const label = step < 1 ? formatTimecode(time).slice(0, -2) : formatClock(time);
      const labelWidth = ctx.measureText(label).width;
      if (x + labelWidth + 4 > width || x < 2) continue;

      ctx.fillStyle = colors.label;
      ctx.fillText(label, x + 4, 3);
    }
  }

  private drawWaveform(
    ctx: CanvasRenderingContext2D,
    peaks: Peaks,
    width: number,
    colors: WaveColors,
  ): void {
    const top = RULER_HEIGHT;
    const height = CANVAS_HEIGHT - RULER_HEIGHT;
    const mid = top + height / 2;
    const scale = (height / 2) * 0.9;

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

      ctx.fillStyle = colors.keep;

      const yTop = mid - hi * scale;
      const yBottom = mid - lo * scale;
      ctx.fillRect(column, yTop, 1, Math.max(1, yBottom - yTop));
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
   * Colours resolved from design tokens at first paint (same pattern as cut-audio).
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
