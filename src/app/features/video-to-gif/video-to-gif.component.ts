import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ACCEPT_VIDEO_ATTR } from '../../core/video/video-file.util';
import { frameGridFor } from '../../core/video/frames';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  GIF_COLORS,
  GIF_FPS,
  GIF_WIDTHS,
  GifMakerService,
  MAX_GIF_SECONDS,
  type GifColors,
  type GifFps,
  type GifOutput,
  type GifWidth,
} from './services/gif-maker.service';

/** Um GIF de dez segundos já é longo; o padrão não deveria ser o teto. */
const DEFAULT_SPAN_SECONDS = 10;

/** Acima disto o painel avisa que o arquivo vai ficar pesado. Ver o comentário
 *  em `sizeWarning`: é contagem de pixels escritos, não um palpite de bytes. */
const HEAVY_PIXELS = 40_000_000;

interface RunSettings {
  readonly startSec: number;
  readonly endSec: number;
  readonly fps: GifFps;
  readonly width: GifWidth;
  readonly colors: GifColors;
  readonly dither: boolean;
}

@Component({
  selector: 'app-video-to-gif',
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
  templateUrl: './video-to-gif.component.html',
})
export class VideoToGifComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  private readonly maker = inject(GifMakerService);
  private readonly urls = inject(ObjectUrlScope);

  protected readonly tool = toolById('video-to-gif');
  protected readonly acceptAttr = ACCEPT_VIDEO_ATTR;
  protected readonly maxSeconds = MAX_GIF_SECONDS;

  protected readonly videoUrl = signal<string | null>(null);
  protected readonly duration = signal(0);
  protected readonly sourceWidth = signal(0);
  protected readonly sourceHeight = signal(0);

  protected readonly startSec = signal(0);
  protected readonly endSec = signal(0);

  protected readonly fps = signal<GifFps>(12);
  protected readonly width = signal<GifWidth>(480);
  protected readonly colors = signal<GifColors>(128);
  protected readonly dither = signal(false);

  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly stage = signal<'palette' | 'frames' | 'encode'>('palette');
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly result = signal<GifOutput | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  private readonly ranSettings = signal<RunSettings | null>(null);

  protected readonly widthOptions = computed<SegmentOption<GifWidth>[]>(() =>
    GIF_WIDTHS.map((value) => ({ value, label: `${value}px` })),
  );
  protected readonly fpsOptions = computed<SegmentOption<GifFps>[]>(() =>
    GIF_FPS.map((value) => ({ value, label: `${value}` })),
  );
  protected readonly colorOptions = computed<SegmentOption<GifColors>[]>(() =>
    GIF_COLORS.map((value) => ({ value, label: `${value}` })),
  );

  protected readonly span = computed(() => Math.max(0, this.endSec() - this.startSec()));

  /**
   * Quadros e resolução do que vai ser escrito, calculados pela MESMA função que
   * o serviço usa. É o número que o painel mostra em vez de um tamanho estimado:
   * no GIF, o peso do arquivo depende do conteúdo (o LZW comprime uma tela
   * chapada muito melhor que uma cena de câmera), então prometer megabytes antes
   * de escrever seria inventar precisão. Quadros e pixels são exatos, e são o
   * que a pessoa de fato controla.
   */
  protected readonly plan = computed(() => {
    if (this.duration() <= 0) return null;
    return frameGridFor(
      { duration: this.duration(), width: this.sourceWidth(), height: this.sourceHeight() },
      { startSec: this.startSec(), endSec: this.endSec(), fps: this.fps(), width: this.width() },
    );
  });

  protected readonly sizeWarning = computed(() => {
    const plan = this.plan();
    if (!plan) return false;
    return plan.count * plan.width * plan.height > HEAVY_PIXELS;
  });

  protected readonly resultSize = computed(() => {
    const output = this.result();
    return output ? formatBytes(output.blob.size) : null;
  });

  protected readonly stale = computed(() => {
    if (!this.videoUrl() || this.busy()) return false;

    const ran = this.ranSettings();
    if (!ran) return true;

    return (
      ran.startSec !== this.startSec() ||
      ran.endSec !== this.endSec() ||
      ran.fps !== this.fps() ||
      ran.width !== this.width() ||
      ran.colors !== this.colors() ||
      ran.dither !== this.dither()
    );
  });

  constructor() {
    hydrateFromWorkspace('video-to-gif', (file) => {
      if (!file) {
        this.clearAll();
        return;
      }
      void this.openFile(file);
    });
  }

  private clearAll(): void {
    this.videoUrl.set(null);
    this.duration.set(0);
    this.sourceWidth.set(0);
    this.sourceHeight.set(0);
    this.startSec.set(0);
    this.endSec.set(0);
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
      const probe = await this.maker.inspect(file);

      this.duration.set(probe.duration);
      this.sourceWidth.set(probe.width);
      this.sourceHeight.set(probe.height);
      this.startSec.set(0);
      this.endSec.set(Math.min(probe.duration, DEFAULT_SPAN_SECONDS));

      // A largura padrão nunca amplia: um vídeo gravado em 320 px virar um GIF
      // de 480 só entrega um arquivo maior e mais borrado.
      const fitting = [...GIF_WIDTHS].filter((w) => w <= probe.width);
      this.width.set((fitting.at(-1) ?? GIF_WIDTHS[0]) > 480 ? 480 : (fitting.at(-1) ?? GIF_WIDTHS[0]));

      this.videoUrl.set(this.urls.replace(this.videoUrl(), file));
    } catch (err) {
      console.error('[VideoToGif] could not read the video:', err);
      this.errorKey.set(toMessageKey(err));
      this.clearAll();
    }
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'video-to-gif');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  /** O fim acompanha o início: o trecho tem duração, não só duas bordas. */
  protected onStartChange(value: number): void {
    const start = Math.max(0, Math.min(value, this.duration()));
    this.startSec.set(start);

    const end = this.endSec();
    if (end <= start) this.endSec.set(Math.min(this.duration(), start + 1));
    if (this.endSec() - start > MAX_GIF_SECONDS) this.endSec.set(start + MAX_GIF_SECONDS);
  }

  protected onEndChange(value: number): void {
    const end = Math.max(0, Math.min(value, this.duration()));
    this.endSec.set(end);

    const start = this.startSec();
    if (end <= start) this.startSec.set(Math.max(0, end - 1));
    if (end - this.startSec() > MAX_GIF_SECONDS) this.startSec.set(end - MAX_GIF_SECONDS);
  }

  protected clock(seconds: number): string {
    const total = Math.max(0, seconds);
    const minutes = Math.floor(total / 60);
    const rest = total - minutes * 60;
    return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
  }

  protected async run(): Promise<void> {
    const file = this.workspace.fileFor('video-to-gif');
    if (!file || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    const settings: RunSettings = {
      startSec: this.startSec(),
      endSec: this.endSec(),
      fps: this.fps(),
      width: this.width(),
      colors: this.colors(),
      dither: this.dither(),
    };

    try {
      const output = await this.maker.make(file, settings, (progress) => {
        this.progress.set(progress.percent);
        this.stage.set(progress.stage);
      });

      this.result.set(output);
      this.resultUrl.set(this.urls.replace(this.resultUrl(), output.blob));
      this.ranSettings.set(settings);

      // O commit acontece na navegação, como em toda ferramenta: o GIF é uma
      // imagem, então ele segue para o módulo de imagem pela cadeia normal.
      this.pendingTransition.registerResult('video-to-gif', output.blob, this.tool.suffix, 'gif');
    } catch (err) {
      console.error('[VideoToGif] generation failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const output = this.result();
    if (!output) return;

    // O nome sai da SESSÃO, não do arquivo atual: é ela que guarda o nome
    // original e faz `gravacao.webm` virar `gravacao-gif.gif` em vez de herdar
    // o nome de um passo intermediário.
    const name = this.workspace.session()?.originalName ?? 'video';
    saveBlob(output.blob, suffixedName(name, this.tool.suffix, 'gif'));
  }
}
