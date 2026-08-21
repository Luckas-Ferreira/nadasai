import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { RemoveSilenceService, type SilenceOutputFormat } from './services/remove-silence.service';

@Component({
  selector: 'app-remove-silence',
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
  templateUrl: './remove-silence.component.html',
})
export class RemoveSilenceComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly silence = inject(RemoveSilenceService);
  private readonly converter = inject(AudioConverterService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('remove-silence');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly buffer = signal<AudioBuffer | null>(null);
  protected readonly reading = signal(false);

  protected readonly thresholdDb = signal(-45);
  protected readonly minSilenceSeconds = signal(0.7);
  protected readonly keepPadding = signal(0.06);
  protected readonly format = signal<SilenceOutputFormat>('wav');

  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultExt = signal('wav');
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly formatOptions = computed<SegmentOption<SilenceOutputFormat>[]>(() => [
    { value: 'wav', label: 'WAV' },
    { value: 'mp3', label: 'MP3' },
  ]);

  protected readonly sourceDuration = computed(() => this.buffer()?.duration ?? 0);

  /**
   * A ANÁLISE roda a cada mudança de controle e o corte não. É o que faz a
   * ferramenta ser ajustável: mexer no limiar mostra imediatamente quantos
   * trechos seriam removidos e quanto tempo sobraria, sem esperar a cópia de
   * dezenas de milhões de amostras.
   *
   * A conta é O(amostras) e roda em milissegundos até numa gravação longa —
   * é uma varredura de RMS em janela, não uma reamostragem.
   */
  protected readonly analysis = computed(() => {
    const buf = this.buffer();
    if (!buf) return null;

    return this.silence.analyse(buf, {
      thresholdDb: this.thresholdDb(),
      minSilenceSeconds: this.minSilenceSeconds(),
      keepPadding: this.keepPadding(),
    });
  });

  protected readonly removedSeconds = computed(() => {
    const a = this.analysis();
    const buf = this.buffer();
    return a && buf ? a.removedFrames / buf.sampleRate : 0;
  });

  protected readonly newDuration = computed(() => this.sourceDuration() - this.removedSeconds());

  protected readonly removedPercent = computed(() => {
    const total = this.sourceDuration();
    return total > 0 ? Math.round((this.removedSeconds() / total) * 100) : 0;
  });

  protected readonly cuts = computed(() => this.analysis()?.silenceCount ?? 0);

  protected readonly sourceClock = computed(() => formatClock(this.sourceDuration()));
  protected readonly newClock = computed(() => formatClock(this.newDuration()));
  protected readonly removedClock = computed(() => formatClock(this.removedSeconds()));

  /** Nada a remover não é erro: é a resposta, e o painel a diz em vez de rodar. */
  protected readonly nothingToRemove = computed(() => !!this.buffer() && this.cuts() === 0);

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  protected readonly canRun = computed(() => !!this.buffer() && !this.nothingToRemove());

  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() =>
    [this.thresholdDb(), this.minSilenceSeconds(), this.keepPadding(), this.format()].join('|'),
  );

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    hydrateFromWorkspace('remove-silence', (file) => void this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'remove-silence');
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
    } catch (err) {
      console.error('[RemoveSilence] decode failed:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
      this.buffer.set(null);
    } finally {
      this.reading.set(false);
    }
  }

  protected async run(): Promise<void> {
    const buffer = this.buffer();
    if (!buffer || !this.canRun()) return;

    this.busy.set(true);
    this.progress.set(0);
    this.errorKey.set(null);

    try {
      const settings = this.settings();

      const res = await this.silence.remove({
        buffer,
        thresholdDb: this.thresholdDb(),
        minSilenceSeconds: this.minSilenceSeconds(),
        keepPadding: this.keepPadding(),
        format: this.format(),
        bitrate: 192,
        onProgress: (p) => this.progress.set(p),
      });

      this.resultBlob.set(res.blob);
      this.resultExt.set(res.ext);
      this.ranSettings.set(settings);
      this.pendingTransition.registerResult('remove-silence', res.blob, this.tool.suffix, res.ext);
    } catch (err) {
      console.error('[RemoveSilence] failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.workspace.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, this.resultExt()));
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.file.set(null);
    this.buffer.set(null);
    this.thresholdDb.set(-45);
    this.minSilenceSeconds.set(0.7);
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
