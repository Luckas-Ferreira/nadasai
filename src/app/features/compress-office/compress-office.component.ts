import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  OfficeCompressorService,
  type OfficeCompressLevel,
  type OfficeScan,
} from './services/office-compressor.service';

@Component({
  selector: 'app-compress-office',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    SegmentedComponent,
  ],
  templateUrl: './compress-office.component.html',
})
export class CompressOfficeComponent {
  private readonly compressor = inject(OfficeCompressorService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('compress-office');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly scan = signal<OfficeScan | null>(null);
  protected readonly reading = signal(false);

  protected readonly level = signal<OfficeCompressLevel>('balanced');

  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly rewritten = signal(0);
  protected readonly keptOriginal = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly levelOptions = computed<SegmentOption<OfficeCompressLevel>[]>(() => [
    { value: 'high', label: this.i18n.t()['compoffice.level_high'] },
    { value: 'balanced', label: this.i18n.t()['compoffice.level_balanced'] },
    { value: 'low', label: this.i18n.t()['compoffice.level_low'] },
  ]);

  protected readonly imageCount = computed(() => this.scan()?.media.length ?? 0);

  protected readonly imageWeight = computed(() => {
    const scan = this.scan();
    if (!scan) return '—';
    return `${formatBytes(scan.mediaBytes)} · ${Math.round(scan.share * 100)}%`;
  });

  protected readonly originalSize = computed(() => {
    const file = this.file();
    return file ? formatBytes(file.size) : '—';
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  /**
   * Sem imagem recomprimível não há o que fazer, e a tela diz por quê.
   *
   * O caso não é raro: um `.docx` só de texto, ou — mais comum — um cujas
   * figuras são EMF e WMF, os formatos vetoriais que o Word grava quando se
   * cola um gráfico. Deixar o botão ativo ali entregaria o mesmo arquivo depois
   * de uma espera.
   */
  protected readonly nothingToDo = computed(() => !!this.scan() && this.imageCount() === 0);

  protected readonly canRun = computed(
    () => !!this.scan() && !this.nothingToDo() && !this.busy() && !this.reading(),
  );

  private readonly ranSettings = signal<string | null>(null);
  protected readonly stale = computed(() => this.ranSettings() !== this.level());

  constructor() {
    hydrateFromWorkspace('compress-office', (file) => void this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'compress-office');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async load(file: File | null): Promise<void> {
    this.clearResult();

    if (!file) {
      this.file.set(null);
      this.scan.set(null);
      return;
    }

    this.reading.set(true);

    try {
      // Abrir o zip e MEDIR é barato — nada é decodificado aqui. É o que deixa
      // o painel mostrar quantas imagens existem e quanto do arquivo elas são
      // antes de a pessoa decidir qualquer coisa.
      this.scan.set(await this.compressor.scan(file));
      this.file.set(file);
    } catch (err) {
      console.error('[CompressOffice] could not read the file:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
      this.scan.set(null);
    } finally {
      this.reading.set(false);
    }
  }

  protected setLevel(value: OfficeCompressLevel): void {
    this.level.set(value);
    this.clearResult();
  }

  protected async run(): Promise<void> {
    const file = this.file();
    const scan = this.scan();
    if (!file || !scan || !this.canRun()) return;

    this.busy.set(true);
    this.progress.set(0);
    this.errorKey.set(null);

    try {
      const level = this.level();

      const result = await this.compressor.compress(file, scan, level, (done, total) =>
        this.progress.set(Math.round((done / total) * 100)),
      );

      this.resultBlob.set(result.blob);
      this.rewritten.set(result.rewritten);
      this.keptOriginal.set(result.keptOriginal);
      this.ranSettings.set(level);
      this.pendingTransition.registerResult(
        'compress-office',
        result.blob,
        this.tool.suffix,
        result.ext,
      );
    } catch (err) {
      console.error('[CompressOffice] compress failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.workspace.session();
    const scan = this.scan();
    if (!blob || !session || !scan) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, scan.kind));
  }

  protected reset(): void {
    this.file.set(null);
    this.scan.set(null);
    this.clearResult();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private clearResult(): void {
    this.resultBlob.set(null);
    this.rewritten.set(0);
    this.keptOriginal.set(false);
    this.ranSettings.set(null);
    this.pendingTransition.clear();
  }
}
