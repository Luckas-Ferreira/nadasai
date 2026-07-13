import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { compressImage } from '../../core/image/converters';
import { saveBlob } from '../../core/image/download';
import { formatBytes, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { toMessageKey } from '../../core/errors';
import { ImageStateService } from '../../core/services/image-state.service';
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

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  /** Maps straight onto WebP encoder quality. No guesswork about target size. */
  protected readonly quality = signal(75);

  protected readonly sourceFile = this.state.currentFile;

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

  protected async run(): Promise<void> {
    const file = this.sourceFile();
    if (!file) return;

    this.busy.set(true);
    this.errorKey.set(null);

    try {
      const blob = await compressImage(file, this.quality() / 100);
      this.resultBlob.set(blob);
      this.resultUrl.set(this.urls.replace(this.resultUrl(), blob));
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

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, 'webp'));
  }

  protected continueEdit(): void {
    const blob = this.resultBlob();
    if (!blob) return;

    try {
      this.state.apply('compress', blob, this.tool.suffix, 'webp');
      this.router.navigate(['/']);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.sourceUrl.set(null);
    this.resultBlob.set(null);
    this.resultUrl.set(null);
    this.errorKey.set(null);
    this.state.clear();
  }

  private clearResult(): void {
    this.urls.revoke(this.resultUrl());
    this.resultBlob.set(null);
    this.resultUrl.set(null);
  }
}
