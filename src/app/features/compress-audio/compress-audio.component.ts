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
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  AudioCompressorService,
  type CompressBitrate,
  type CompressChannels,
} from './services/audio-compressor.service';

/** CSS pixels — same recipe as cut-audio and convert-audio. */
const CANVAS_HEIGHT = 208;
const RULER_HEIGHT = 24;
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
  selector: 'app-compress-audio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    IconComponent,
    ButtonDirective,
  ],
  templateUrl: './compress-audio.component.html',
})
export class CompressAudioComponent implements OnDestroy {
  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('compress-audio');
  private readonly compressor = inject(AudioCompressorService);
  private readonly engine = new AudioEngine();

  protected readonly acceptAttr = ACCEPT_AUDIO_ATTR;
  protected readonly canvasHeight = CANVAS_HEIGHT;

  // Source
  protected readonly currentFile = signal<File | null>(null);
  protected readonly audioBuffer = signal<AudioBuffer | null>(null);
  protected readonly loading = signal(false);
  protected readonly sourceFormat = signal<string>('');

  // View / waveform
  protected readonly zoomLevel = signal(1);
  protected readonly viewStart = signal(0);
  protected readonly viewWidth = signal(0);

  // Playback
  protected readonly playing = signal(false);
  protected readonly playhead = signal<number | null>(null);

  // Options
  protected readonly bitrate = signal<CompressBitrate>('128');
  protected readonly channels = signal<CompressChannels>('original');
  protected readonly sampleRate = signal<number>(0);

  // Run
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly result = signal<{ blob: Blob; filename: string } | null>(null);
  protected readonly outputExt = signal<string>(''); // actual ext of last result
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly bitrateOptions: readonly { value: CompressBitrate; label: string }[] = [
    { value: '32', label: '32 kbps' },
    { value: '64', label: '64 kbps' },
    { value: '128', label: '128 kbps' },
    { value: '192', label: '192 kbps' },
    { value: '320', label: '320 kbps' },
  ];

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('wave');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');

  private observer: ResizeObserver | null = null;
  private frame = 0;
  private colors: WaveColors | null = null;
  private _pinchDistance = 0;
  private _pinchZoom = 1;

  // ---------------------------------------------------------------- computed

  protected readonly duration = computed(() => this.audioBuffer()?.duration ?? 0);

  protected readonly sourceSize = computed(() => {
    const f = this.currentFile();
    return f ? formatBytes(f.size) : '';
  });

  protected readonly estimatedSize = computed(() => {
    const buffer = this.audioBuffer();
    if (!buffer) return null;
    const bytes = this.compressor.estimatedBytes(buffer, {
      bitrate: this.bitrate(),
      channels: this.channels(),
      sampleRate: this.sampleRate(),
      sourceFormat: this.sourceFormat().toLowerCase() || 'mp3',
    });
    return formatBytes(bytes);
  });

  protected readonly peaks = computed<Peaks | null>(() => {
    const buffer = this.audioBuffer();
    if (!buffer) return null;
    const chs: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) chs.push(buffer.getChannelData(ch));
    return computePeaks(chs, Math.min(PEAK_BUCKETS, buffer.length));
  });

  protected readonly viewLength = computed(() => this.duration() / this.zoomLevel());
  protected readonly scrollWidth = computed(() => Math.round(this.viewWidth() * this.zoomLevel()));
  protected readonly zoomPercent = computed(() => Math.round(this.zoomLevel() * 100));
  protected readonly canZoomOut = computed(() => this.zoomLevel() > MIN_ZOOM + 1e-6);
  protected readonly canZoomIn = computed(() => this.zoomLevel() < MAX_ZOOM - 1e-6);

  // ---------------------------------------------------------------- lifecycle

  constructor() {
    effect((onCleanup) => {
      const el = this.scrollerRef()?.nativeElement;
      if (!el) return;

      const obs = new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width);
        if (w > 0) this.viewWidth.set(w);
      });
      obs.observe(el);
      this.observer = obs;
      onCleanup(() => { obs.disconnect(); this.observer = null; });
    });

    effect(() => {
      this.peaks(); this.viewWidth(); this.viewStart();
      this.zoomLevel(); this.playhead();
      this.draw();
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.engine.close();
    this.observer?.disconnect();
  }

  // ---------------------------------------------------------------- loading

  protected async onFile(file: File): Promise<void> {
    this.stopPlayback();
    this.errorKey.set(null);
    this.result.set(null);
    this.loading.set(true);

    try {
      assertUsableAudio(file);
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ab = await file.arrayBuffer();
      const buffer = await ctx.decodeAudioData(ab);
      void ctx.close();

      if (buffer.duration > 3 * 3600) throw new AppError('audio_too_long');

      const fmt = file.name.split('.').pop()?.toLowerCase() ?? 'mp3';
      this.sourceFormat.set(fmt);
      this.currentFile.set(file);
      this.audioBuffer.set(buffer);
      this.zoomLevel.set(1);
      this.viewStart.set(0);
    } catch (err) {
      console.error('[CompressAudio] onFile error:', err);
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

  protected zoomBy(factor: number): void { this.setZoom(this.zoomLevel() * factor); }
  protected fitAll(): void { this.setZoom(MIN_ZOOM); }

  protected setZoomFromInput(input: HTMLInputElement): void {
    const v = parseInt(input.value, 10);
    if (!Number.isNaN(v)) this.setZoom(v / 100);
    input.value = String(this.zoomPercent());
  }

  protected onScroll(): void {
    const el = this.scrollerRef()?.nativeElement;
    const w = this.scrollWidth();
    if (!el || w <= 0 || this.duration() <= 0) return;
    this.viewStart.set(clamp((el.scrollLeft / w) * this.duration(), 0, this.duration()));
  }

  protected onWheel(event: WheelEvent): void {
    const el = this.scrollerRef()?.nativeElement;
    if (!el) return;
    if (event.ctrlKey || event.metaKey) {
      if (event.cancelable) event.preventDefault();
      const frac = clamp((event.clientX - el.getBoundingClientRect().left) / el.clientWidth, 0, 1);
      const anchor = this.viewStart() + frac * this.viewLength();
      this.setZoom(this.zoomLevel() * (event.deltaY > 0 ? 1 / 1.2 : 1.2), anchor, frac);
      return;
    }
    if (this.zoomLevel() > MIN_ZOOM && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      if (event.cancelable) event.preventDefault();
      el.scrollLeft += event.deltaY;
    }
  }

  protected onTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 2) return;
    this._pinchDistance = touchDist(e);
    this._pinchZoom = this.zoomLevel();
  }

  protected onTouchMove(e: TouchEvent): void {
    if (e.touches.length !== 2 || this._pinchDistance <= 0) return;
    if (e.cancelable) e.preventDefault();
    this.setZoom((this._pinchZoom * touchDist(e)) / this._pinchDistance);
  }

  protected onTouchEnd(e: TouchEvent): void {
    if (e.touches.length < 2) this._pinchDistance = 0;
  }

  // ---------------------------------------------------------------- playback

  protected onCanvasClick(event: PointerEvent): void {
    const el = this.canvasRef()?.nativeElement;
    if (!el || this.viewWidth() <= 0 || this.duration() <= 0) return;
    const x = event.clientX - el.getBoundingClientRect().left;
    const time = this.xToTime(x);
    this.stopPlayback();
    void this.startPlayback(time);
  }

  protected async togglePlay(): Promise<void> {
    if (this.playing()) { this.stopPlayback(); return; }
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
    const step = () => {
      const elapsed = this.engine.elapsed();
      if (elapsed === null) return;
      this.playhead.set(seekTime + elapsed);
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private stopPlayback(): void {
    cancelAnimationFrame(this.frame);
    this.engine.stop();
    this.playing.set(false);
    this.playhead.set(null);
  }

  // ---------------------------------------------------------------- run

  protected async run(): Promise<void> {
    const buffer = this.audioBuffer();
    const file = this.currentFile();
    if (!buffer || !file || this.busy()) return;

    this.stopPlayback();
    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const { blob, ext } = await this.compressor.compress(
        buffer,
        {
          bitrate: this.bitrate(),
          channels: this.channels(),
          sampleRate: this.sampleRate(),
          sourceFormat: this.sourceFormat() || 'mp3',
        },
        (pct) => this.progress.set(pct),
      );

      this.outputExt.set(ext);
      const filename = suffixedName(file.name, this.tool.suffix, ext);
      this.result.set({ blob, filename });
    } catch (err) {
      console.error('[CompressAudio] run error:', err);
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

  // ---------------------------------------------------------------- formatting

  protected clock(s: number): string { return formatClock(s); }
  protected timecode(s: number): string { return formatTimecode(s); }

  // ---------------------------------------------------------------- painting

  private timeToX(s: number): number {
    const len = this.viewLength();
    return len > 0 ? ((s - this.viewStart()) / len) * this.viewWidth() : 0;
  }

  private xToTime(x: number): number {
    return clamp(this.viewStart() + (x / this.viewWidth()) * this.viewLength(), 0, this.duration());
  }

  private draw(): void {
    const el = this.canvasRef()?.nativeElement;
    const peaks = this.peaks();
    const width = this.viewWidth();
    const dur = this.duration();
    if (!el || !peaks || width <= 0 || dur <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(width * dpr);
    const ph = Math.round(CANVAS_HEIGHT * dpr);
    if (el.width !== pw || el.height !== ph) { el.width = pw; el.height = ph; }

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

    for (let t = Math.ceil(from / step) * step; t <= from + length + 1e-6; t += step) {
      const x = Math.round(this.timeToX(t)) + 0.5;
      ctx.fillStyle = colors.grid;
      ctx.fillRect(x, RULER_HEIGHT - 6, 1, 6);
      ctx.fillRect(x, RULER_HEIGHT, 1, CANVAS_HEIGHT - RULER_HEIGHT);

      const label = step < 1 ? formatTimecode(t).slice(0, -2) : formatClock(t);
      const lw = ctx.measureText(label).width;
      if (x + lw + 4 > width || x < 2) continue;
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
    const perCol = bucketSpan / columns;

    for (let col = 0; col < columns; col++) {
      const from = Math.floor(bucketFrom + col * perCol);
      const to = Math.max(from + 1, Math.floor(bucketFrom + (col + 1) * perCol));

      let lo = 0, hi = 0;
      for (let i = Math.max(0, from); i < to && i < total; i++) {
        if (peaks.min[i] < lo) lo = peaks.min[i];
        if (peaks.max[i] > hi) hi = peaks.max[i];
      }

      ctx.fillStyle = colors.keep;
      const yTop = mid - hi * scale;
      const yBot = mid - lo * scale;
      ctx.fillRect(col, yTop, 1, Math.max(1, yBot - yTop));
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

  private waveColors(): WaveColors {
    if (this.colors) return this.colors;
    const style = getComputedStyle(document.documentElement);
    const token = (n: string, fb: string) => style.getPropertyValue(n).trim() || fb;
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function touchDist(e: TouchEvent): number {
  const a = e.touches[0], b = e.touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
