import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { applyChannelOperation, outputChannelCount, phaseCancellation, type ChannelOperation } from '../../core/audio/channels';
import { assertUsableAudio, formatClock } from '../../core/audio/audio-file.util';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { AudioConverterService } from '../convert-audio/services/audio-converter.service';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { AudioChannelsService, type ChannelOutputFormat } from './services/audio-channels.service';

/**
 * Acima disto o painel avisa que a mistura para mono vai perder nível. O valor
 * é folgado de propósito: abaixo de 0,3 o cancelamento é o que qualquer estéreo
 * largo tem, e alertar ali treinaria a pessoa a ignorar o aviso.
 */
const PHASE_WARN = 0.3;

@Component({
  selector: 'app-audio-channels',
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
  templateUrl: './audio-channels.component.html',
})
export class AudioChannelsComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly channelsService = inject(AudioChannelsService);
  private readonly converter = inject(AudioConverterService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('audio-channels');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly buffer = signal<AudioBuffer | null>(null);
  protected readonly reading = signal(false);

  protected readonly operation = signal<ChannelOperation>('to-mono');
  protected readonly format = signal<ChannelOutputFormat>('wav');
  protected readonly bitrate = signal('192');

  protected readonly busy = signal(false);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultExt = signal('wav');
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly sourceChannels = computed(() => this.buffer()?.numberOfChannels ?? 0);
  protected readonly isStereo = computed(() => this.sourceChannels() >= 2);
  protected readonly duration = computed(() => formatClock(this.buffer()?.duration ?? 0));
  protected readonly sampleRate = computed(() => this.buffer()?.sampleRate ?? 0);

  /**
   * As operações que fazem sentido para ESTE arquivo. Num mono não há canal
   * direito para extrair nem lados para trocar, e oferecer os três botões
   * mortos seria pedir que a pessoa descobrisse sozinha que dois deles não
   * mudam nada.
   */
  protected readonly operationOptions = computed<SegmentOption<ChannelOperation>[]>(() => {
    const t = this.i18n.t();

    if (!this.isStereo()) {
      return [{ value: 'to-stereo', label: t['channels.to_stereo'] }];
    }

    return [
      { value: 'to-mono', label: t['channels.to_mono'] },
      { value: 'left-only', label: t['channels.left_only'] },
      { value: 'right-only', label: t['channels.right_only'] },
      { value: 'swap', label: t['channels.swap'] },
    ];
  });

  protected readonly formatOptions = computed<SegmentOption<ChannelOutputFormat>[]>(() => [
    { value: 'wav', label: 'WAV' },
    { value: 'mp3', label: 'MP3' },
  ]);

  protected readonly outputChannels = computed(() =>
    outputChannelCount(this.operation(), this.sourceChannels()),
  );

  /**
   * Quanto os dois canais se cancelam ao virar mono. Medido UMA vez por arquivo
   * e não por mudança de opção: a conta varre o áudio, e o resultado não depende
   * da operação escolhida.
   */
  protected readonly cancellation = computed(() => {
    const buf = this.buffer();
    if (!buf || buf.numberOfChannels < 2) return 0;

    const chans: Float32Array[] = [];
    for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
    return phaseCancellation(chans);
  });

  protected readonly phaseWarning = computed(
    () => this.operation() === 'to-mono' && this.cancellation() > PHASE_WARN,
  );

  protected readonly cancellationPercent = computed(() => Math.round(this.cancellation() * 100));

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  protected readonly canRun = computed(() => !!this.buffer() && !this.busy());

  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() =>
    [this.operation(), this.format(), this.bitrate()].join('|'),
  );

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    hydrateFromWorkspace('audio-channels', (file) => void this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'audio-channels');
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

      // Um mono só tem uma operação possível, e ela não é a padrão.
      this.operation.set(buffer.numberOfChannels >= 2 ? 'to-mono' : 'to-stereo');
    } catch (err) {
      console.error('[AudioChannels] decode failed:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
      this.buffer.set(null);
    } finally {
      this.reading.set(false);
    }
  }

  protected async run(): Promise<void> {
    const buffer = this.buffer();
    if (!buffer) return;

    this.busy.set(true);
    this.errorKey.set(null);

    try {
      const settings = this.settings();

      const res = await this.channelsService.split({
        buffer,
        operation: this.operation(),
        format: this.format(),
        bitrate: this.bitrate(),
      });

      this.resultBlob.set(res.blob);
      this.resultExt.set(res.ext);
      this.ranSettings.set(settings);
      this.pendingTransition.registerResult('audio-channels', res.blob, this.suffix(), res.ext);
    } catch (err) {
      console.error('[AudioChannels] split failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * O sufixo diz QUAL operação produziu o arquivo, e não um genérico "canais".
   * Extrair os dois lados de uma gravação gera dois arquivos que precisam ser
   * distinguíveis na pasta de download sem abrir nenhum dos dois.
   */
  private suffix(): string {
    switch (this.operation()) {
      case 'to-mono':
        return 'mono';
      case 'to-stereo':
        return 'estereo';
      case 'left-only':
        return 'esquerdo';
      case 'right-only':
        return 'direito';
      case 'swap':
        return 'canais-trocados';
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.workspace.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.suffix(), this.resultExt()));
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.file.set(null);
    this.buffer.set(null);
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
