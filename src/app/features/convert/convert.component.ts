import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { pairById } from '../../core/seo/format-pairs';
import { Router } from '@angular/router';
import { toMessageKey } from '../../core/errors';
import {
  MIME_FOR_TARGET,
  TARGET_FORMATS,
  TERMINAL_FORMATS,
  type TargetFormat,
  encodeIco,
  encodeImage,
  encodePdf,
} from '../../core/image/converters';
import { saveBlob } from '../../core/image/download';
import { extForMime, formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PreviewSurfaceComponent } from '../../shared/ui/preview-surface.component';
import { SegmentedComponent } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

@Component({
  selector: 'app-convert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PreviewSurfaceComponent,
    PanelComponent,
    SegmentedComponent,
    ActionBarComponent,
    AlertComponent,
  ],
  templateUrl: './convert.component.html',
})
export class ConvertComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly router = inject(Router);
  private readonly tool = toolById('convert');
  private readonly pendingTransition = inject(PendingTransitionService);

  protected readonly state = inject(WorkspaceService);
  protected readonly i18n = inject(TranslationService);

  protected readonly formatOptions = TARGET_FORMATS.map((value) => ({ value, label: value }));
  protected readonly backdropOptions = [
    { value: '#ffffff', label: '#FFF' },
    { value: '#000000', label: '#000' },
  ];

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly format = signal<TargetFormat>('WEBP');
  /**
   * A página de par de formato (/png-para-jpg e as outras) abre ESTA
   * ferramenta, com o destino já escolhido. O par vem do `data` da rota, lido
   * do snapshot: o componente é criado por ativação de rota, então o snapshot é
   * o certo — e é o único caminho que também funciona dentro do prerender, onde
   * não há navegação nenhuma.
   *
   * Chegar já com o formato marcado é metade do valor da página: quem buscou
   * "png para jpg" não deveria ter de escolher JPG de novo ao chegar.
   */
  protected readonly pair = pairById(
    (inject(ActivatedRoute).snapshot.data['pairId'] as string | undefined) ?? '',
  );

  private applyPairPreset(): void {
    if (this.pair) this.format.set(this.pair.target as TargetFormat);
  }

  protected readonly pdfBackground = signal('#ffffff');

  /**
   * A porta de hidratação. `currentFile()` devolve a sessão seja ela qual for —
   * e desde que a sessão é uma só, ela pode estar segurando um PDF (img-to-pdf)
   * ou um vídeo. `fileFor` só entrega quando o `accepts` da ferramenta cobre o
   * tipo, que é a mesma garantia que o serviço antigo dava recusando o `apply`,
   * só que do lado certo: quem não abre o arquivo é quem tem de recusá-lo.
   *
   * Sendo um `computed` sobre a sessão, ele também reage ao desfazer — que é o
   * que permitiu tirar o `navigate(['/'])` da barra de arquivo.
   */
  protected readonly sourceFile = computed(() => this.state.fileFor('convert'));

  /** PDF and ICO are not images, so they cannot re-enter the editing chain. */
  protected readonly isTerminal = computed(() => TERMINAL_FORMATS.includes(this.format()));

  /** PDF has no <img> preview, so the stage keeps showing the source. */
  protected readonly previewUrl = computed(() =>
    this.format() === 'PDF' ? this.sourceUrl() : (this.resultUrl() ?? this.sourceUrl()),
  );

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : null;
  });

  /**
   * Everything the encode reads. The backdrop only reaches the output for PDF, so
   * it is left out otherwise — recolouring it while WEBP is selected changes
   * nothing and must not offer a re-run.
   */
  private readonly settings = computed(() =>
    this.format() === 'PDF' ? `PDF:${this.pdfBackground()}` : this.format(),
  );

  /** The settings the result on screen was encoded with; null while there is no result. */
  private readonly ranSettings = signal<string | null>(null);

  /**
   * Picking a format already clears the result, so without this the button sat
   * there re-encoding the same bytes on every press.
   */
  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    this.applyPairPreset();
    hydrateFromWorkspace('convert', (file) => this.hydrate(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.state.load(file, 'convert');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private hydrate(file: File | null): void {
    this.clearResult();

    if (!file) {
      this.urls.revoke(this.sourceUrl());
      this.sourceUrl.set(null);
      return;
    }

    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));
  }

  protected onFormatChange(format: TargetFormat): void {
    this.format.set(format);
    this.clearResult();
  }

  protected async run(): Promise<void> {
    const file = this.sourceFile();
    if (!file) return;

    this.busy.set(true);
    this.errorKey.set(null);

    try {
      const settings = this.settings();
      const blob = await this.encode(file);
      this.resultBlob.set(blob);
      this.resultUrl.set(this.urls.replace(this.resultUrl(), blob));
      this.ranSettings.set(settings);

      // Only register a commit when the output is a raster image, not PDF/ICO.
      if (!this.isTerminal()) {
        const ext = extForMime(MIME_FOR_TARGET[this.format()]);
        this.pendingTransition.registerResult('convert', blob, this.tool.suffix, ext);
      } else {
        this.pendingTransition.clear();
      }
    } catch (err) {
      console.error('Conversion failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  private encode(file: File): Promise<Blob> {
    switch (this.format()) {
      case 'PDF':
        return encodePdf(file, this.pdfBackground());
      case 'ICO':
        return encodeIco(file);
      case 'PNG':
        return encodeImage(file, 'png');
      case 'JPEG':
        return encodeImage(file, 'jpeg', 0.92);
      case 'WEBP':
        return encodeImage(file, 'webp', 0.9);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.state.session();
    if (!blob || !session) return;

    const ext = extForMime(MIME_FOR_TARGET[this.format()]);
    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, ext));
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.sourceUrl.set(null);
    this.resultBlob.set(null);
    this.resultUrl.set(null);
    this.ranSettings.set(null);
    this.errorKey.set(null);
    this.format.set('WEBP');
    this.state.clear();
  }

  private clearResult(): void {
    this.urls.revoke(this.resultUrl());
    this.resultBlob.set(null);
    this.resultUrl.set(null);
    this.ranSettings.set(null);
    this.pendingTransition.clear();
  }
}
