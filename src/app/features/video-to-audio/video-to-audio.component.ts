import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AppError, toMessageKey } from '../../core/errors';
import { MAX_AUDIO_BYTES, formatClock } from '../../core/audio/audio-file.util';
import { computePeaks, renderPeaksToCanvas } from '../../core/audio/waveform';
import { saveBlob } from '../../core/image/download';
import { ObjectUrlScope } from '../../core/image/object-url';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ACCEPT_VIDEO_ATTR, type VideoProbe } from '../../core/video/video-file.util';
import type { ExtractStage } from '../../core/video/extract-audio';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  VideoAudioService,
  type VideoAudioBitrate,
  type VideoAudioChannels,
  type VideoAudioFormat,
} from './services/video-audio.service';

/** Largura em pixels da tira de forma de onda. Não é interativa: é a prova. */
const WAVE_WIDTH = 1200;
const WAVE_HEIGHT = 96;
const WAVE_BUCKETS = 4_096;

interface RunSettings {
  readonly format: VideoAudioFormat;
  readonly channels: VideoAudioChannels;
  readonly sampleRate: number;
  readonly bitrate: VideoAudioBitrate;
}

@Component({
  selector: 'app-video-to-audio',
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
    IconComponent,
  ],
  templateUrl: './video-to-audio.component.html',
})
export class VideoToAudioComponent implements OnDestroy {
  protected readonly tool = toolById('video-to-audio');
  private readonly service = inject(VideoAudioService);
  private readonly workspace = inject(WorkspaceService);

  constructor() {
    // Desde que a sessão sabe segurar um vídeo, o gravador de tela entrega
    // direto aqui: gravar e tirar o áudio deixaram de ser dois arquivos e dois
    // uploads. `accepts: ['video']` é o que faz este ser o único lugar do
    // produto onde uma gravação chega sem passar pelo disco.
    hydrateFromWorkspace('video-to-audio', (file) => {
      if (!file) {
        // `null` aqui nem sempre quer dizer "a sessão esvaziou". A extração
        // entrega o áudio para a própria sessão (ver `handOff`), e a partir daí
        // ela guarda um ÁUDIO — que esta ferramenta, `accepts: ['video']`, não
        // recebe. A hidratação avisa com `null` e limpar nesse caso apagava o
        // vídeo, o resultado e o botão de baixar no instante seguinte ao da
        // extração. Se o último passo do histórico foi meu, o `null` é a minha
        // própria entrega e não há nada a limpar.
        if (this.workspace.history().at(-1) === 'video-to-audio') return;
        this.clearSource();
        return;
      }
      void this.openFile(file);
    });
  }
  private readonly urls = inject(ObjectUrlScope);
  private readonly router = inject(Router);
  protected readonly i18n = inject(TranslationService);

  protected readonly acceptAttr = ACCEPT_VIDEO_ATTR;

  // Fonte
  protected readonly currentFile = signal<File | null>(null);
  protected readonly probe = signal<VideoProbe | null>(null);
  protected readonly audioBuffer = signal<AudioBuffer | null>(null);
  protected readonly videoUrl = signal<string | null>(null);
  protected readonly waveUrl = signal<string | null>(null);
  /** Verdadeiro quando a trilha só saiu tocando o vídeo inteiro. */
  protected readonly realtime = signal(false);

  // Extração
  protected readonly extracting = signal(false);
  protected readonly stage = signal<ExtractStage>('reading');
  protected readonly extractPercent = signal<number | null>(null);
  private abort: AbortController | null = null;

  // Codificação
  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly result = signal<{ blob: Blob; filename: string } | null>(null);
  protected readonly ranSettings = signal<RunSettings | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  /** A saída passou do teto do módulo de áudio e não pode seguir na cadeia. */
  protected readonly chained = signal(false);

  // Opções
  protected readonly format = signal<VideoAudioFormat>('mp3');
  protected readonly channels = signal<VideoAudioChannels>('original');
  protected readonly sampleRate = signal(0);
  protected readonly bitrate = signal<VideoAudioBitrate>('192');

  protected readonly formatOptions: readonly SegmentOption<VideoAudioFormat>[] = [
    { value: 'mp3', label: 'MP3' },
    { value: 'wav', label: 'WAV' },
  ];

  protected readonly bitrateOptions: readonly SegmentOption<VideoAudioBitrate>[] = [
    { value: '320', label: '320' },
    { value: '192', label: '192' },
    { value: '128', label: '128' },
    { value: '64', label: '64' },
  ];

  protected readonly rateOptions: readonly SegmentOption<number>[] = [
    { value: 0, label: 'Original' },
    { value: 44100, label: '44,1 kHz' },
    { value: 22050, label: '22 kHz' },
  ];

  // ---------------------------------------------------------------- derivados

  protected readonly channelOptions = computed<readonly SegmentOption<VideoAudioChannels>[]>(() => [
    { value: 'original', label: this.i18n.t()['video_audio.ch_original'] },
    { value: 'mono', label: this.i18n.t()['video_audio.ch_mono'] },
  ]);

  protected readonly duration = computed(() => this.audioBuffer()?.duration ?? 0);

  protected readonly sourceSize = computed(() => {
    const file = this.currentFile();
    return file ? formatBytes(file.size) : '';
  });

  protected readonly resolution = computed(() => {
    const probe = this.probe();
    return probe && probe.width > 0 ? `${probe.width}×${probe.height}` : '';
  });

  protected readonly trackLabel = computed(() => {
    const buffer = this.audioBuffer();
    if (!buffer) return '';
    const channels = buffer.numberOfChannels > 1 ? 'estéreo' : 'mono';
    return `${channels} · ${Math.round(buffer.sampleRate / 100) / 10} kHz`;
  });

  protected readonly estimatedSize = computed(() => {
    const buffer = this.audioBuffer();
    if (!buffer) return '';
    return formatBytes(this.service.estimatedBytes(buffer, this.settings()));
  });

  protected readonly resultSize = computed(() => {
    const result = this.result();
    return result ? formatBytes(result.blob.size) : '';
  });

  /**
   * O botão primário some quando apertá-lo só reproduziria os bytes que já estão
   * na tela, e volta no instante em que qualquer ajuste muda — a regra do
   * `app-action-bar`. Aqui a comparação é contra as opções com que o resultado
   * atual foi feito, não contra a existência de um resultado.
   */
  protected readonly stale = computed(() => {
    const ran = this.ranSettings();
    if (!ran) return true;
    const now = this.settings();
    return (
      ran.format !== now.format ||
      ran.channels !== now.channels ||
      ran.sampleRate !== now.sampleRate ||
      // A taxa de bits não entra em WAV: mudá-la ali não altera um byte.
      (now.format === 'mp3' && ran.bitrate !== now.bitrate)
    );
  });

  protected readonly primaryLabel = computed(() =>
    this.stale() ? this.i18n.t()['video_audio.btn'] : null,
  );

  /** Quanto tempo a captura em tempo real ainda deve levar, em relógio. */
  protected readonly remaining = computed(() => {
    const probe = this.probe();
    const percent = this.extractPercent();
    if (!probe || percent === null) return '';
    return formatClock((probe.duration * (100 - percent)) / 100);
  });

  private settings(): RunSettings {
    return {
      format: this.format(),
      channels: this.channels(),
      sampleRate: this.sampleRate(),
      bitrate: this.bitrate(),
    };
  }

  ngOnDestroy(): void {
    // Sair da rota no meio de uma captura de 20 minutos tem que parar a captura:
    // o `<video>` vive dentro do core, fora da árvore, e ninguém mais o alcança.
    this.abort?.abort();
  }

  // ---------------------------------------------------------------- extração

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'video-to-audio');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async openFile(file: File): Promise<void> {
    this.clearSource();
    this.errorKey.set(null);
    this.extracting.set(true);
    this.stage.set('reading');
    this.extractPercent.set(null);

    const controller = new AbortController();
    this.abort = controller;

    try {
      const { buffer, realtime, probe } = await this.service.open(file, {
        signal: controller.signal,
        onProgress: ({ stage, percent }) => {
          this.stage.set(stage);
          this.extractPercent.set(percent);
        },
      });

      this.currentFile.set(file);
      this.probe.set(probe);
      this.audioBuffer.set(buffer);
      this.realtime.set(realtime);
      this.videoUrl.set(this.urls.replace(this.videoUrl(), file));
      this.paintWaveform(buffer);
    } catch (err) {
      if (err instanceof AppError && err.code === 'cancelled') {
        this.clearSource();
        return;
      }
      console.error('[VideoToAudio] não foi possível extrair a trilha:', err);
      this.clearSource();
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.extracting.set(false);
      this.abort = null;
    }
  }

  protected cancelExtraction(): void {
    this.abort?.abort();
  }

  /**
   * A onda é desenhada uma vez, como imagem, e não é interativa — quem quiser
   * ouvir tem o próprio `<video>` logo acima, com controles de verdade. Um
   * segundo tocador aqui seria uma cópia do de cortar-áudio para não fazer nada
   * que o elemento de mídia já não faça.
   */
  private paintWaveform(buffer: AudioBuffer): void {
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) channels.push(buffer.getChannelData(ch));

    const peaks = computePeaks(channels, Math.min(WAVE_BUCKETS, Math.max(1, buffer.length)));
    const style = getComputedStyle(document.documentElement);
    const canvas = renderPeaksToCanvas(peaks, {
      width: WAVE_WIDTH,
      height: WAVE_HEIGHT,
      color: style.getPropertyValue('--color-wave-keep').trim() || '#1d4ed8',
      background: '#ffffff',
    });

    canvas.toBlob((blob) => {
      if (blob) this.waveUrl.set(this.urls.replace(this.waveUrl(), blob));
    }, 'image/png');
  }

  // ---------------------------------------------------------------- extrair

  protected async run(): Promise<void> {
    const buffer = this.audioBuffer();
    const file = this.currentFile();
    if (!buffer || !file || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const settings = this.settings();
      const { blob, ext } = await this.service.encode(buffer, settings, (pct) =>
        this.progress.set(pct),
      );

      const filename = suffixedName(file.name, this.tool.suffix, ext);
      this.result.set({ blob, filename });
      this.ranSettings.set(settings);
      this.chained.set(this.handOff(blob, filename));
    } catch (err) {
      console.error('[VideoToAudio] falha ao codificar:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Entrega o resultado à cadeia de áudio, para que cortar/juntar/comprimir o
   * encontrem já carregado.
   *
   * `load()` é usado em vez de `apply()` porque a sessão começa AQUI: `apply()`
   * deriva o nome do arquivo de uma sessão anterior, e não há nenhuma — a fonte
   * era um vídeo, que `WorkspaceService` não aceita guardar (e nem deveria).
   *
   * Um WAV longo passa dos 100 MB que o módulo de áudio aceita e é recusado. Não
   * é erro: o download continua valendo, só o "continuar editando" não aparece.
   */
  private handOff(blob: Blob, filename: string): boolean {
    if (blob.size > MAX_AUDIO_BYTES) return false;
    try {
      // `apply()` agora, não `load()`: a sessão existe — é o vídeo de origem, que
      // pode ter vindo do gravador de tela. Aplicar mantém o breadcrumb (a
      // gravação → o áudio) e o desfazer, que voltaria para o vídeo; `load()`
      // zerava os dois e reescrevia o nome a partir do resultado.
      this.workspace.apply(
        'video-to-audio',
        blob,
        this.tool.suffix,
        filename.split('.').pop() ?? 'wav',
      );
      return true;
    } catch {
      return false;
    }
  }

  protected download(): void {
    const result = this.result();
    if (result) saveBlob(result.blob, result.filename);
  }

  protected reset(): void {
    this.abort?.abort();
    this.clearSource();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private clearSource(): void {
    this.urls.revoke(this.videoUrl());
    this.urls.revoke(this.waveUrl());
    this.videoUrl.set(null);
    this.waveUrl.set(null);
    this.currentFile.set(null);
    this.probe.set(null);
    this.audioBuffer.set(null);
    this.realtime.set(false);
    this.result.set(null);
    this.ranSettings.set(null);
    this.chained.set(false);
    this.progress.set(0);
  }

  protected clock(seconds: number): string {
    return formatClock(seconds);
  }
}
