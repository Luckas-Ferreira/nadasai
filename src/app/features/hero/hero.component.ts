import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BackgroundRemovalService } from '../../core/services/background-removal.service';

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hero.component.html',
})
export class HeroComponent {
  private bgRemovalService = inject(BackgroundRemovalService);

  public isProcessing = this.bgRemovalService.isProcessing;
  public progress = this.bgRemovalService.progress;
  public processedImageUrl = this.bgRemovalService.processedImageUrl;
  public originalImageUrl = signal<string | null>(null);
  public isDragging = signal<boolean>(false);

  // New UI state
  public activeTab = signal<'original' | 'processed'>('processed');
  public backgroundColor = signal<string>('transparent');
  public bgColors = ['transparent', '#ffffff', '#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      this.handleFile(file);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.handleFile(file);
    }
  }

  private handleFile(file: File) {
    if (!file.type.startsWith('image/')) return;

    // Reset states for new image
    this.activeTab.set('processed');
    this.backgroundColor.set('transparent');

    // Immediate preview
    const url = URL.createObjectURL(file);
    this.originalImageUrl.set(url);
    this.processedImageUrl.set(null);

    // Start background removal
    this.bgRemovalService.processImage(file);
  }

  downloadImage() {
    const url = this.processedImageUrl();
    if (!url) return;

    const bgColor = this.backgroundColor();
    
    if (bgColor === 'transparent') {
      this.triggerDownload(url);
      return;
    }

    // Draw on canvas to apply background color
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Fill background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw image
      ctx.drawImage(img, 0, 0);
      
      // Export and download
      const dataUrl = canvas.toDataURL('image/png');
      this.triggerDownload(dataUrl);
    };
    img.src = url;
  }

  private triggerDownload(url: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'imgwork-no-bg.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  reset() {
    this.originalImageUrl.set(null);
    this.processedImageUrl.set(null);
    this.bgRemovalService.progress.set(0);
    this.bgRemovalService.isProcessing.set(false);
    this.activeTab.set('processed');
    this.backgroundColor.set('transparent');
  }
}
