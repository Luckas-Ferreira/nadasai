import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../core/services/translation.service';
import { ImageStateService } from '../../core/services/image-state.service';
import { Router } from '@angular/router';
import imageCompression from 'browser-image-compression';

@Component({
  selector: 'app-resize',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './resize.component.html',
})
export class ResizeComponent implements OnInit {
  public i18n = inject(TranslationService);
  public imageState = inject(ImageStateService);
  private router = inject(Router);
  
  public originalFile = signal<File | null>(null);
  public originalUrl = signal<string | null>(null);
  
  public origWidth = signal<number>(0);
  public origHeight = signal<number>(0);
  
  public targetWidth = signal<number>(0);
  public targetHeight = signal<number>(0);
  
  public isDragging = signal(false);
  public isProcessing = signal(false);
  public processedFile = signal<File | null>(null);
  public processedUrl = signal<string | null>(null);

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
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      this.handleFile(file);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File) {
    this.originalFile.set(file);
    this.imageState.setFile(file);
    const url = URL.createObjectURL(file);
    this.originalUrl.set(url);
    this.processedFile.set(null);
    this.processedUrl.set(null);
    
    // Get dimensions
    const img = new Image();
    img.onload = () => {
      this.origWidth.set(img.width);
      this.origHeight.set(img.height);
      this.targetWidth.set(img.width);
      this.targetHeight.set(img.height);
    };
    img.src = url;
  }

  public updateWidth(newWidth: number) {
    const ratio = this.origHeight() / this.origWidth();
    this.targetWidth.set(newWidth);
    this.targetHeight.set(Math.round(newWidth * ratio));
  }

  public updateHeight(newHeight: number) {
    const ratio = this.origWidth() / this.origHeight();
    this.targetHeight.set(newHeight);
    this.targetWidth.set(Math.round(newHeight * ratio));
  }

  public applyPreset(maxDimension: number) {
    if (this.origWidth() > this.origHeight()) {
      this.updateWidth(maxDimension);
    } else {
      this.updateHeight(maxDimension);
    }
  }

  public async resize() {
    const file = this.originalFile();
    if (!file) return;

    this.isProcessing.set(true);
    
    try {
      const maxDim = Math.max(this.targetWidth(), this.targetHeight());
      
      const options = {
        maxWidthOrHeight: maxDim,
        useWebWorker: true,
        initialQuality: 0.85,
        alwaysKeepResolution: false
      };

      const compressed = await imageCompression(file, options);
      
      // Keep extension format
      const originalName = file.name;
      const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
      const extMatch = originalName.match(/\.([^.]+)$/);
      const ext = extMatch ? extMatch[1] : 'jpg';
      
      const resultFile = new File([compressed], `resized-${baseName}.${ext}`, { type: compressed.type });
      
      this.processedFile.set(resultFile);
      this.processedUrl.set(URL.createObjectURL(resultFile));
    } catch (e) {
      console.error('Resize error:', e);
    } finally {
      this.isProcessing.set(false);
    }
  }

  public download() {
    const url = this.processedUrl();
    const file = this.processedFile();
    if (!url || !file) return;

    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  public continueEditing() {
    const file = this.processedFile();
    if (file) {
      this.imageState.setFile(file);
      this.router.navigate(['/']);
    }
  }

  public reset() {
    const oldUrl = this.originalUrl();
    const oldProcUrl = this.processedUrl();
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    if (oldProcUrl) URL.revokeObjectURL(oldProcUrl);

    this.originalFile.set(null);
    this.originalUrl.set(null);
    this.processedFile.set(null);
    this.processedUrl.set(null);
    this.origWidth.set(0);
    this.origHeight.set(0);
    this.targetWidth.set(0);
    this.targetHeight.set(0);
    this.imageState.clear();
  }
}
