import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { saveBlob } from '../../core/image/download';
import { extForMime, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { toMessageKey } from '../../core/errors';
import { ImageStateService } from '../../core/services/image-state.service';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { type ToolDef, chainableImageTools, toolById, toolPath } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { CompareSliderComponent } from '../../shared/ui/compare-slider.component';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PreviewSurfaceComponent } from '../../shared/ui/preview-surface.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { ScaleFactor, SharpnessLevel, UpscaleResult, UpscaleService } from './services/upscale.service';

@Component({
  selector: 'app-upscale',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    DecimalPipe,
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PreviewSurfaceComponent,
    CompareSliderComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
  ],
  templateUrl: './upscale.component.html',
})
export class UpscaleComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly router = inject(Router);
  protected readonly tool = toolById('upscale');
  private readonly upscaler = inject(UpscaleService);
  private readonly pendingTransition = inject(PendingTransitionService);

  protected readonly state = inject(ImageStateService);
  protected readonly i18n = inject(TranslationService);

  protected readonly nextTools = computed<readonly ToolDef[]>(() => chainableImageTools('upscale'));

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly result = signal<UpscaleResult | null>(null);
  protected readonly resultUrl = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly progress = signal(0);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly scale = signal<ScaleFactor>(2);
  protected readonly sharpness = signal<SharpnessLevel>('balanced');
  protected readonly denoise = signal<boolean>(true);
  protected readonly aiStrength = signal<number>(1.4);

  protected readonly sourceFile = this.state.currentFile;

  protected readonly originalDimensions = computed(() => {
    const res = this.result();
    return res ? `${res.originalWidth} × ${res.originalHeight} px` : '—';
  });

  protected readonly newDimensions = computed(() => {
    const res = this.result();
    return res ? `${res.newWidth} × ${res.newHeight} px` : '—';
  });

  constructor() {
    const file = this.sourceFile();
    if (file) {
      this.sourceUrl.set(this.urls.create(file));
      void this.runUpscale();
    }
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);
    try {
      this.state.load(file);
      this.sourceUrl.set(this.urls.create(file));
      this.result.set(null);
      this.resultUrl.set(null);
      void this.runUpscale();
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected async runUpscale(): Promise<void> {
    const file = this.sourceFile();
    if (!file || this.busy()) return;

    this.busy.set(true);
    this.errorKey.set(null);
    this.progress.set(0);

    try {
      const res = await this.upscaler.upscaleImage(
        file,
        {
          scale: this.scale(),
          sharpness: this.sharpness(),
          denoise: this.denoise(),
          aiStrength: this.aiStrength(),
        },
        (pct) => this.progress.set(pct)
      );
      this.result.set(res);
      this.resultUrl.set(res.dataUrl);

      // Register pending commit for rail/mobile-bar navigation.
      const original = this.sourceFile();
      if (original) {
        const ext = extForMime(original.type) || 'png';
        const mimeType = original.type === 'image/png' ? 'image/png' : 'image/jpeg';
        this.pendingTransition.register(() => {
          const nextFile = new File(
            [res.blob],
            suffixedName(original.name, this.tool.suffix, ext),
            { type: mimeType },
          );
          try {
            this.state.load(nextFile);
            return true;
          } catch {
            return false;
          }
        });
      }
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const file = this.sourceFile();
    const res = this.result();
    if (!file || !res) return;

    const ext = extForMime(file.type) || 'png';
    saveBlob(res.blob, suffixedName(file.name, this.tool.suffix, ext));
  }

  protected continueEdit(): void {
    const res = this.result();
    const original = this.sourceFile();
    if (!res || !original) return;

    const ext = extForMime(original.type) || 'png';
    const mimeType = original.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const nextFile = new File([res.blob], suffixedName(original.name, this.tool.suffix, ext), {
      type: mimeType,
    });
    this.state.load(nextFile);
    this.pendingTransition.clear();
    void this.router.navigateByUrl(`/${this.i18n.currentLang()}`);
  }

  protected goToTool(tool: ToolDef): void {
    const res = this.result();
    const original = this.sourceFile();
    if (!res || !original) return;

    const ext = extForMime(original.type) || 'png';
    const mimeType = original.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const nextFile = new File([res.blob], suffixedName(original.name, this.tool.suffix, ext), {
      type: mimeType,
    });
    try {
      this.state.load(nextFile);
      this.pendingTransition.clear();
      const lang = this.i18n.currentLang();
      void this.router.navigate([`/${lang}/${toolPath(tool, lang)}`]);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected reset(): void {
    this.result.set(null);
    this.resultUrl.set(null);
    this.sourceUrl.set(null);
    this.pendingTransition.clear();
    this.state.clear();
  }
}
