import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { formatClock } from '../../core/audio/audio-file.util';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  MAX_RECORDING_SECONDS,
  VoiceRecorder,
  availableVoiceFormats,
  type VoiceFormat,
} from './voice-recorder';

@Component({
  selector: 'app-voice-recorder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    SegmentedComponent,
    ButtonDirective,
  ],
  templateUrl: './voice-recorder.component.html',
})
export class VoiceRecorderComponent implements OnDestroy {
  private readonly urls = inject(ObjectUrlScope);
  private readonly workspace = inject(WorkspaceService);
  protected readonly tool = toolById('voice-recorder');
  protected readonly i18n = inject(TranslationService);

  /**
   * A classe é do COMPONENTE, nunca `providedIn: 'root'`.
   *
   * Um `MediaStream` de microfone vivo num singleton continua ouvindo depois
   * que a pessoa saiu da ferramenta. Num produto chamado Nada Sai esse é o pior
   * defeito possível, e a única defesa estrutural é o objeto morrer com a tela.
   */
  private readonly recorder = new VoiceRecorder();
  private ticker: ReturnType<typeof setInterval> | null = null;

  protected readonly formats = signal<readonly VoiceFormat[]>([]);
  protected readonly format = signal<VoiceFormat | null>(null);

  protected readonly recording = signal(false);
  protected readonly seconds = signal(0);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly formatOptions = computed<SegmentOption<string>[]>(() =>
    this.formats().map((f) => ({ value: f.ext, label: f.label })),
  );

  protected readonly onlyOneFormat = computed(() => this.formats().length === 1);
  protected readonly unsupported = computed(() => this.formats().length === 0);

  protected readonly clock = computed(() => formatClock(this.seconds()));
  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  /** O nome só existe depois de gravar, e é o que a sessão vai carregar. */
  private fileName(): string {
    return `${this.tool.suffix}.${this.format()?.ext ?? 'webm'}`;
  }

  constructor() {
    // Lido no construtor e atrás da guarda de plataforma: o `MediaRecorder` não
    // existe no Node do prerender, e uma chamada em escopo de módulo derruba a
    // rota antes de existir componente.
    if (typeof MediaRecorder !== 'undefined') {
      const found = availableVoiceFormats();
      this.formats.set(found);
      if (found[0]) this.format.set(found[0]);
    }
  }

  ngOnDestroy(): void {
    this.stopTicker();
    this.recorder.release();
  }

  protected setFormat(ext: string): void {
    const found = this.formats().find((f) => f.ext === ext);
    if (found) this.format.set(found);
  }

  protected async start(): Promise<void> {
    const format = this.format();
    if (!format || this.recording()) return;

    this.errorKey.set(null);
    this.clearResult();

    try {
      await this.recorder.start(format);
      this.recording.set(true);
      this.seconds.set(0);

      this.ticker = setInterval(() => {
        this.seconds.update((s) => s + 1);
        // O teto para a gravação sozinho, e o painel o anuncia desde o início —
        // descobrir um limite ao ser interrompido é a pior forma de conhecê-lo.
        if (this.seconds() >= MAX_RECORDING_SECONDS) void this.stop();
      }, 1000);
    } catch (err) {
      console.error('[VoiceRecorder] could not start:', err);
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected async stop(): Promise<void> {
    if (!this.recording()) return;

    this.stopTicker();
    this.recording.set(false);

    try {
      const blob = await this.recorder.stop();
      this.resultBlob.set(blob);
      this.resultUrl.set(this.urls.replace(this.resultUrl(), blob));

      /**
       * `load()` e não `apply()`: a gravação COMEÇA uma cadeia em vez de
       * continuar uma. É a mesma decisão do gravador de tela, e é o que faz o
       * nome do arquivo derivar daqui para a frente.
       *
       * E SEM o id da ferramenta, que parece esquecimento e não é: a guarda de
       * tipo pergunta se o tool que vai ABRIR o arquivo aceita aquele tipo, e
       * esta declara `accepts: []` porque não abre nada — ela cria. Passando o
       * id, a sessão recusava a própria gravação com a mensagem de imagem
       * ("use PNG, JPEG…"), que é o texto padrão de `rejectionFor([])`. O
       * gravador de tela chama do mesmo jeito, pelo mesmo motivo.
       */
      const file = new File([blob], this.fileName(), { type: blob.type });
      this.workspace.load(file);
    } catch (err) {
      console.error('[VoiceRecorder] could not stop:', err);
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    if (blob) saveBlob(blob, this.fileName());
  }

  protected reset(): void {
    this.stopTicker();
    this.recorder.release();
    this.recording.set(false);
    this.seconds.set(0);
    this.urls.releaseAll();
    this.resultUrl.set(null);
    this.clearResult();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  private clearResult(): void {
    this.resultBlob.set(null);
  }
}
