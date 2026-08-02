import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../../core/services/translation.service';
import { toolById } from '../../../core/tools/tools';
import { ToolPageComponent } from '../../../shared/ui/tool-page.component';
import { DropzoneComponent } from '../../../shared/ui/dropzone.component';
import { PanelComponent } from '../../../shared/ui/panel.component';
import { ButtonDirective } from '../../../shared/ui/button.directive';
import { SegmentedComponent, type SegmentOption } from '../../../shared/ui/segmented.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { saveBlob } from '../../../core/image/download';

interface RedactBox {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: 'black' | 'blur';
}

@Component({
  selector: 'app-redact-image',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ButtonDirective,
    SegmentedComponent,
    IconComponent,
  ],
  template: `
    <app-tool-page [toolId]="'redact-image'" [forceLoaded]="!!selectedFile()">

      <!-- STAGE: dropzone or canvas -->
      <div stage>
        @if (!selectedFile()) {
          <app-dropzone
            [accept]="'image/jpeg,image/png,image/webp'"
            [titleKey]="'redact.drag'"
            [hintKey]="'redact.drag_hint'"
            (fileSelected)="onFileSelected($event)"
          />
        } @else {
          <!-- Canvas area -->
          <div class="overflow-hidden rounded-xl border border-line bg-raised">
            <!-- Hint bar -->
            <div class="flex items-center gap-2 border-b border-line bg-surface px-4 py-2.5 text-xs text-muted">
              <app-icon name="brush" [size]="14" class="text-faint" />
              <span>{{ i18n.t()['redact.hint'] }}</span>
            </div>

            <div class="flex justify-center overflow-auto p-4">
              <canvas
                #canvas
                (mousedown)="startDrag($event)"
                (mousemove)="onDrag($event)"
                (mouseup)="endDrag()"
                (touchstart)="startDragTouch($event)"
                (touchmove)="onDragTouch($event)"
                (touchend)="endDrag()"
                class="max-w-full cursor-crosshair rounded-md border border-line shadow-panel"
              ></canvas>
            </div>
          </div>
        }
      </div>

      <!-- PANEL: controls -->
      <div panel class="flex flex-col gap-4">
        @if (selectedFile()) {
          <app-panel [heading]="i18n.t()['redact.mode_black']">
            <div class="space-y-4">
              <!-- Mode selector -->
              <app-segmented [options]="modeOptions" [(value)]="mode" />

              <!-- Boxes counter -->
              <div class="flex items-center justify-between rounded-md border border-line bg-raised px-3 py-2 text-sm">
                <span class="text-muted">{{ i18n.t()['redact.boxes_count'] }}</span>
                <span class="font-mono font-bold text-accent">{{ boxes().length }}</span>
              </div>

              <!-- Undo / Clear -->
              <div class="flex gap-2">
                <button
                  type="button"
                  appButton
                  variant="secondary"
                  size="md"
                  class="flex-1"
                  (click)="undoBox()"
                  [disabled]="boxes().length === 0"
                >
                  <app-icon name="undo" [size]="14" />
                  {{ i18n.t()['redact.undo'] }}
                </button>
                <button
                  type="button"
                  appButton
                  variant="ghost"
                  size="md"
                  class="flex-1"
                  (click)="clearAll()"
                  [disabled]="boxes().length === 0"
                >
                  {{ i18n.t()['redact.clear'] }}
                </button>
              </div>

              <!-- Export -->
              <button
                type="button"
                appButton
                variant="primary"
                size="lg"
                block
                (click)="exportImage()"
              >
                <app-icon name="download" [size]="16" />
                <span>{{ i18n.t()['redact.btn_export'] }}</span>
              </button>
            </div>
          </app-panel>

          <div class="mt-1 flex justify-center border-t border-line pt-2">
            <button appButton variant="ghost" size="sm" (click)="reset()">
              {{ i18n.t()['common.reset'] }}
            </button>
          </div>
        }
      </div>

    </app-tool-page>
  `,
})
export class RedactImageComponent {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  protected readonly i18n = inject(TranslationService);
  protected readonly tool = toolById('redact-image');

  protected readonly selectedFile = signal<File | null>(null);
  protected readonly mode = signal<'black' | 'blur'>('black');
  protected readonly modeOptions: readonly SegmentOption<'black' | 'blur'>[] = [
    { value: 'black', label: 'Tarja Preta' },
    { value: 'blur', label: 'Blur' },
  ];

  protected readonly boxes = signal<RedactBox[]>([]);

  private imgElement: HTMLImageElement | null = null;
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;

  protected async onFileSelected(f: File): Promise<void> {
    this.selectedFile.set(f);
    this.boxes.set([]);
    const img = new Image();
    img.src = URL.createObjectURL(f);
    await new Promise((resolve) => (img.onload = resolve));
    this.imgElement = img;
    setTimeout(() => this.redrawCanvas(), 50);
  }

  protected startDrag(e: MouseEvent): void {
    if (!this.canvasRef) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = this.canvasRef.nativeElement.width / rect.width;
    const scaleY = this.canvasRef.nativeElement.height / rect.height;
    this.isDragging = true;
    this.startX = (e.clientX - rect.left) * scaleX;
    this.startY = (e.clientY - rect.top) * scaleY;
    this.currentX = this.startX;
    this.currentY = this.startY;
  }

  protected startDragTouch(e: TouchEvent): void {
    e.preventDefault();
    if (!this.canvasRef || !e.touches[0]) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = this.canvasRef.nativeElement.width / rect.width;
    const scaleY = this.canvasRef.nativeElement.height / rect.height;
    this.isDragging = true;
    this.startX = (e.touches[0].clientX - rect.left) * scaleX;
    this.startY = (e.touches[0].clientY - rect.top) * scaleY;
    this.currentX = this.startX;
    this.currentY = this.startY;
  }

  protected onDrag(e: MouseEvent): void {
    if (!this.isDragging || !this.canvasRef) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = this.canvasRef.nativeElement.width / rect.width;
    const scaleY = this.canvasRef.nativeElement.height / rect.height;
    this.currentX = (e.clientX - rect.left) * scaleX;
    this.currentY = (e.clientY - rect.top) * scaleY;
    this.redrawCanvas();
  }

  protected onDragTouch(e: TouchEvent): void {
    e.preventDefault();
    if (!this.isDragging || !this.canvasRef || !e.touches[0]) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = this.canvasRef.nativeElement.width / rect.width;
    const scaleY = this.canvasRef.nativeElement.height / rect.height;
    this.currentX = (e.touches[0].clientX - rect.left) * scaleX;
    this.currentY = (e.touches[0].clientY - rect.top) * scaleY;
    this.redrawCanvas();
  }

  protected endDrag(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    const x = Math.min(this.startX, this.currentX);
    const y = Math.min(this.startY, this.currentY);
    const w = Math.abs(this.currentX - this.startX);
    const h = Math.abs(this.currentY - this.startY);
    if (w > 5 && h > 5) {
      this.boxes.update((b) => [...b, { x, y, w, h, mode: this.mode() }]);
    }
    this.redrawCanvas();
  }

  private redrawCanvas(): void {
    if (!this.canvasRef || !this.imgElement) return;
    const canvas = this.canvasRef.nativeElement;
    canvas.width = this.imgElement.naturalWidth;
    canvas.height = this.imgElement.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.imgElement, 0, 0);

    for (const b of this.boxes()) {
      if (b.mode === 'black') {
        ctx.fillStyle = '#000000';
        ctx.fillRect(b.x, b.y, b.w, b.h);
      } else {
        const sampleSize = 12;
        const subW = Math.max(1, Math.floor(b.w / sampleSize));
        const subH = Math.max(1, Math.floor(b.h / sampleSize));
        const offCanvas = document.createElement('canvas');
        offCanvas.width = subW;
        offCanvas.height = subH;
        const offCtx = offCanvas.getContext('2d');
        if (offCtx) {
          offCtx.drawImage(canvas, b.x, b.y, b.w, b.h, 0, 0, subW, subH);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(offCanvas, 0, 0, subW, subH, b.x, b.y, b.w, b.h);
        }
      }
    }

    if (this.isDragging) {
      const x = Math.min(this.startX, this.currentX);
      const y = Math.min(this.startY, this.currentY);
      const w = Math.abs(this.currentX - this.startX);
      const h = Math.abs(this.currentY - this.startY);
      ctx.strokeStyle = 'rgba(99,102,241,0.9)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }

  protected undoBox(): void {
    this.boxes.update((b) => b.slice(0, -1));
    this.redrawCanvas();
  }

  protected clearAll(): void {
    this.boxes.set([]);
    this.redrawCanvas();
  }

  protected async exportImage(): Promise<void> {
    if (!this.canvasRef || !this.selectedFile()) return;
    const canvas = this.canvasRef.nativeElement;
    const f = this.selectedFile()!;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, f.type || 'image/png'));
    if (blob) saveBlob(blob, f.name.replace(/(\.[^.]+)$/, '-redacted$1'));
  }

  protected reset(): void {
    this.selectedFile.set(null);
    this.boxes.set([]);
    this.imgElement = null;
  }
}
