import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { compressFormatFor, compressImage, compressKeepsFormat } from '../../core/image/converters';
import { saveBlob } from '../../core/image/download';
import { extForMime, formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { toMessageKey } from '../../core/errors';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { CompareSliderComponent } from '../../shared/ui/compare-slider.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PreviewSurfaceComponent } from '../../shared/ui/preview-surface.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

@Component({
  selector: 'app-compress',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PreviewSurfaceComponent,
    CompareSliderComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
  ],
  templateUrl: './compress.component.html',
})
export class CompressComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly router = inject(Router);
  private readonly tool = toolById('compress');
  private readonly pendingTransition = inject(PendingTransitionService);

  protected readonly state = inject(WorkspaceService);
  protected readonly i18n = inject(TranslationService);

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly noticeKey = signal<TranslationKey | null>(null);

  /** Maps straight onto the encoder quality. No guesswork about target size. */
  protected readonly quality = signal(75);

  /** The quality the result on screen was encoded at; null while there is no result. */
  private readonly ranQuality = signal<number | null>(null);

  /**
   * Quality is the only input to the run, so re-encoding at the quality already
   * used just reproduces the same file. The button returns as soon as the slider
   * moves — that is what it is for.
   */
  protected readonly stale = computed(() => this.ranQuality() !== this.quality());

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
  protected readonly sourceFile = computed(() => this.state.fileFor('compress'));

  /** What will actually be written — the input's own format, wherever possible. */
  protected readonly outputFormat = computed(() => {
    const file = this.sourceFile();
    return file ? compressFormatFor(file) : null;
  });

  /** Shown next to the note, so the panel names the format it is promising. */
  protected readonly outputLabel = computed(() => this.outputFormat()?.toUpperCase() ?? '');

  /** False for GIF/BMP/AVIF: no browser writes them, so the output must change. */
  protected readonly keepsFormat = computed(() => {
    const file = this.sourceFile();
    return !!file && compressKeepsFormat(file);
  });

  /**
   * PNG has no lossy mode, so there is no quality to trade away and the slider
   * would be a control that changes nothing. Hidden rather than disabled: a
   * greyed-out slider still reads as a promise the format cannot keep.
   */
  protected readonly lossless = computed(() => this.outputFormat() === 'png');

  protected readonly originalSize = computed(() => {
    const file = this.sourceFile();
    return file ? formatBytes(file.size) : '—';
  });

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  /** Null when compression made the file bigger, which happens on small images. */
  protected readonly savings = computed(() => {
    const original = this.sourceFile()?.size;
    const compressed = this.resultBlob()?.size;
    if (!original || !compressed) return null;

    const saved = ((original - compressed) / original) * 100;
    return saved > 0 ? `${saved.toFixed(0)}%` : null;
  });

  constructor() {
    hydrateFromWorkspace('compress', (file) => this.hydrate(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);
    this.noticeKey.set(null);

    try {
      // Só carrega. A prévia e a limpeza do resultado anterior são do hydrate(),
      // que roda tanto para um upload quanto para um arquivo que chegou pela
      // cadeia ou voltou por um desfazer — antes eram três caminhos escrevendo as
      // mesmas duas linhas, e o do desfazer simplesmente não existia.
      this.state.load(file, 'compress');
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

  protected async run(): Promise<void> {
    const file = this.sourceFile();
    if (!file) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.noticeKey.set(null);

    try {
      const quality = this.quality();
      const { blob, keptOriginal } = await compressImage(file, quality / 100);
      this.resultBlob.set(blob);
      this.resultUrl.set(this.urls.replace(this.resultUrl(), blob));
      this.ranQuality.set(quality);

      // Byte-identical output with nothing saying why is the failure the PDF
      // compressor's `cpdf.no_gain` exists to avoid — same reasoning here.
      if (keptOriginal) this.noticeKey.set('compress.no_gain');

      // Register commit for rail/mobile-bar navigation.
      const ext = this.ext();
      this.pendingTransition.registerResult('compress', blob, this.tool.suffix, ext);
    } catch (err) {
      console.error('Compression failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.state.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, this.ext()));
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.sourceUrl.set(null);
    this.resultBlob.set(null);
    this.resultUrl.set(null);
    this.ranQuality.set(null);
    this.errorKey.set(null);
    this.noticeKey.set(null);
    this.state.clear();
  }

  /**
   * Derived from the RESULT's format, never from the source name: a GIF comes
   * back as WebP, and a `.gif` holding WebP bytes is the same lie the AVIF
   * output used to be.
   */
  private ext(): string {
    return extForMime(`image/${this.outputFormat() ?? 'webp'}`);
  }

  private clearResult(): void {
    this.urls.revoke(this.resultUrl());
    this.resultBlob.set(null);
    this.resultUrl.set(null);
    this.ranQuality.set(null);
    this.noticeKey.set(null);
    this.pendingTransition.clear();
  }
}
