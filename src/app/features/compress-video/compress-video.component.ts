import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { outputSize, reencodeVideo } from '../../core/video/reencode';
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

/** 0 = mantém a altura da origem. As demais são as alturas que as pessoas pedem. */
type HeightId = 0 | 1080 | 720 | 480 | 360;

type QualityId = 'high' | 'balanced' | 'low';

/**
 * Bits por pixel por segundo.
 *
 * O bitrate NÃO pode ser um número fixo por qualidade: 2 Mbps é generoso num
 * 480p e insuficiente num 1080p, e um seletor que entregasse as duas coisas
 * sob o mesmo rótulo estaria mentindo em uma das pontas. A escala por pixel é
 * a mesma ideia do `bitrateFor` que a máquina usa por padrão — aqui ela só
 * ganha três degraus.
 */
const BITS_PER_PIXEL: Record<QualityId, number> = {
  high: 4.2,
  balanced: 2.4,
  low: 1.2,
};

@Component({
  selector: 'app-compress-video',
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
  templateUrl: './compress-video.component.html',
})
export class CompressVideoComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('compress-video');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly videoUrl = signal<string | null>(null);
  protected readonly duration = signal(0);
  protected readonly sourceWidth = signal(0);
  protected readonly sourceHeight = signal(0);

  protected readonly height = signal<HeightId>(720);
  protected readonly quality = signal<QualityId>('balanced');
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

  /**
   * Só as alturas que REDUZEM.
   *
   * Ampliar não comprime nada: entrega os mesmos pixels ocupando um arquivo
   * maior. Oferecer 1080p sobre um vídeo 720p seria oferecer o contrário do
   * que a ferramenta promete, e a máquina já recusa — `outputSize` nunca
   * amplia. Melhor não mostrar do que mostrar e ignorar.
   */
  protected readonly heightOptions = computed<SegmentOption<HeightId>[]>(() => {
    const source = this.sourceHeight();
    const usable: HeightId[] = ([1080, 720, 480, 360] as const).filter(
      (h) => source === 0 || h < source,
    );
    return [
      { value: 0, label: this.i18n.t()['compvid.keep'] },
      ...usable.map((h) => ({ value: h, label: `${h}p` })),
    ];
  });

  protected readonly qualityOptions = computed<SegmentOption<QualityId>[]>(() => [
    { value: 'high', label: this.i18n.t()['compvid.quality_high'] },
    { value: 'balanced', label: this.i18n.t()['compvid.quality_balanced'] },
    { value: 'low', label: this.i18n.t()['compvid.quality_low'] },
  ]);

  /** O tamanho que o arquivo vai ter, com os lados pares já aplicados. */
  protected readonly outBox = computed(() => {
    const w = this.sourceWidth();
    const h = this.sourceHeight();
    if (w === 0 || h === 0) return null;
    return outputSize({ w, h }, this.height() || undefined);
  });

  protected readonly bitrate = computed(() => {
    const box = this.outBox();
    if (!box) return 0;
    const pixels = box.w * box.h;
    // O piso é 150 kbps, e ele já foi 400: num quadro pequeno os três degraus
    // batiam no teto de baixo e entregavam o MESMO bitrate, ou seja um seletor
    // de qualidade que não fazia nada. O e2e pegou comparando Alta com Leve.
    return Math.round(
      Math.min(12_000_000, Math.max(150_000, pixels * BITS_PER_PIXEL[this.quality()])),
    );
  });

  /**
   * Estimativa, e dita como estimativa.
   *
   * Bitrate vezes duração é o que o codificador vai MIRAR; ele gasta menos em
   * cena parada e mais em cena com movimento, então o número final difere. É a
   * mesma regra do painel do GIF, que mostra quadros e não promete megabytes:
   * um número apresentado como exato e entregue diferente é pior do que um
   * número apresentado como aproximado.
   */
  protected readonly estimatedBytes = computed(() =>
    Math.round((this.bitrate() / 8) * this.duration()),
  );

  protected readonly estimatedSize = computed(() =>
    this.estimatedBytes() > 0 ? formatBytes(this.estimatedBytes()) : '—',
  );

  protected readonly sourceSize = computed(() => {
    const file = this.file();
    return file ? formatBytes(file.size) : '—';
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  /**
   * O ajuste escolhido produziria um arquivo MAIOR que a origem.
   *
   * Acontece de verdade — um vídeo já bem comprimido re-encodado em "Alta" na
   * resolução original cresce —, e entregar isso em silêncio é o pior
   * resultado possível numa ferramenta chamada "comprimir". A tela avisa e
   * desativa o botão, como o corte faz com o vídeo inteiro.
   */
  protected readonly wouldGrow = computed(() => {
    const file = this.file();
    return !!file && this.estimatedBytes() > 0 && this.estimatedBytes() >= file.size;
  });

  protected readonly canRun = computed(
    () => !!this.file() && !this.wouldGrow() && !this.busy() && this.formats().length > 0,
  );

  /** A espera é a duração do vídeo, porque o áudio só se captura em tempo real. */
  protected readonly estimate = computed(() => Math.ceil(this.duration()));

  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() =>
    [this.height(), this.quality(), this.format()].join('|'),
  );

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    if (typeof MediaRecorder !== 'undefined') {
      const found = availableRecorderFormats().map((f) => ({ format: f.format, ext: f.ext }));
      this.formats.set(found);
      if (found[0]) this.format.set(found[0].format);
    }

    hydrateFromWorkspace('compress-video', (file) => void this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'compress-video');
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
      this.sourceWidth.set(0);
      this.sourceHeight.set(0);
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

      // O padrão só faz sentido se de fato reduzir. Num vídeo que já é 480p,
      // "720p" não existe na lista e deixar o signal apontando para ele daria
      // um seletor sem nenhuma opção marcada.
      if (this.height() !== 0 && this.height() >= probe.height) this.height.set(0);
    } catch (err) {
      console.error('[CompressVideo] could not read the video:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
    }
  }

  protected setHeight(value: HeightId): void {
    this.height.set(value);
    this.clearResult();
  }

  protected setQuality(value: QualityId): void {
    this.quality.set(value);
    this.clearResult();
  }

  protected setFormat(value: RecordingFormat): void {
    this.format.set(value);
    this.clearResult();
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file || !this.canRun()) return;

    this.busy.set(true);
    this.progress.set(0);
    this.secondsLeft.set(this.estimate());
    this.errorKey.set(null);
    this.abort = new AbortController();

    try {
      const settings = this.settings();

      const result = await reencodeVideo({
        file,
        format: this.format(),
        maxHeight: this.height() || undefined,
        videoBitsPerSecond: this.bitrate(),
        signal: this.abort.signal,
        onProgress: (percent, left) => {
          this.progress.set(percent);
          this.secondsLeft.set(Math.ceil(left));
        },
      });

      this.resultBlob.set(result.blob);
      this.resultExt.set(result.ext);
      this.ranSettings.set(settings);
      this.pendingTransition.registerResult(
        'compress-video',
        result.blob,
        this.tool.suffix,
        result.ext,
      );
    } catch (err) {
      console.error('[CompressVideo] compress failed:', err);
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
