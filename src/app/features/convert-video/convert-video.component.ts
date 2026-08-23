import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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

/**
 * De que contêiner o arquivo VEIO, para o painel poder dizer "isto já é MP4".
 *
 * Sai do tipo MIME quando ele existe e do nome quando não existe: um `.mkv`
 * chega com `type` vazio em vários navegadores, e um arquivo vindo da cadeia
 * (a gravação de tela, por exemplo) chega com o tipo certo e sem extensão
 * reconhecível. Nenhuma das duas fontes basta sozinha.
 */
function containerOf(file: File): RecordingFormat | null {
  const hint = `${file.type} ${file.name}`.toLowerCase();
  if (hint.includes('mp4') || hint.includes('.m4v') || hint.includes('quicktime')) return 'mp4';
  if (hint.includes('webm')) return 'webm';
  return null;
}

@Component({
  selector: 'app-convert-video',
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
  templateUrl: './convert-video.component.html',
})
export class ConvertVideoComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('convert-video');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly videoUrl = signal<string | null>(null);
  protected readonly duration = signal(0);
  protected readonly sourceWidth = signal(0);
  protected readonly sourceHeight = signal(0);
  protected readonly sourceContainer = signal<RecordingFormat | null>(null);

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
   * Converter para o formato que o arquivo JÁ tem só acrescentaria uma geração
   * de compressão. A tela diz isso e desativa o botão, em vez de entregar um
   * arquivo pior com o mesmo nome de formato — mesma decisão do corte que
   * recusa cortar o vídeo inteiro.
   */
  protected readonly sameFormat = computed(
    () => !!this.file() && this.sourceContainer() === this.format(),
  );

  protected readonly sameFormatMessage = computed(() =>
    this.i18n.t()['convvid.same_format'].replace('{f}', this.format().toUpperCase()),
  );

  protected readonly sourceSize = computed(() => {
    const file = this.file();
    return file ? formatBytes(file.size) : '—';
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  protected readonly canRun = computed(
    () => !!this.file() && !this.sameFormat() && !this.busy() && this.formats().length > 0,
  );

  /** A espera é a duração do vídeo, porque o áudio só se captura em tempo real. */
  protected readonly estimate = computed(() => Math.ceil(this.duration()));

  private readonly ranSettings = signal<string | null>(null);
  private readonly settings = computed(() => this.format());
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

    hydrateFromWorkspace('convert-video', (file) => void this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'convert-video');
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
      this.sourceContainer.set(null);
      return;
    }

    try {
      assertUsableVideo(file);
      const probe = await probeVideo(file);

      this.file.set(file);
      this.duration.set(probe.duration);
      this.sourceWidth.set(probe.width);
      this.sourceHeight.set(probe.height);
      this.sourceContainer.set(containerOf(file));
      this.videoUrl.set(this.urls.replace(this.videoUrl(), file));

      // Chega já apontando para o destino ÚTIL. Um MP4 aberto numa tela cuja
      // saída também é MP4 mostraria o aviso de "mesmo formato" antes de a
      // pessoa ter tocado em nada, o que faz a ferramenta parecer quebrada.
      const other = this.formats().find((f) => f.format !== this.sourceContainer());
      if (other) this.format.set(other.format);
    } catch (err) {
      console.error('[ConvertVideo] could not read the video:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
    }
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
        'convert-video',
        result.blob,
        this.tool.suffix,
        result.ext,
      );
    } catch (err) {
      console.error('[ConvertVideo] convert failed:', err);
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
    this.sourceContainer.set(null);
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
