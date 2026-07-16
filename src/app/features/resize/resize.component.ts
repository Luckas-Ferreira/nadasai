import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toMessageKey } from '../../core/errors';
import { resizeImage } from '../../core/image/converters';
import { saveBlob } from '../../core/image/download';
import { extForMime, formatBytes, loadImage, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { ImageStateService } from '../../core/services/image-state.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PreviewSurfaceComponent } from '../../shared/ui/preview-surface.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

const MAX_DIMENSION = 10000;
const PRESETS = [1920, 1280, 800, 400] as const;

@Component({
  selector: 'app-resize',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PreviewSurfaceComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    ButtonDirective,
    IconComponent,
  ],
  templateUrl: './resize.component.html',
})
export class ResizeComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly router = inject(Router);
  private readonly tool = toolById('resize');

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);
  protected readonly presets = PRESETS;

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly sourceWidth = signal(0);
  protected readonly sourceHeight = signal(0);
  protected readonly width = signal(0);
  protected readonly height = signal(0);
  protected readonly lockAspect = signal(true);

  protected readonly sourceFile = this.state.currentFile;

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  protected readonly canRun = computed(
    () => this.width() > 0 && this.height() > 0 && !!this.sourceFile(),
  );

  /** The dimensions the result on screen was rendered at; null while there is no result. */
  private readonly ranDimensions = signal<string | null>(null);

  /**
   * Width and height are the only inputs to the run, so resizing to the size that
   * is already on screen just repeats it. The button returns as soon as a field
   * or a preset changes the numbers.
   */
  protected readonly stale = computed(() => this.ranDimensions() !== this.dimensions());

  private readonly dimensions = computed(() => `${this.width()}x${this.height()}`);

  constructor() {
    const file = this.sourceFile();
    if (file) void this.hydrate(file);
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.state.load(file);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
      return;
    }

    this.clearResult();
    void this.hydrate(file);
  }

  private async hydrate(file: File): Promise<void> {
    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));

    try {
      const img = await loadImage(file);
      this.sourceWidth.set(img.naturalWidth);
      this.sourceHeight.set(img.naturalHeight);
      this.width.set(img.naturalWidth);
      this.height.set(img.naturalHeight);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  /**
   * The aspect-ratio maths divides by the source dimensions, which are 0 until
   * the image has decoded — typing into a field before that used to put NaN in
   * the other one and silently break the resize.
   */
  protected setWidth(value: number): void {
    const next = this.clamp(value);
    this.width.set(next);

    if (this.lockAspect() && this.sourceWidth() > 0) {
      const ratio = this.sourceHeight() / this.sourceWidth();
      this.height.set(this.clamp(Math.round(next * ratio)));
    }
  }

  protected setHeight(value: number): void {
    const next = this.clamp(value);
    this.height.set(next);

    if (this.lockAspect() && this.sourceHeight() > 0) {
      const ratio = this.sourceWidth() / this.sourceHeight();
      this.width.set(this.clamp(Math.round(next * ratio)));
    }
  }

  protected applyPreset(longestSide: number): void {
    if (this.sourceWidth() >= this.sourceHeight()) this.setWidth(longestSide);
    else this.setHeight(longestSide);
  }

  protected toggleLock(): void {
    this.lockAspect.update((locked) => !locked);
  }

  protected async run(): Promise<void> {
    const file = this.sourceFile();
    if (!file || !this.canRun()) return;

    this.busy.set(true);
    this.errorKey.set(null);

    try {
      const dimensions = this.dimensions();
      const blob = await resizeImage(file, { width: this.width(), height: this.height() });
      this.resultBlob.set(blob);
      this.resultUrl.set(this.urls.replace(this.resultUrl(), blob));
      this.ranDimensions.set(dimensions);
    } catch (err) {
      console.error('Resize failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.state.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, extForMime(blob.type)));
  }

  protected continueEdit(): void {
    const blob = this.resultBlob();
    if (!blob) return;

    try {
      this.state.apply('resize', blob, this.tool.suffix, extForMime(blob.type));
      this.router.navigate(['/']);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.sourceUrl.set(null);
    this.sourceWidth.set(0);
    this.sourceHeight.set(0);
    this.width.set(0);
    this.height.set(0);
    this.resultBlob.set(null);
    this.resultUrl.set(null);
    this.ranDimensions.set(null);
    this.errorKey.set(null);
    this.state.clear();
  }

  private clearResult(): void {
    this.urls.revoke(this.resultUrl());
    this.resultBlob.set(null);
    this.resultUrl.set(null);
    this.ranDimensions.set(null);
  }

  private clamp(value: number): number {
    if (!Number.isFinite(value)) return 1;
    return Math.min(MAX_DIMENSION, Math.max(1, Math.round(value)));
  }
}
