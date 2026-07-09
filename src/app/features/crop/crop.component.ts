import { Component, ElementRef, inject, signal, ViewChild, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../core/services/translation.service';
import { ImageStateService } from '../../core/services/image-state.service';
import { Router } from '@angular/router';
import Cropper from 'cropperjs';

@Component({
  selector: 'app-crop',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './crop.component.html',
})
export class CropComponent implements OnInit, OnDestroy {
  public i18n = inject(TranslationService);
  public imageState = inject(ImageStateService);
  private router = inject(Router);
  
  @ViewChild('imageElement') imageElement!: ElementRef<HTMLImageElement>;
  
  public originalFile = signal<File | null>(null);
  public originalUrl = signal<string | null>(null);
  public croppedUrl = signal<string | null>(null);
  
  public isDragging = signal(false);
  public currentRatio = signal<number | null>(null); // null = free
  
  private cropper: Cropper | null = null;
  private fileType: string = 'image/png';

  ngOnInit() {
    const file = this.imageState.currentFile();
    if (file) {
      this.handleFile(file);
    }
  }

  ngOnDestroy() {
    this.cleanupCropper();
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
    this.croppedUrl.set(null);
    
    // We need to wait for Angular to render the img tag before init cropper
    setTimeout(() => {
      this.initCropper();
    }, 0);
  }

  private initCropper() {
    if (this.cropper) {
      this.cropper.destroy();
    }
    if (this.imageElement?.nativeElement) {
      this.cropper = new Cropper(this.imageElement.nativeElement, {
        viewMode: 2, // Restrict crop box to not exceed the canvas
        background: false,
        autoCropArea: 0.8,
        responsive: true
      });
    }
  }

  public setAspectRatio(ratio: number | null) {
    this.currentRatio.set(ratio);
    if (this.cropper) {
      this.cropper.setAspectRatio(ratio || NaN);
    }
  }

  public crop() {
    if (!this.cropper) return;
    
    // Get a high quality canvas
    const canvas = this.cropper.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    });

    const file = this.originalFile();
    if (!file) return;

    // Use original type if possible, otherwise default to jpeg to avoid huge files
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(type, 0.9);
    this.croppedUrl.set(dataUrl);
  }

  public download() {
    const url = this.croppedUrl();
    if (!url) return;

    const file = this.originalFile();
    const originalName = file?.name || 'image.jpg';
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `cropped-${originalName}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  public continueEditing() {
    const url = this.croppedUrl();
    if (!url) return;

    fetch(url)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], `cropped-${this.originalFile()?.name || 'image.jpg'}`, { type: blob.type });
        this.imageState.setFile(file);
        this.router.navigate(['/']);
      });
  }

  public reset() {
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
    this.originalFile.set(null);
    this.originalUrl.set(null);
    this.croppedUrl.set(null);
    this.imageState.clear();
    this.currentRatio.set(null);
  }

  private cleanupCropper() {
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
  }
}
