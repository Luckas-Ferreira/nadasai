import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { formatClock } from '../../core/audio/audio-file.util';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { reencodeVideo } from '../../core/video/reencode';
import { availableRecorderFormats, type RecordingFormat } from '../../core/video/screen-recorder';
import { assertUsableVideo, probeVideo } from '../../core/video/video-file.util';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

@Component({
  selector: 'app-trim-video',
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
    ButtonDirective,
  ],
  templateUrl: './trim-video.component.html',
})
export class TrimVideoComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('trim-video');
  protected readonly i18n = inject(TranslationService);

  private readonly playerRef = viewChild<ElementRef<HTMLVideoElement>>('player');

  protected readonly file = signal<File | null>(null);
  protected readonly videoUrl = signal<string | null>(null);
  protected readonly duration = signal(0);

  protected readonly start = signal(0);
  protected readonly end = signal(0);
  protected readonly playhead = signal(0);

  protected readonly format = signal<RecordingFormat>('webm');
  protected readonly formats = signal<readonly { format: RecordingFormat; ext: string }[]>([]);

  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly secondsLeft = signal(0);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultExt = signal('webm');
  protected readonly errorKey = signal<TranslationKey | null>(null);

  private abort: AbortController | null = null;

  protected readonly formatOptions = computed<SegmentOption<RecordingFormat>[]>(() =>
    this.formats().map((f) => ({ value: f.format, label: f.format.toUpperCase() })),
  );

  protected readonly onlyOneFormat = computed(() => this.formats().length === 1);

  protected readonly selected = computed(() => Math.max(0, this.end() - this.start()));

  protected readonly startClock = computed(() => formatClock(this.start()));
  protected readonly endClock = computed(() => formatClock(this.end()));
  protected readonly selectedClock = computed(() => formatClock(this.selected()));
  protected readonly durationClock = computed(() => formatClock(this.duration()));

  /** Onde a faixa selecionada começa e termina, em % — é a barra da tela. */
  protected readonly startPercent = computed(() =>
    this.duration() > 0 ? (this.start() / this.duration()) * 100 : 0,
  );
  protected readonly widthPercent = computed(() =>
    this.duration() > 0 ? (this.selected() / this.duration()) * 100 : 0,
  );
  protected readonly playheadPercent = computed(() =>
    this.duration() > 0 ? (this.playhead() / this.duration()) * 100 : 0,
  );

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  /** Nada selecionado, ou o vídeo inteiro: nos dois casos não há corte a fazer. */
  protected readonly wholeVideo = computed(
    () => this.duration() > 0 && this.start() <= 0.01 && this.end() >= this.duration() - 0.01,
  );

  // `!wholeVideo()` faz parte da condição, e não só do aviso: a faixa diz que a
  // página espera você marcar alguma coisa, e um botão ativo ao lado dessa frase
  // recodificaria o arquivo inteiro por nada.
  protected readonly canRun = computed(
    () =>
      !!this.file() &&
      this.selected() > 0.05 &&
      !this.wholeVideo() &&
      !this.busy() &&
      this.formats().length > 0,
  );

  /** A espera é a duração do TRECHO, não a do arquivo — é o ganho do corte. */
  protected readonly estimate = computed(() => Math.ceil(this.selected()));

  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() =>
    [this.start().toFixed(2), this.end().toFixed(2), this.format()].join('|'),
  );

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    // Lido no construtor e atrás da guarda de plataforma: `MediaRecorder` não
    // existe no Node do prerender, e uma chamada em escopo de módulo derruba a
    // rota antes de existir componente.
    if (typeof MediaRecorder !== 'undefined') {
      const found = availableRecorderFormats().map((f) => ({ format: f.format, ext: f.ext }));
      this.formats.set(found);
      if (found[0]) this.format.set(found[0].format);
    }

    hydrateFromWorkspace('trim-video', (file) => void this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'trim-video');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async load(file: File | null): Promise<void> {
    this.clearResult();

    if (!file) {
      this.file.set(null);
      this.urls.revoke(this.videoUrl());
      this.videoUrl.set(null);
      this.duration.set(0);
      this.start.set(0);
      this.end.set(0);
      return;
    }

    try {
      assertUsableVideo(file);
      const probe = await probeVideo(file);

      this.file.set(file);
      this.duration.set(probe.duration);
      this.start.set(0);
      this.end.set(probe.duration);
      this.playhead.set(0);
      this.videoUrl.set(this.urls.replace(this.videoUrl(), file));
    } catch (err) {
      console.error('[TrimVideo] could not read the video:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
    }
  }

  protected onTimeUpdate(): void {
    const player = this.playerRef()?.nativeElement;
    if (player) this.playhead.set(player.currentTime);
  }

  /**
   * O PLAYER é o controle de tempo — a mesma decisão que o extrair-quadros
   * registra: ninguém sabe dizer em que segundo quer cortar, mas todo mundo
   * sabe parar o vídeo ali. Os campos numéricos existem para ajuste fino
   * depois de marcar.
   */
  protected markStart(): void {
    const at = this.playhead();
    this.setStart(Math.min(at, this.end() - 0.1));
  }

  protected markEnd(): void {
    const at = this.playhead();
    this.setEnd(Math.max(at, this.start() + 0.1));
  }

  protected setStart(value: number): void {
    const next = Math.min(Math.max(0, value), Math.max(0, this.end() - 0.05));
    this.start.set(next);
    this.clearResult();
  }

  protected setEnd(value: number): void {
    const next = Math.max(Math.min(this.duration(), value), this.start() + 0.05);
    this.end.set(next);
    this.clearResult();
  }

  /** Leva o player até uma das marcas, para conferir o corte antes de aplicar. */
  protected seekTo(seconds: number): void {
    const player = this.playerRef()?.nativeElement;
    if (!player) return;
    player.currentTime = seconds;
    this.playhead.set(seconds);
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file || !this.canRun()) return;

    // O player não pode estar tocando: a recodificação abre o MESMO arquivo num
    // segundo elemento, e dois decodificadores no mesmo blob competem por CPU
    // sem necessidade nenhuma.
    this.playerRef()?.nativeElement.pause();

    this.busy.set(true);
    this.progress.set(0);
    this.secondsLeft.set(this.estimate());
    this.errorKey.set(null);
    this.abort = new AbortController();

    try {
      const settings = this.settings();

      const result = await reencodeVideo({
        file,
        range: { start: this.start(), end: this.end() },
        format: this.format(),
        signal: this.abort.signal,
        onProgress: (percent, left) => {
          this.progress.set(percent);
          this.secondsLeft.set(Math.ceil(left));
        },
      });

      this.resultBlob.set(result.blob);
      this.resultExt.set(result.ext);
      this.ranSettings.set(settings);
      this.pendingTransition.registerResult('trim-video', result.blob, this.tool.suffix, result.ext);
    } catch (err) {
      console.error('[TrimVideo] trim failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.abort = null;
    }
  }

  protected cancel(): void {
    this.abort?.abort();
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.workspace.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, this.resultExt()));
  }

  protected reset(): void {
    this.abort?.abort();
    this.urls.releaseAll();
    this.file.set(null);
    this.videoUrl.set(null);
    this.duration.set(0);
    this.start.set(0);
    this.end.set(0);
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
