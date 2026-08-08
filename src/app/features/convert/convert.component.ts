import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { ImageStateService } from '../../core/services/image-state.service';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { type ToolDef, chainableImageTools, toolById, toolPath } from '../../core/tools/tools';
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

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);

  /** Only non-terminal formats re-enter the image chain (not PDF or ICO). */
  protected readonly nextTools = computed<readonly ToolDef[]>(() =>
    this.isTerminal() ? [] : chainableImageTools('convert'),
  );

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
  protected readonly pdfBackground = signal('#ffffff');

  protected readonly sourceFile = this.state.currentFile;

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
    const file = this.sourceFile();
    if (file) this.sourceUrl.set(this.urls.create(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.state.load(file);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
      return;
    }

    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));
    this.clearResult();
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
        this.pendingTransition.register(() => {
          try {
            this.state.apply('convert', blob, this.tool.suffix, ext);
            return true;
          } catch {
            return false;
          }
        });
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

  protected continueEdit(): void {
    const blob = this.resultBlob();
    if (!blob || this.isTerminal()) return;

    try {
      const ext = extForMime(MIME_FOR_TARGET[this.format()]);
      this.state.apply('convert', blob, this.tool.suffix, ext);
      this.pendingTransition.clear();
      this.router.navigate(['/' + this.i18n.currentLang()]);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected goToTool(tool: ToolDef): void {
    const blob = this.resultBlob();
    if (!blob || this.isTerminal()) return;

    try {
      const ext = extForMime(MIME_FOR_TARGET[this.format()]);
      this.state.apply('convert', blob, this.tool.suffix, ext);
      this.pendingTransition.clear();
      const lang = this.i18n.currentLang();
      void this.router.navigate([`/${lang}/${toolPath(tool, lang)}`]);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
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
