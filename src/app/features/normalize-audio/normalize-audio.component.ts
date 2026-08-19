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
import { AudioEngine } from '../../core/audio/audio-engine';
import {
  ACCEPT_AUDIO_ATTR,
  assertUsableAudio,
  formatClock,
  formatTimecode,
} from '../../core/audio/audio-file.util';
import { gainToDb, type LoudnessMeasurement } from '../../core/audio/loudness';
import { computePeaks, rulerStep, type Peaks } from '../../core/audio/waveform';
import { AppError, toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  AudioNormalizerService,
  type NormalizeAudioOptions,
  type NormalizeBitrate,
  type NormalizeFormat,
  type NormalizeMode,
} from './services/audio-normalizer.service';

/** CSS pixels — mesma receita de cut-audio, convert-audio e compress-audio. */
const CANVAS_HEIGHT = 208;
const RULER_HEIGHT = 24;
const PEAK_BUCKETS = 131_072;
const MIN_ZOOM = 1;
const MAX_ZOOM = 64;

/**
 * A partir daqui o ganho deixa de ser correção e vira amplificação de chiado: o
 * ruído de fundo sobe junto, e num arquivo já ruim ele é o que se ouve. O painel
 * avisa em vez de recusar — quem gravou sabe o que gravou.
 */
const NOISY_GAIN_DB = 12;

interface WaveColors {
  idle: string;
  keep: string;
  drop: string;
  grid: string;
  label: string;
  playhead: string;
}

@Component({
  selector: 'app-normalize-audio',
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
    SegmentedComponent,
  ],
  templateUrl: './normalize-audio.component.html',
})
export class NormalizeAudioComponent implements OnDestroy {
  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('normalize-audio');
  private readonly normalizer = inject(AudioNormalizerService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  private readonly router = inject(Router);
  private readonly engine = new AudioEngine();

  protected readonly acceptAttr = ACCEPT_AUDIO_ATTR;
  protected readonly canvasHeight = CANVAS_HEIGHT;
  protected readonly noisyGainDb = NOISY_GAIN_DB;

  // Fonte
  protected readonly currentFile = signal<File | null>(null);
  protected readonly audioBuffer = signal<AudioBuffer | null>(null);
  protected readonly measurement = signal<LoudnessMeasurement | null>(null);
  protected readonly phase = signal<'decoding' | 'measuring' | null>(null);

  // Visão / waveform
  protected readonly zoomLevel = signal(1);
  protected readonly viewStart = signal(0);
  protected readonly viewWidth = signal(0);

  // Reprodução
  protected readonly playing = signal(false);
  protected readonly playhead = signal<number | null>(null);

  // Opções
  protected readonly mode = signal<NormalizeMode>('loudness');
  protected readonly targetLufs = signal(-14);
  protected readonly targetPeak = signal(-1);
  protected readonly ceiling = signal(-1);
  protected readonly format = signal<NormalizeFormat>('wav');
  protected readonly bitrate = signal<NormalizeBitrate>('192');

  // Execução
  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly result = signal<{
    blob: Blob;
    filename: string;
    ext: string;
    gainDb: number;
    reductionDb: number;
    peakDb: number;
    lufs: number | null;
  } | null>(null);
  /** O que `run()` leu. Compará-lo com o painel é o que decide se o botão volta. */
  protected readonly ranOptions = signal<NormalizeAudioOptions | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('wave');
  private readonly scrollerRef = viewChild<ElementRef<HTMLElement>>('scroller');

  private observer: ResizeObserver | null = null;
  private frame = 0;
  private colors: WaveColors | null = null;
  private _pinchDistance = 0;
  private _pinchZoom = 1;

  // ---------------------------------------------------------------- opções

  protected readonly modeOptions = computed<readonly SegmentOption<NormalizeMode>[]>(() => [
    { value: 'loudness', label: this.i18n.t()['normalize_audio.mode_loudness'] },
    { value: 'peak', label: this.i18n.t()['normalize_audio.mode_peak'] },
  ]);

  protected readonly formatOptions = computed<readonly SegmentOption<NormalizeFormat>[]>(() => [
    { value: 'wav', label: 'WAV' },
    { value: 'mp3', label: 'MP3' },
  ]);

  protected readonly loudnessPresets: readonly { value: number; labelKey: TranslationKey }[] = [
    { value: -23, labelKey: 'normalize_audio.preset_broadcast' },
    { value: -16, labelKey: 'normalize_audio.preset_podcast' },
    { value: -14, labelKey: 'normalize_audio.preset_streaming' },
    { value: -9, labelKey: 'normalize_audio.preset_loud' },
  ];

  protected readonly peakPresets: readonly number[] = [-0.1, -1, -3];
  protected readonly ceilingPresets: readonly number[] = [-0.1, -1, -2];
  protected readonly bitrateOptions: readonly NormalizeBitrate[] = ['128', '192', '320'];

  protected readonly target = computed(() =>
    this.mode() === 'peak' ? this.targetPeak() : this.targetLufs(),
  );

  /**
   * No modo pico o teto É o alvo, e não o que o seletor de teto diz.
   *
   * Com os dois independentes, pedir pico em -0,1 dBFS com o teto em -1 fazia o
   * limitador entrar para desfazer o ganho que acabara de ser calculado: o
   * arquivo saía em -1, o painel prometia -0,1, e o limitador aparecia como
   * atuante num modo em que ele não tem nada a fazer. O seletor de teto só é
   * mostrado no modo loudness pelo mesmo motivo.
   */
  protected readonly options = computed<NormalizeAudioOptions>(() => ({
    mode: this.mode(),
    target: this.target(),
    ceiling: this.mode() === 'peak' ? this.targetPeak() : this.ceiling(),
    format: this.format(),
    bitrate: this.bitrate(),
  }));

  // ---------------------------------------------------------------- leituras

  protected readonly duration = computed(() => this.audioBuffer()?.duration ?? 0);

  protected readonly sourceSize = computed(() => {
    const file = this.currentFile();
    return file ? formatBytes(file.size) : '';
  });

  protected readonly sourcePeakDb = computed(() => {
    const measured = this.measurement();
    return measured && measured.peak > 0 ? gainToDb(measured.peak) : null;
  });

  protected readonly sourceLufs = computed(() => this.measurement()?.lufs ?? null);

  /** O ganho que o painel promete, e o mesmo número que `run()` vai aplicar. */
  protected readonly gainDb = computed(() => {
    const measured = this.measurement();
    return measured ? this.normalizer.gainDbFor(measured, this.options()) : null;
  });

  protected readonly noisy = computed(() => (this.gainDb() ?? 0) > NOISY_GAIN_DB);

  /**
   * Loudness só existe a partir de um bloco de 400 ms e de algum conteúdo acima
   * da porta de -70 LUFS. Sem ele o modo pico ainda funciona, então a ferramenta
   * diz qual dos dois está indisponível em vez de sumir com o botão sem motivo.
   */
  protected readonly loudnessUnavailable = computed(
    () => !!this.measurement() && this.measurement()!.lufs === null,
  );

  protected readonly estimatedSize = computed(() => {
    const buffer = this.audioBuffer();
    return buffer ? formatBytes(this.normalizer.estimatedBytes(buffer, this.options())) : '';
  });

  /**
   * Um botão primário que só refaria os mesmos bytes lê como "não funcionou".
   * Ele volta assim que qualquer ajuste que `run()` lê muda — e o alvo entra
   * como `target()`, não como os dois signals, porque trocar o preset de pico
   * enquanto o modo é loudness não muda saída nenhuma.
   */
  protected readonly stale = computed(() => {
    const ran = this.ranOptions();
    if (!ran) return true;
    const now = this.options();
    return (
      ran.mode !== now.mode ||
      ran.target !== now.target ||
      ran.ceiling !== now.ceiling ||
      ran.format !== now.format ||
      (now.format === 'mp3' && ran.bitrate !== now.bitrate)
    );
  });

  protected readonly canRun = computed(() => this.gainDb() !== null);

  protected readonly primaryLabel = computed(() => {
    if (!this.canRun()) return null;
    if (this.result() && !this.stale()) return null;
    return this.i18n.t()['normalize_audio.btn'];
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

  // ---------------------------------------------------------------- ciclo de vida

  constructor() {
    effect((onCleanup) => {
      const el = this.scrollerRef()?.nativeElement;
      if (!el) return;

      const observer = new ResizeObserver((entries) => {
        const width = Math.round(entries[0].contentRect.width);
        if (width > 0) this.viewWidth.set(width);
      });
      observer.observe(el);
      this.observer = observer;
      onCleanup(() => { observer.disconnect(); this.observer = null; });
    });

    effect(() => {
      this.peaks(); this.viewWidth(); this.viewStart();
      this.zoomLevel(); this.playhead();
      this.draw();
    });

    hydrateFromWorkspace('normalize-audio', (file) => void this.openFile(file));
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

  // ---------------------------------------------------------------- carga

  /**
   * O upload. Só carrega na sessão — decodificar é do `openFile()`, que a
   * hidratação chama tanto para o arquivo que a pessoa soltou aqui quanto para o
   * que chegou pela cadeia ou voltou por um desfazer.
   *
   * A separação conserta um bug real: o caminho de hidratação chamava este mesmo
   * método, e ele chamava `load()` — que zera `history` e `past`. Ou seja, ir de
   * cortar para normalizar apagava o breadcrumb e o desfazer do módulo inteiro,
   * exatamente no momento em que a cadeia ia começar a valer alguma coisa.
   */
  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'normalize-audio');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async openFile(file: File | null): Promise<void> {
    this.stopPlayback();
    this.errorKey.set(null);
    this.result.set(null);
    this.pendingTransition.clear();
    this.ranOptions.set(null);
    this.measurement.set(null);
    this.phase.set('decoding');

    if (!file) {
      this.currentFile.set(null);
      this.audioBuffer.set(null);
      this.phase.set(null);
      return;
    }

    try {
      assertUsableAudio(file);
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      void ctx.close();

      if (buffer.duration > 3 * 3600) throw new AppError('audio_too_long');

      this.currentFile.set(file);
      this.audioBuffer.set(buffer);
      this.zoomLevel.set(1);
      this.viewStart.set(0);

      // A medição é uma passada inteira pelo arquivo e é síncrona. Sem o quadro
      // de folga aqui, a mensagem "medindo" só apareceria depois de terminada.
      this.phase.set('measuring');
      await new Promise((resolve) => setTimeout(resolve, 0));
      this.measurement.set(this.normalizer.measure(buffer));
    } catch (err) {
      console.error('[NormalizeAudio] onFile error:', err);
      this.currentFile.set(null);
      this.audioBuffer.set(null);
      this.measurement.set(null);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.phase.set(null);
    }
  }

  protected reset(): void {
    this.stopPlayback();
    this.currentFile.set(null);
    this.audioBuffer.set(null);
    this.measurement.set(null);
    this.result.set(null);
    this.ranOptions.set(null);
    this.errorKey.set(null);
    this.zoomLevel.set(1);
    this.viewStart.set(0);
    this.pendingTransition.clear();
    this.workspace.clear();
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
    const value = parseInt(input.value, 10);
    if (!Number.isNaN(value)) this.setZoom(value / 100);
    input.value = String(this.zoomPercent());
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
    this._pinchDistance = touchDist(event);
    this._pinchZoom = this.zoomLevel();
  }

  protected onTouchMove(event: TouchEvent): void {
    if (event.touches.length !== 2 || this._pinchDistance <= 0) return;
    if (event.cancelable) event.preventDefault();
    this.setZoom((this._pinchZoom * touchDist(event)) / this._pinchDistance);
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (event.touches.length < 2) this._pinchDistance = 0;
  }

  // ---------------------------------------------------------------- reprodução

  protected onCanvasClick(event: PointerEvent): void {
    const el = this.canvasRef()?.nativeElement;
    if (!el || this.viewWidth() <= 0 || this.duration() <= 0) return;
    const time = this.xToTime(event.clientX - el.getBoundingClientRect().left);
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
    // Mesma guarda do `ngOnDestroy`, por um caminho novo: a hidratação chama
    // `openFile(null)` na construção da ferramenta, e ele passa por aqui antes de
    // qualquer quadro ter sido agendado. No prerender isso roda no Node, onde
    // `cancelAnimationFrame` não existe — sem o `if`, abrir qualquer rota de áudio
    // matava o worker e derrubava as rotas que ainda estavam na fila dele.
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.engine.stop();
    this.playing.set(false);
    this.playhead.set(null);
  }

  // ---------------------------------------------------------------- execução

  protected async run(): Promise<void> {
    const buffer = this.audioBuffer();
    const file = this.currentFile();
    const measured = this.measurement();
    if (!buffer || !file || !measured || this.busy() || !this.canRun()) return;

    this.stopPlayback();
    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    const options = this.options();

    try {
      const outcome = await this.normalizer.normalize(buffer, measured, options, (pct) =>
        this.progress.set(pct),
      );

      this.result.set({
        blob: outcome.blob,
        filename: suffixedName(file.name, this.tool.suffix, outcome.ext),
        ext: outcome.ext,
        gainDb: outcome.gainDb,
        reductionDb: outcome.reductionDb,
        peakDb: outcome.peakDb,
        lufs: outcome.lufs,
      });
      this.ranOptions.set(options);

      // Registrado, não aplicado: ver compress-audio.
      this.pendingTransition.registerResult('normalize-audio', outcome.blob, this.tool.suffix, outcome.ext);
    } catch (err) {
      console.error('[NormalizeAudio] run error:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const current = this.result();
    if (current) saveBlob(current.blob, current.filename);
  }

  // ---------------------------------------------------------------- formatação

  protected clock(seconds: number): string { return formatClock(seconds); }
  protected timecode(seconds: number): string { return formatTimecode(seconds); }

  /** `-14.2` com sinal explícito quando é um delta, que é como um ganho se lê. */
  protected decibels(value: number | null, signed = false): string {
    if (value === null || !Number.isFinite(value)) return '—';
    const text = value.toFixed(1);
    return signed && value > 0 ? `+${text}` : text;
  }

  // ---------------------------------------------------------------- pintura

  private timeToX(seconds: number): number {
    const length = this.viewLength();
    return length > 0 ? ((seconds - this.viewStart()) / length) * this.viewWidth() : 0;
  }

  private xToTime(x: number): number {
    return clamp(this.viewStart() + (x / this.viewWidth()) * this.viewLength(), 0, this.duration());
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
    this.drawCeiling(ctx, width, colors);
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

    /**
     * A onda é desenhada duas vezes: em claro, o que o arquivo VAI virar depois
     * do ganho, e por cima, sólido, o que ele é hoje. É a única leitura da tela
     * que responde "quanto isto vai subir" sem ler número nenhum — e o teto
     * desenhado em seguida mostra na mesma escala o que não vai passar dele.
     */
    const gain = this.gainDb();
    const preview = gain !== null && gain > 0 ? Math.pow(10, gain / 20) : 0;

    for (let column = 0; column < columns; column++) {
      const from = Math.floor(bucketFrom + column * perColumn);
      const to = Math.max(from + 1, Math.floor(bucketFrom + (column + 1) * perColumn));

      let lo = 0;
      let hi = 0;
      for (let i = Math.max(0, from); i < to && i < total; i++) {
        if (peaks.min[i] < lo) lo = peaks.min[i];
        if (peaks.max[i] > hi) hi = peaks.max[i];
      }

      if (preview > 0) {
        ctx.fillStyle = colors.idle;
        const previewTop = mid - clampUnit(hi * preview) * scale;
        const previewBottom = mid - clampUnit(lo * preview) * scale;
        ctx.fillRect(column, previewTop, 1, Math.max(1, previewBottom - previewTop));
      }

      ctx.fillStyle = colors.keep;
      const top2 = mid - hi * scale;
      const bottom = mid - lo * scale;
      ctx.fillRect(column, top2, 1, Math.max(1, bottom - top2));
    }
  }

  private drawCeiling(ctx: CanvasRenderingContext2D, width: number, colors: WaveColors): void {
    const height = CANVAS_HEIGHT - RULER_HEIGHT;
    const mid = RULER_HEIGHT + height / 2;
    const scale = (height / 2) * 0.9;
    const level = Math.pow(10, this.options().ceiling / 20) * scale;

    ctx.save();
    ctx.strokeStyle = colors.drop;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    for (const y of [mid - level, mid + level]) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
      ctx.stroke();
    }
    ctx.restore();
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
    const token = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback;
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

function clampUnit(value: number): number {
  return value > 1 ? 1 : value < -1 ? -1 : value;
}

function touchDist(event: TouchEvent): number {
  const [a, b] = [event.touches[0], event.touches[1]];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
