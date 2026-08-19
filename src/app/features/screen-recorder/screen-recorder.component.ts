import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { formatClock } from '../../core/audio/audio-file.util';
import {
  MAX_RECORDING_MS,
  ScreenRecorder,
  availableRecorderFormats,
  isScreenRecordingSupported,
  type RecorderFormat,
  type RecordingFormat,
  type RecordingQuality,
} from '../../core/video/screen-recorder';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

/** O cronômetro anda em segundos; meio segundo evita ele pular um. */
const TICK_MS = 500;

@Component({
  selector: 'app-screen-recorder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    IconComponent,
    SegmentedComponent,
  ],
  templateUrl: './screen-recorder.component.html',
})
export class ScreenRecorderComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('screen-recorder');
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  private readonly urls = inject(ObjectUrlScope);

  /**
   * Possuído aqui, não injetado. Um `MediaStream` de captura vivo num serviço
   * root continuaria gravando a tela depois que a pessoa saiu da ferramenta —
   * mesmo argumento do `AudioEngine`, com um custo bem maior se errado.
   */
  private readonly recorder = new ScreenRecorder();

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly preview = viewChild<ElementRef<HTMLVideoElement>>('preview');

  protected readonly recording = signal(false);
  protected readonly elapsedMs = signal(0);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly noticeKey = signal<TranslationKey | null>(null);
  protected readonly result = signal<{
    file: File;
    url: string;
    size: number;
    durationMs: number;
  } | null>(null);

  protected readonly systemAudio = signal(true);
  protected readonly microphone = signal(false);
  protected readonly quality = signal<RecordingQuality>('medium');

  /**
   * O que este navegador escreve, lido uma vez na abertura.
   *
   * Signal e não `computed` porque a resposta vem do `MediaRecorder`, que não
   * existe no Node da geração estática: no servidor a lista fica vazia e o painel
   * cai no mesmo caminho de um navegador com um formato só. Ler isto em escopo de
   * módulo derrubaria a rota antes de existir componente.
   */
  protected readonly formats = signal<readonly RecorderFormat[]>([]);

  /** O contêiner escolhido. WebM é o padrão porque é o que todo gravador escreve. */
  protected readonly format = signal<RecordingFormat>('webm');

  /**
   * O nome do formato é o próprio valor, sem passar pelo dicionário — WEBM e MP4
   * se escrevem igual nos dois idiomas, e `convert` já resolve os formatos de
   * imagem assim.
   */
  protected readonly formatOptions = computed<SegmentOption<RecordingFormat>[]>(() =>
    this.formats().map((f) => ({ value: f.format, label: f.format.toUpperCase() })),
  );

  /** O único formato possível, para quando não há escolha a oferecer. */
  protected readonly soleFormat = computed(() =>
    (this.formats()[0]?.format ?? 'webm').toUpperCase(),
  );

  /**
   * Começa `true` para que o HTML pré-renderizado mostre a ferramenta, e não um
   * aviso de incompatibilidade: `navigator` não existe no Node da geração
   * estática, então a resposta lá seria sempre "não dá" — e é essa a página que
   * o crawler lê.
   */
  protected readonly supported = signal(true);

  protected readonly qualityOptions = computed<SegmentOption<RecordingQuality>[]>(() => [
    { value: 'high', label: this.i18n.t()['screenrec.q_high'] },
    { value: 'medium', label: this.i18n.t()['screenrec.q_medium'] },
    { value: 'low', label: this.i18n.t()['screenrec.q_low'] },
  ]);

  protected readonly elapsed = computed(() => formatClock(this.elapsedMs() / 1000));
  protected readonly limit = formatClock(MAX_RECORDING_MS / 1000);

  /** Separado do `result()` porque `@else if` não aceita `as` — só o `@if` primário. */
  protected readonly resultUrl = computed(() => this.result()?.url ?? null);

  protected readonly resultSize = computed(() => {
    const res = this.result();
    return res ? formatBytes(res.size) : '';
  });

  protected readonly resultDuration = computed(() => {
    const res = this.result();
    return res ? formatClock(res.durationMs / 1000) : '';
  });

  /** O rótulo do botão principal É o estado: gravando ou não. */
  protected readonly primaryLabel = computed(() =>
    this.recording() ? this.i18n.t()['screenrec.stop'] : this.i18n.t()['screenrec.start'],
  );

  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (this.isBrowser) {
      this.supported.set(isScreenRecordingSupported());

      // Lido aqui, e não num `computed`: a lista não muda durante a sessão e
      // `MediaRecorder` não existe no servidor. O primeiro é o preferido — WebM
      // em todo navegador que grava — e é o que já está selecionado.
      const formats = availableRecorderFormats();
      this.formats.set(formats);
      if (formats[0]) this.format.set(formats[0].format);
    }

    // Parar o compartilhamento pela barra do navegador é o caminho mais comum de
    // encerrar, não um caso de borda — é o botão que fica na frente da pessoa a
    // gravação inteira.
    this.recorder.onAutoStop = () => void this.stop();

    inject(DestroyRef).onDestroy(() => {
      this.stopTicker();
      this.recorder.dispose();
    });
  }

  protected toggle(): void {
    if (this.recording()) void this.stop();
    else void this.start();
  }

  private async start(): Promise<void> {
    this.errorKey.set(null);
    this.noticeKey.set(null);
    this.pendingTransition.clear();
    this.clearResult();

    try {
      await this.recorder.start({
        systemAudio: this.systemAudio(),
        microphone: this.microphone(),
        quality: this.quality(),
        format: this.format(),
      });
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
      return;
    }

    if (this.recorder.micRefused) this.noticeKey.set('screenrec.mic_denied');

    this.recording.set(true);
    this.elapsedMs.set(0);
    this.attachPreview();

    this.ticker = setInterval(() => this.elapsedMs.set(this.recorder.elapsed()), TICK_MS);
  }

  private async stop(): Promise<void> {
    if (!this.recording()) return;

    this.stopTicker();
    this.recording.set(false);
    this.detachPreview();

    try {
      const rec = await this.recorder.stop();
      const name = `${this.i18n.currentLang() === 'en' ? 'screen-recording' : 'gravacao-de-tela'}.${rec.ext}`;
      const file = new File([rec.blob], name, { type: rec.blob.type });

      this.result.set({
        file,
        url: this.urls.create(rec.blob),
        size: rec.blob.size,
        durationMs: rec.durationMs,
      });

      // `load`, e não `apply`: esta é a única ferramenta do produto que CRIA um
      // arquivo do nada, então a gravação não continua uma cadeia — ela começa
      // uma, exatamente como um upload, e `apply` derivaria o nome de uma sessão
      // que não existe. Registrado como pendente, como todo mundo: quem commita é
      // a navegação, e é o registro que faz os chips aparecerem — é daí que sai o
      // par que dá sentido ao módulo, gravar a tela e ir direto extrair o áudio.
      this.pendingTransition.register(() => {
        try {
          this.workspace.load(file);
          return true;
        } catch {
          return false;
        }
      });
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected download(): void {
    const res = this.result();
    if (res) saveBlob(res.file, res.file.name);
  }

  protected reset(): void {
    this.stopTicker();
    this.pendingTransition.clear();
    this.recorder.dispose();
    this.recording.set(false);
    this.elapsedMs.set(0);
    this.errorKey.set(null);
    this.noticeKey.set(null);
    this.clearResult();
    this.workspace.clear();
  }

  private clearResult(): void {
    this.urls.revoke(this.result()?.url ?? null);
    this.result.set(null);
  }

  private stopTicker(): void {
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
  }

  /**
   * A prévia ao vivo é o que confirma que a fonte certa foi escolhida — o
   * seletor do navegador some assim que a pessoa clica, e sem isto a única
   * informação na tela seria um cronômetro.
   *
   * `muted` obrigatório: sem ele, capturar a própria aba com som do sistema
   * devolve o áudio para a mesma saída e realimenta num assobio.
   */
  private attachPreview(): void {
    const el = this.preview()?.nativeElement;
    if (!el) return;
    el.srcObject = this.recorder.previewStream();
    void el.play().catch(() => undefined);
  }

  private detachPreview(): void {
    const el = this.preview()?.nativeElement;
    if (el) el.srcObject = null;
  }
}
