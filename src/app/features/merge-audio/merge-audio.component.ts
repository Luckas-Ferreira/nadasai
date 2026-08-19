import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { AudioEngine, type PlayClip } from '../../core/audio/audio-engine';
import {
  ACCEPT_AUDIO_ATTR,
  MAX_AUDIO_SECONDS,
  assertUsableAudio,
  formatClock,
  formatTimecode,
} from '../../core/audio/audio-file.util';
import { computePeaks, renderPeaksToCanvas } from '../../core/audio/waveform';
import { wavByteLength } from '../../core/audio/wav';
import { AppError, toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { canvasToBlob, formatBytes } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PageGridComponent, type PageItem } from '../../shared/ui/page-grid.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { AudioMergerService, type MergeResult } from './services/audio-merger.service';

/** Thumbnail size, in device pixels. The grid renders it at whatever width it has. */
const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 180;

/** Buckets for a thumbnail. It is ~320px wide; more detail than this is invisible. */
const THUMB_BUCKETS = 640;

/**
 * More than this and the merged buffer stops fitting in memory, for the same
 * reason MAX_AUDIO_SECONDS exists in the cutter: everything here is 32-bit float
 * PCM, and the merge holds every source buffer AND the result at once.
 */
const MAX_TRACKS = 24;

/** How consecutive tracks meet. */
export type JoinMode = 'butt' | 'crossfade' | 'gap';

interface Track {
  readonly id: string;
  readonly name: string;
  readonly buffer: AudioBuffer;
  readonly url: string;
}

@Component({
  selector: 'app-merge-audio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PageGridComponent,
    PanelComponent,
    AlertComponent,
    IconComponent,
    SegmentedComponent,
    ActionBarComponent,
    ButtonDirective,
  ],
  templateUrl: './merge-audio.component.html',
})
export class MergeAudioComponent implements OnDestroy {
  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('merge-audio');
  private readonly pendingTransition = inject(PendingTransitionService);
  private readonly merger = inject(AudioMergerService);
  private readonly urls = inject(ObjectUrlScope);

  /** Owned, not injected — see the class comment on AudioEngine. */
  private readonly engine = new AudioEngine();

  protected readonly acceptAttr = ACCEPT_AUDIO_ATTR;
  protected readonly maxTracks = MAX_TRACKS;

  protected readonly tracks = signal<Track[]>([]);
  protected readonly reading = signal(false);

  protected readonly joinMode = signal<JoinMode>('butt');
  protected readonly crossfade = signal(1);
  protected readonly gap = signal(1);
  protected readonly fadeIn = signal(0);
  protected readonly fadeOut = signal(0);

  protected readonly playing = signal(false);

  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly result = signal<MergeResult | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  private readonly ranSignature = signal<string | null>(null);
  private nextId = 0;

  /**
   * The strip only needs a label and a picture, which is exactly what
   * `app-page-grid` consumes — so a track becomes a "page" with a waveform for a
   * thumbnail and the whole drag-to-reorder, arrow-button, page-sheet treatment
   * comes along for free.
   */
  protected readonly items = computed<PageItem[]>(() =>
    this.tracks().map((track) => ({
      id: track.id,
      label: `${track.name} · ${formatClock(track.buffer.duration)}`,
      url: track.url,
    })),
  );

  protected readonly full = computed(() => this.tracks().length >= MAX_TRACKS);
  protected readonly canRun = computed(() => this.tracks().length >= 2);

  /** Seconds the two tracks either overlap by (negative) or are spaced by. */
  private readonly spacing = computed(() => {
    if (this.joinMode() === 'crossfade') return -this.effectiveCrossfade();
    if (this.joinMode() === 'gap') return Math.max(0, this.gap());
    return 0;
  });

  /**
   * Clamped the same way the service clamps it, so the readout never promises a
   * transition longer than the shortest track can give.
   */
  protected readonly effectiveCrossfade = computed(() => {
    const tracks = this.tracks();
    if (tracks.length < 2) return 0;
    const shortest = Math.min(...tracks.map((track) => track.buffer.duration));
    return Math.max(0, Math.min(this.crossfade(), shortest / 2));
  });

  protected readonly totalDuration = computed(() => {
    const tracks = this.tracks();
    if (!tracks.length) return 0;

    const sum = tracks.reduce((total, track) => total + track.buffer.duration, 0);
    return Math.max(0, sum + this.spacing() * (tracks.length - 1));
  });

  protected readonly estimatedSize = computed(() => {
    const tracks = this.tracks();
    if (!tracks.length) return null;

    const rate = tracks[0].buffer.sampleRate;
    const channels = Math.max(...tracks.map((track) => track.buffer.numberOfChannels));
    return formatBytes(wavByteLength(Math.round(this.totalDuration() * rate), channels));
  });

  protected readonly joinOptions = computed<SegmentOption<JoinMode>[]>(() => [
    { value: 'butt', label: this.i18n.t()['mergeaudio.join_butt'] },
    { value: 'crossfade', label: this.i18n.t()['mergeaudio.join_crossfade'] },
    { value: 'gap', label: this.i18n.t()['mergeaudio.join_gap'] },
  ]);

  private readonly signature = computed(
    () =>
      `${this.tracks().map((track) => track.id).join(',')}|${this.joinMode()}|` +
      `${this.crossfade().toFixed(2)}|${this.gap().toFixed(2)}|` +
      `${this.fadeIn().toFixed(2)}|${this.fadeOut().toFixed(2)}`,
  );

  protected readonly stale = computed(() => this.signature() !== this.ranSignature());

  ngOnDestroy(): void {
    this.engine.close();
  }

  // ---------------------------------------------------------------- loading

  protected async addFiles(files: File[]): Promise<void> {
    this.stopPlayback();
    this.errorKey.set(null);
    this.result.set(null);
    this.reading.set(true);
    this.progress.set(0);

    const room = MAX_TRACKS - this.tracks().length;
    const accepted = files.slice(0, Math.max(0, room));

    try {
      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        assertUsableAudio(file);

        const buffer = await this.engine.decode(file);
        if (buffer.duration > MAX_AUDIO_SECONDS) throw new AppError('audio_too_long');

        const track = await this.toTrack(file, buffer);
        this.tracks.update((tracks) => [...tracks, track]);
        this.progress.set(Math.round(((i + 1) / accepted.length) * 100));
      }
    } catch (err) {
      console.error('[MergeAudio] could not open an audio file:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.reading.set(false);
      this.progress.set(null);
    }
  }

  private async toTrack(file: File, buffer: AudioBuffer): Promise<Track> {
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));

    const style = getComputedStyle(document.documentElement);
    const canvas = renderPeaksToCanvas(computePeaks(channels, THUMB_BUCKETS), {
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      color: style.getPropertyValue('--color-wave-keep').trim() || '#1d4ed8',
      background: '#ffffff',
    });

    // Through ObjectUrlScope, never a raw createObjectURL: the scope revokes on
    // route leave, which is the whole reason it is provided on the component.
    const url = this.urls.create(await canvasToBlob(canvas, 'image/png'));

    return { id: `t${this.nextId++}`, name: file.name, buffer, url };
  }

  // ---------------------------------------------------------------- ordering

  protected reorder(move: { from: number; to: number }): void {
    this.stopPlayback();
    this.tracks.update((tracks) => {
      const next = [...tracks];
      const [moved] = next.splice(move.from, 1);
      next.splice(move.to, 0, moved);
      return next;
    });
  }

  protected removeAt(index: number): void {
    this.stopPlayback();
    this.tracks.update((tracks) => tracks.filter((_, i) => i !== index));
    if (this.tracks().length < 2) this.result.set(null);
  }

  // ---------------------------------------------------------------- settings

  protected setJoinMode(mode: JoinMode): void {
    this.stopPlayback();
    this.joinMode.set(mode);
  }

  protected commitSeconds(input: HTMLInputElement, target: 'crossfade' | 'gap' | 'in' | 'out'): void {
    const value = Number(input.value.replace(',', '.'));
    const next = Number.isFinite(value) ? Math.max(0, Math.min(30, value)) : 0;

    this.stopPlayback();
    if (target === 'crossfade') this.crossfade.set(next);
    else if (target === 'gap') this.gap.set(next);
    else if (target === 'in') this.fadeIn.set(next);
    else this.fadeOut.set(next);

    input.value = next.toFixed(1);
  }

  // ---------------------------------------------------------------- playback

  /**
   * Previews the join without building the merged buffer.
   *
   * The alternative — render the result and play that — would hold a second full
   * copy of every track in memory just to hear a transition. Scheduling the
   * clips back to back with the same crossfade the exporter uses costs nothing
   * and, because both paths use equal-power curves, sounds like the file will.
   */
  protected async togglePlay(): Promise<void> {
    if (this.playing()) {
      this.stopPlayback();
      return;
    }

    const tracks = this.tracks();
    if (tracks.length < 2) return;

    const clips: PlayClip[] = tracks.map((track) => ({
      buffer: track.buffer,
      from: 0,
      to: track.buffer.duration,
    }));

    await this.engine.playClips(
      {
        clips,
        fadeIn: this.fadeIn(),
        fadeOut: this.fadeOut(),
        crossfade: this.joinMode() === 'crossfade' ? this.crossfade() : 0,
      },
      () => this.stopPlayback(),
    );

    this.playing.set(true);
  }

  private stopPlayback(): void {
    this.engine.stop();
    this.playing.set(false);
  }

  // -------------------------------------------------------------------- run

  protected async run(): Promise<void> {
    const tracks = this.tracks();
    if (tracks.length < 2 || this.busy()) return;

    this.stopPlayback();
    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const res = await this.merger.merge({
        tracks: tracks.map((track) => ({ buffer: track.buffer, name: track.name })),
        crossfade: this.joinMode() === 'crossfade' ? this.crossfade() : 0,
        gap: this.joinMode() === 'gap' ? this.gap() : 0,
        fadeIn: this.fadeIn(),
        fadeOut: this.fadeOut(),
        onProgress: (percent) => this.progress.set(percent),
      });

      this.result.set(res);
      // Mesma regra do merge-pdf: a lista de faixas é local, o resultado é da
      // cadeia — daqui ele segue para normalizar ou comprimir direto.
      this.pendingTransition.registerResult('merge-audio', res.blob, this.tool.suffix, 'wav');
      this.ranSignature.set(this.signature());
    } catch (err) {
      console.error('[MergeAudio] merge failed:', err);
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

  protected reset(): void {
    this.pendingTransition.clear();
    this.stopPlayback();
    this.urls.releaseAll();
    this.tracks.set([]);
    this.result.set(null);
    this.errorKey.set(null);
    this.ranSignature.set(null);
    this.joinMode.set('butt');
    this.crossfade.set(1);
    this.gap.set(1);
    this.fadeIn.set(0);
    this.fadeOut.set(0);
  }

  // ------------------------------------------------------------ formatting

  protected timecode(seconds: number): string {
    return formatTimecode(seconds);
  }

  protected clock(seconds: number): string {
    return formatClock(seconds);
  }
}
