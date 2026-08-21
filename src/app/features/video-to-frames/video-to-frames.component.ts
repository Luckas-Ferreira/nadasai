import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { toMessageKey } from '../../core/errors';
import type { FileKind } from '../../core/files/kind';
import { saveBlob } from '../../core/image/download';
import { formatBytes } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ACCEPT_VIDEO_ATTR } from '../../core/video/video-file.util';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  FRAME_FORMATS,
  FRAME_INTERVALS,
  FrameExtractorService,
  MAX_FRAMES,
  frameCountFor,
  type FrameFormat,
  type FrameInterval,
  type FrameOutput,
} from './services/frame-extractor.service';

type Mode = 'single' | 'interval';

/** Larguras oferecidas, mais "original". Acima disso o zip fica impraticável. */
const WIDTHS = [640, 1280, 1920] as const;

interface RunSettings {
  readonly mode: Mode;
  readonly atSec: number;
  readonly intervalSec: FrameInterval;
  readonly format: FrameFormat;
  readonly width: number;
}

@Component({
  selector: 'app-video-to-frames',
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
  templateUrl: './video-to-frames.component.html',
})
export class VideoToFramesComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  private readonly extractor = inject(FrameExtractorService);
  private readonly urls = inject(ObjectUrlScope);

  protected readonly tool = toolById('video-to-frames');
  protected readonly acceptAttr = ACCEPT_VIDEO_ATTR;
  protected readonly maxFrames = MAX_FRAMES;

  /**
   * O player é o controle de tempo.
   *
   * O instante do quadro único sai de `currentTime` do vídeo que está na tela,
   * e não de um campo numérico: ninguém sabe dizer em que segundo está o quadro
   * que quer, mas todo mundo sabe parar o vídeo nele. A extração usa um segundo
   * elemento, dentro de `core/video/frames.ts`, então parar aqui não interfere.
   */
  private readonly player = viewChild<ElementRef<HTMLVideoElement>>('player');

  protected readonly videoUrl = signal<string | null>(null);
  protected readonly duration = signal(0);
  protected readonly sourceWidth = signal(0);

  protected readonly mode = signal<Mode>('single');
  protected readonly atSec = signal(0);
  protected readonly intervalSec = signal<FrameInterval>(1);
  protected readonly format = signal<FrameFormat>('png');
  /** 0 = a largura do próprio vídeo. */
  protected readonly width = signal(0);

  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly result = signal<FrameOutput | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  private readonly ranSettings = signal<RunSettings | null>(null);

  protected readonly modeOptions = computed<SegmentOption<Mode>[]>(() => [
    { value: 'single', label: this.i18n.t()['video_frames.mode_single'] },
    { value: 'interval', label: this.i18n.t()['video_frames.mode_interval'] },
  ]);

  protected readonly intervalOptions = computed<SegmentOption<FrameInterval>[]>(() =>
    FRAME_INTERVALS.map((value) => ({ value, label: `${value}s` })),
  );

  protected readonly formatOptions = computed<SegmentOption<FrameFormat>[]>(() =>
    FRAME_FORMATS.map((value) => ({ value, label: value === 'jpeg' ? 'JPG' : value.toUpperCase() })),
  );

  protected readonly widthOptions = computed<SegmentOption<number>[]>(() => [
    { value: 0, label: this.i18n.t()['video_frames.size_original'] },
    ...WIDTHS.filter((w) => this.sourceWidth() === 0 || w < this.sourceWidth()).map((value) => ({
      value: value as number,
      label: `${value}px`,
    })),
  ]);

  protected readonly count = computed(() =>
    frameCountFor(this.duration(), { mode: this.mode(), intervalSec: this.intervalSec() }),
  );

  protected readonly tooMany = computed(() => this.count() > MAX_FRAMES);

  protected readonly resultSize = computed(() => {
    const output = this.result();
    return output ? formatBytes(output.blob.size) : null;
  });

  /** Um zip não é uma imagem, e a barra de ações precisa saber disso. */
  protected readonly resultKind = computed<FileKind | null>(() => {
    const output = this.result();
    if (!output) return null;
    return output.isZip ? 'zip' : 'image';
  });

  protected readonly stale = computed(() => {
    if (!this.videoUrl() || this.busy() || this.tooMany()) return false;

    const ran = this.ranSettings();
    if (!ran) return true;

    return (
      ran.mode !== this.mode() ||
      ran.atSec !== this.atSec() ||
      ran.intervalSec !== this.intervalSec() ||
      ran.format !== this.format() ||
      ran.width !== this.width()
    );
  });

  constructor() {
    hydrateFromWorkspace('video-to-frames', (file) => {
      if (!file) {
        this.clearAll();
        return;
      }
      void this.openFile(file);
    });

    // O instante seguido pelo player só importa no modo de quadro único; no
    // outro ele não entra na conta, e deixá-lo mudando marcaria o resultado como
    // desatualizado a cada toque no vídeo.
    effect(() => {
      if (this.mode() !== 'single') return;
      const element = this.player()?.nativeElement;
      if (element) element.currentTime = Math.min(this.atSec(), Math.max(0, this.duration() - 0.05));
    });
  }

  private clearAll(): void {
    this.videoUrl.set(null);
    this.duration.set(0);
    this.sourceWidth.set(0);
    this.atSec.set(0);
    this.clearResult();
  }

  private clearResult(): void {
    this.result.set(null);
    this.resultUrl.set(null);
    this.ranSettings.set(null);
    this.progress.set(0);
  }

  private async openFile(file: File): Promise<void> {
    this.errorKey.set(null);
    this.clearResult();

    try {
      const probe = await this.extractor.inspect(file);

      this.duration.set(probe.duration);
      this.sourceWidth.set(probe.width);
      this.atSec.set(0);
      this.width.set(0);

      this.videoUrl.set(this.urls.replace(this.videoUrl(), file));
    } catch (err) {
      console.error('[VideoToFrames] could not read the video:', err);
      this.errorKey.set(toMessageKey(err));
      this.clearAll();
    }
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'video-to-frames');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  /** O player mandou o tempo mudar: é ele quem escolhe o quadro. */
  protected onTimeUpdate(): void {
    const element = this.player()?.nativeElement;
    if (!element || this.mode() !== 'single') return;

    const at = Math.round(element.currentTime * 100) / 100;
    if (at !== this.atSec()) this.atSec.set(at);
  }

  protected clock(seconds: number): string {
    const total = Math.max(0, seconds);
    const minutes = Math.floor(total / 60);
    const rest = total - minutes * 60;
    return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
  }

  protected async run(): Promise<void> {
    const file = this.workspace.fileFor('video-to-frames');
    if (!file || this.busy() || this.tooMany()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    const settings: RunSettings = {
      mode: this.mode(),
      atSec: this.atSec(),
      intervalSec: this.intervalSec(),
      format: this.format(),
      width: this.width(),
    };

    const base = (this.workspace.session()?.originalName ?? 'video').replace(/\.[^.]+$/, '');

    try {
      const output = await this.extractor.extract(
        file,
        { ...settings, quality: 0.92 },
        base,
        (percent) => this.progress.set(percent),
      );

      this.result.set(output);
      this.ranSettings.set(settings);

      // Só a imagem única vira prévia: um zip não tem o que mostrar, e um
      // object URL para ele só seria memória presa até a navegação.
      this.resultUrl.set(output.isZip ? null : this.urls.replace(this.resultUrl(), output.blob));

      const ext = output.filename.split('.').pop() ?? 'png';
      this.pendingTransition.registerResult('video-to-frames', output.blob, this.tool.suffix, ext);
    } catch (err) {
      console.error('[VideoToFrames] extraction failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const output = this.result();
    if (!output) return;
    saveBlob(output.blob, output.filename);
  }
}
