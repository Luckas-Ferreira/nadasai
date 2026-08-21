import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import type { Region } from '../../core/geometry/region';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { cropVideo, pixelBox, type CropRect } from '../../core/video/crop';
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
import { RegionOverlayComponent } from '../../shared/ui/region-overlay.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

/** Proporções que as pessoas de fato pedem, mais a livre. */
type AspectId = 'free' | '1:1' | '9:16' | '16:9' | '4:5';

const ASPECT: Record<Exclude<AspectId, 'free'>, number> = {
  '1:1': 1,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '4:5': 4 / 5,
};

@Component({
  selector: 'app-crop-video',
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
    RegionOverlayComponent,
    ButtonDirective,
  ],
  templateUrl: './crop-video.component.html',
})
export class CropVideoComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('crop-video');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly videoUrl = signal<string | null>(null);
  protected readonly duration = signal(0);
  protected readonly sourceWidth = signal(0);
  protected readonly sourceHeight = signal(0);

  /**
   * O overlay fala em REGIÕES e esta ferramenta só quer uma. Guardar a lista e
   * ficar com a última é mais honesto do que adaptar o componente: ele já
   * resolve o arrasto, os limites e a conversão para porcentagem, e é o mesmo
   * que os dois censuradores usam.
   */
  protected readonly regions = signal<readonly Region[]>([]);

  protected readonly aspect = signal<AspectId>('free');
  protected readonly format = signal<RecordingFormat>('webm');

  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly secondsLeft = signal(0);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultExt = signal('webm');
  protected readonly errorKey = signal<TranslationKey | null>(null);

  private abort: AbortController | null = null;

  /**
   * Lido no CONSTRUTOR e atrás de uma guarda de plataforma, nunca em escopo de
   * módulo: `MediaRecorder` não existe no Node da geração estática, e uma
   * chamada no carregamento derruba a rota antes de existir componente. É a
   * armadilha que o `TESSERACT_PATHS` já custou e que o gravador de tela
   * documenta.
   */
  protected readonly formats = signal<readonly { format: RecordingFormat; ext: string }[]>([]);

  protected readonly formatOptions = computed<SegmentOption<RecordingFormat>[]>(() =>
    this.formats().map((f) => ({ value: f.format, label: f.format.toUpperCase() })),
  );

  protected readonly onlyOneFormat = computed(() => this.formats().length === 1);

  protected readonly rect = computed<CropRect | null>(() => {
    const region = this.regions().at(-1);
    if (!region) return null;
    return { x: region.xPct, y: region.yPct, w: region.wPct, h: region.hPct };
  });

  /** As dimensões que o arquivo vai ter, com os lados pares já aplicados. */
  protected readonly outputBox = computed(() => {
    const rect = this.rect();
    const w = this.sourceWidth();
    const h = this.sourceHeight();
    if (!rect || w === 0 || h === 0) return null;
    return pixelBox(rect, w, h);
  });

  protected readonly aspectOptions = computed<SegmentOption<AspectId>[]>(() => [
    { value: 'free', label: this.i18n.t()['cropvid.free'] },
    { value: '1:1', label: '1:1' },
    { value: '9:16', label: '9:16' },
    { value: '16:9', label: '16:9' },
    { value: '4:5', label: '4:5' },
  ]);

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  protected readonly canRun = computed(() => !!this.rect() && !this.busy() && this.formats().length > 0);

  /** Quanto tempo a operação vai levar: a duração do vídeo, e nada menos. */
  protected readonly estimate = computed(() => Math.ceil(this.duration()));

  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() => {
    const box = this.outputBox();
    return [box?.x, box?.y, box?.w, box?.h, this.format()].join('|');
  });

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    if (typeof MediaRecorder !== 'undefined') {
      const found = availableRecorderFormats().map((f) => ({ format: f.format, ext: f.ext }));
      this.formats.set(found);
      if (found[0]) this.format.set(found[0].format);
    }

    hydrateFromWorkspace('crop-video', (file) => void this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'crop-video');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async load(file: File | null): Promise<void> {
    this.clearResult();
    this.regions.set([]);

    if (!file) {
      this.file.set(null);
      this.urls.revoke(this.videoUrl());
      this.videoUrl.set(null);
      return;
    }

    try {
      assertUsableVideo(file);
      const probe = await probeVideo(file);

      this.file.set(file);
      this.duration.set(probe.duration);
      this.sourceWidth.set(probe.width);
      this.sourceHeight.set(probe.height);
      this.videoUrl.set(this.urls.replace(this.videoUrl(), file));
    } catch (err) {
      console.error('[CropVideo] could not read the video:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
    }
  }

  /**
   * O overlay entrega o retângulo desenhado; a proporção é aplicada DEPOIS,
   * ajustando a altura. Restringir durante o arrasto exigiria mudar o
   * componente compartilhado, e o resultado na tela é o mesmo — o retângulo
   * final é o que vale.
   */
  protected onRegionAdded(region: Region): void {
    this.clearResult();
    this.regions.set([this.withAspect(region)]);
  }

  protected onRegionRemoved(): void {
    this.clearResult();
    this.regions.set([]);
  }

  protected setAspect(id: AspectId): void {
    this.aspect.set(id);
    const current = this.regions().at(-1);
    if (current) this.regions.set([this.withAspect(current)]);
    this.clearResult();
  }

  private withAspect(region: Region): Region {
    const id = this.aspect();
    if (id === 'free') return region;

    const w = this.sourceWidth();
    const h = this.sourceHeight();
    if (w === 0 || h === 0) return region;

    // A proporção é de PIXEL, e a região está em fração de cada eixo — então a
    // conversão precisa passar pelas dimensões do vídeo. Aplicar a razão
    // direto nas frações produziria um quadrado só em vídeo quadrado.
    const targetH = (region.wPct * w) / ASPECT[id] / h;
    const hPct = Math.min(targetH, 1 - region.yPct);
    const wPct = hPct < targetH ? (hPct * h * ASPECT[id]) / w : region.wPct;

    return { ...region, wPct, hPct };
  }

  protected async run(): Promise<void> {
    const file = this.file();
    const rect = this.rect();
    if (!file || !rect || !this.canRun()) return;

    this.busy.set(true);
    this.progress.set(0);
    this.secondsLeft.set(this.estimate());
    this.errorKey.set(null);
    this.abort = new AbortController();

    try {
      const settings = this.settings();

      const result = await cropVideo({
        file,
        rect,
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
      this.pendingTransition.registerResult('crop-video', result.blob, this.tool.suffix, result.ext);
    } catch (err) {
      console.error('[CropVideo] crop failed:', err);
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
    this.regions.set([]);
    this.duration.set(0);
    this.sourceWidth.set(0);
    this.sourceHeight.set(0);
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
