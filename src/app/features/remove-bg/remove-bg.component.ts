import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BackgroundRemovalService } from '../../core/services/background-removal.service';
import { TranslationService } from '../../core/services/translation.service';
import { ImageStateService } from '../../core/services/image-state.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-remove-bg',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './remove-bg.component.html',
})
export class RemoveBgComponent implements OnInit {
  private bgRemovalService = inject(BackgroundRemovalService);
  public i18n = inject(TranslationService);
  public imageState = inject(ImageStateService);
  private router = inject(Router);

  public isProcessing = this.bgRemovalService.isProcessing;
  public progress = this.bgRemovalService.progress;
  public processedImageUrl = this.bgRemovalService.processedImageUrl;
  public originalImageUrl = signal<string | null>(null);
  public originalFile = signal<File | null>(null);
  public isDragging = signal<boolean>(false);

  // New UI state
  public activeTab = signal<'original' | 'processed'>('processed');
  public backgroundColor = signal<string>('transparent');
  public bgColors = ['transparent', '#ffffff', '#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'];

  ngOnInit() {
    const file = this.imageState.currentFile();
    if (file) {
      this.handleFile(file);
    }
  }

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
    this.originalFile.set(file);
    this.imageState.setFile(file); // Store in global state

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
    this.processFinalResult((dataUrl) => {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `nobg-${this.originalFile()?.name || 'image.png'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  continueEditing() {
    this.processFinalResult((dataUrl) => {
      // Convert dataUrl to File
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `nobg-${this.originalFile()?.name || 'image.png'}`, { type: 'image/png' });
          this.imageState.setFile(file);
          this.router.navigate(['/']);
        });
    });
  }

  private processFinalResult(callback: (dataUrl: string) => void) {
    const url = this.processedImageUrl();
    if (!url) return;

    const bgColor = this.backgroundColor();
    
    if (bgColor === 'transparent') {
      callback(url);
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
      
      // Export
      const dataUrl = canvas.toDataURL('image/png');
      callback(dataUrl);
    };
    img.src = url;
  }

  reset() {
    this.originalImageUrl.set(null);
    this.processedImageUrl.set(null);
    this.originalFile.set(null);
    this.imageState.clear();
    this.bgRemovalService.progress.set(0);
    this.bgRemovalService.isProcessing.set(false);
    this.activeTab.set('processed');
    this.backgroundColor.set('transparent');
  }
}
