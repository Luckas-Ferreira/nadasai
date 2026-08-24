import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { assertUsableAudio, formatClock } from '../../core/audio/audio-file.util';
import { MAX_SPEED, MIN_SPEED, clampSpeed, durationAfter } from '../../core/audio/speed';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { AudioConverterService } from '../convert-audio/services/audio-converter.service';
import { AudioSpeedService, type SpeedOutputFormat } from './services/audio-speed.service';

/** Os degraus que as pessoas usam, mais o campo livre para o resto. */
const PRESETS = [0.5, 0.75, 1.25, 1.5, 2] as const;

type PitchMode = 'follow' | 'hold';

@Component({
  selector: 'app-audio-speed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    SegmentedComponent,
  ],
  templateUrl: './audio-speed.component.html',
})
export class AudioSpeedComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly converter = inject(AudioConverterService);
  private readonly speedService = inject(AudioSpeedService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('audio-speed');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly buffer = signal<AudioBuffer | null>(null);
  protected readonly reading = signal(false);

  protected readonly speed = signal(1.5);
  protected readonly pitchMode = signal<PitchMode>('hold');
  protected readonly format = signal<SpeedOutputFormat>('wav');

  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly resultExt = signal('wav');
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly min = MIN_SPEED;
  protected readonly max = MAX_SPEED;
  protected readonly presets = PRESETS;

  protected readonly pitchOptions = computed<SegmentOption<PitchMode>[]>(() => [
    { value: 'hold', label: this.i18n.t()['speedaudio.pitch_hold'] },
    { value: 'follow', label: this.i18n.t()['speedaudio.pitch_follow'] },
  ]);

  protected readonly formatOptions = computed<SegmentOption<SpeedOutputFormat>[]>(() => [
    { value: 'wav', label: 'WAV' },
    { value: 'mp3', label: 'MP3' },
  ]);

  protected readonly pitchHint = computed(() =>
    this.pitchMode() === 'hold'
      ? this.i18n.t()['speedaudio.pitch_hint_hold']
      : this.i18n.t()['speedaudio.pitch_hint_follow'],
  );

  protected readonly sourceDuration = computed(() => this.buffer()?.duration ?? 0);
  protected readonly sourceClock = computed(() => formatClock(this.sourceDuration()));

  protected readonly newDuration = computed(() =>
    durationAfter(this.sourceDuration(), this.speed()),
  );
  protected readonly newClock = computed(() => formatClock(this.newDuration()));

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  /**
   * O modo do painel É o multiplicador de tom, e não um segundo caminho.
   *
   * "Acompanha" é `pitchRatio = speed`, que faz o esticamento virar identidade
   * e sobrar só a reamostragem — o caminho barato. "Mantido" é `1`, e sobra só
   * o esticamento. A composição em `core/audio/speed.ts` cobre os dois.
   */
  private readonly pitchRatio = computed(() => (this.pitchMode() === 'follow' ? this.speed() : 1));

  /** Velocidade 1 com o tom acompanhando não muda nada: não há o que aplicar. */
  protected readonly noop = computed(() => Math.abs(this.speed() - 1) < 0.001);

  protected readonly canRun = computed(
    () => !!this.buffer() && !this.noop() && !this.busy() && !this.reading(),
  );

  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() =>
    [this.speed().toFixed(3), this.pitchMode(), this.format()].join('|'),
  );

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    hydrateFromWorkspace('audio-speed', (file) => void this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'audio-speed');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async load(file: File | null): Promise<void> {
    this.clearResult();

    if (!file) {
      this.file.set(null);
      this.buffer.set(null);
      return;
    }

    this.reading.set(true);

    try {
      assertUsableAudio(file);
      const { buffer } = await this.converter.decodeAudio(file);
      this.buffer.set(buffer);
      this.file.set(file);
    } catch (err) {
      console.error('[AudioSpeed] decode failed:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
      this.buffer.set(null);
    } finally {
      this.reading.set(false);
    }
  }

  protected setSpeed(value: number): void {
    this.speed.set(clampSpeed(Number.isFinite(value) ? value : 1));
    this.clearResult();
  }

  protected setPitchMode(mode: PitchMode): void {
    this.pitchMode.set(mode);
    this.clearResult();
  }

  protected setFormat(value: SpeedOutputFormat): void {
    this.format.set(value);
    this.clearResult();
  }

  protected async run(): Promise<void> {
    const buffer = this.buffer();
    if (!buffer || !this.canRun()) return;

    this.busy.set(true);
    this.progress.set(0);
    this.errorKey.set(null);

    try {
      const settings = this.settings();

      const result = await this.speedService.apply({
        buffer,
        speed: this.speed(),
        pitchRatio: this.pitchRatio(),
        format: this.format(),
        bitrate: 192,
        onProgress: (percent) => this.progress.set(percent),
      });

      this.resultBlob.set(result.blob);
      this.resultExt.set(result.ext);
      this.resultUrl.set(this.urls.replace(this.resultUrl(), result.blob));
      this.ranSettings.set(settings);
      this.pendingTransition.registerResult('audio-speed', result.blob, this.tool.suffix, result.ext);
    } catch (err) {
      console.error('[AudioSpeed] apply failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.workspace.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, this.resultExt()));
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.file.set(null);
    this.buffer.set(null);
    this.resultUrl.set(null);
    this.clearResult();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private clearResult(): void {
    this.resultBlob.set(null);
    this.ranSettings.set(null);
    this.pendingTransition.clear();
  }
}
