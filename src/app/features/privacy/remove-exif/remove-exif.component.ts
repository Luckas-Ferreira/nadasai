import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslationService } from '../../../core/services/translation.service';
import { toolById } from '../../../core/tools/tools';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { saveBlob } from '../../../core/image/download';
import { formatBytes } from '../../../core/image/image-file.util';

@Component({
  selector: 'app-remove-exif',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToolPageComponent, DropzoneComponent, PanelComponent, ButtonDirective, IconComponent],
  template: `
    <app-tool-page [toolId]="'remove-exif'" [forceLoaded]="!!selectedFile()">

      <!-- STAGE: dropzone or image preview -->
      <div stage>
        @if (!selectedFile()) {
          <app-dropzone
            [accept]="'image/jpeg,image/png,image/webp,image/tiff'"
            [titleKey]="'exif.drag'"
            [hintKey]="'exif.drag_hint'"
            (fileSelected)="onFileSelected($event)"
          />
        } @else {
          <!-- Image preview surface -->
          <div class="overflow-hidden rounded-xl border border-line bg-raised">
            @if (previewUrl()) {
              <div class="flex items-center justify-center bg-checker p-4">
                <img
                  [src]="previewUrl()"
                  [alt]="selectedFile()?.name"
                  class="max-h-[50vh] w-auto rounded-md object-contain shadow-panel"
                />
              </div>
            }

            <!-- File info bar -->
            <div class="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-text">{{ selectedFile()?.name }}</p>
                <p class="font-mono text-xs text-faint">{{ formatBytes(selectedFile()?.size || 0) }}</p>
              </div>
              <button type="button" appButton variant="ghost" size="sm" (click)="clear()">
                <app-icon name="close" [size]="14" />
                {{ i18n.t()['common.clear'] }}
              </button>
            </div>
          </div>
        }
      </div>

      <!-- PANEL: metadata alert + action -->
      <div panel class="flex flex-col gap-4">
        @if (selectedFile()) {
          <app-panel>
            <div class="space-y-4">
              <!-- Metadata warning -->
              <div class="rounded-lg border border-danger-line bg-danger-soft p-4 space-y-1.5">
                <div class="flex items-center gap-2 text-sm font-semibold text-danger">
                  <app-icon name="eyeOff" [size]="16" />
                  <span>{{ i18n.t()['exif.detected_title'] }}</span>
                </div>
                <p class="text-xs text-danger/80 leading-relaxed">
                  {{ i18n.t()['exif.detected_desc'] }}
                </p>
              </div>

              <!-- Action button -->
              <button
                type="button"
                appButton
                variant="primary"
                size="lg"
                block
                [busy]="busy()"
                (click)="cleanAndDownload()"
              >
                <app-icon name="sparkles" [size]="16" />
                <span>{{ i18n.t()['exif.btn_clean'] }}</span>
              </button>
            </div>
          </app-panel>

          <div class="mt-1 flex justify-center border-t border-line pt-2">
            <button appButton variant="ghost" size="sm" (click)="clear()">
              {{ i18n.t()['common.reset'] }}
            </button>
          </div>
        }
      </div>

    </app-tool-page>
  `,
})
export class RemoveExifComponent {
  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('remove-exif');
  protected readonly formatBytes = formatBytes;

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected onFileSelected(f: File): void {
    this.selectedFile.set(f);
    this.previewUrl.set(URL.createObjectURL(f));
  }

  protected async cleanAndDownload(): Promise<void> {
    const f = this.selectedFile();
    if (!f) return;

    this.busy.set(true);
    try {
      const img = new Image();
      img.src = URL.createObjectURL(f);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unsupported');

      ctx.drawImage(img, 0, 0);

      const mime = f.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.95));

      if (blob) {
        saveBlob(blob, f.name.replace(/(\.[^.]+)$/, '-noexif$1'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      this.busy.set(false);
    }
  }

  protected clear(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.selectedFile.set(null);
    this.previewUrl.set(null);
  }
}
