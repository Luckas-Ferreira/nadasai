import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../core/services/translation.service';
import { ImageStateService } from '../../core/services/image-state.service';
import { Router } from '@angular/router';
import imageCompression from 'browser-image-compression';

@Component({
  selector: 'app-compress',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './compress.component.html',
})
export class CompressComponent implements OnInit {
  public i18n = inject(TranslationService);
  public imageState = inject(ImageStateService);
  private router = inject(Router);
  
  public originalFile = signal<File | null>(null);
  public originalUrl = signal<string | null>(null);
  
  public compressedFile = signal<File | null>(null);
  public compressedUrl = signal<string | null>(null);
  
  public isDragging = signal(false);
  public isCompressing = signal(false);
  
  // Settings
  public qualitySlider = signal<number>(75);
  public maxMb = signal<number>(1);
  public quality = signal<number>(0.8);
  public autoResize = signal<boolean>(true); // Reduces dimension if extremely large

  public originalSizeStr = computed(() => {
    const f = this.originalFile();
    return f ? (f.size / (1024 * 1024)).toFixed(2) + ' MB' : '0 MB';
  });

  public compressedSizeStr = computed(() => {
    const f = this.compressedFile();
    return f ? (f.size / (1024 * 1024)).toFixed(2) + ' MB' : '0 MB';
  });

  public savingsStr = computed(() => {
    const orig = this.originalFile()?.size || 0;
    const comp = this.compressedFile()?.size || 0;
    if (orig === 0 || comp === 0) return '0%';
    const save = ((orig - comp) / orig) * 100;
    return save > 0 ? save.toFixed(0) + '%' : '0%';
  });

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
    this.compressedFile.set(null);
    this.compressedUrl.set(null);
  }

  public async compress() {
    const file = this.originalFile();
    if (!file) return;

    this.isCompressing.set(true);
    try {
      const q = this.qualitySlider();
      const fraction = q / 100;
      
      const origMB = file.size / (1024 * 1024);
      // Aggressive target: if slider is at 50%, target is 25% of original size.
      // If slider is 10%, target is 1% of original size (min 50KB).
      const targetMB = Math.max(0.05, origMB * fraction * fraction);
      
      // Also scale down resolution slightly at lower qualities
      const maxRes = Math.floor(1000 + (3000 * fraction));

      const options = {
        maxSizeMB: targetMB,
        maxWidthOrHeight: maxRes, 
        useWebWorker: true,
        initialQuality: fraction,
        fileType: 'image/webp', // WebP yields MUCH better compression
        alwaysKeepResolution: q >= 90 // Only keep original resolution at high quality
      };

      const compressed = await imageCompression(file, options);
      
      // Cleanup old url
      const oldUrl = this.compressedUrl();
      if (oldUrl) URL.revokeObjectURL(oldUrl);

      this.compressedFile.set(compressed);
      this.compressedUrl.set(URL.createObjectURL(compressed));
    } catch (error) {
      console.error('Compression error:', error);
    } finally {
      this.isCompressing.set(false);
    }
  }

  public download() {
    const file = this.compressedFile();
    const url = this.compressedUrl();
    if (!file || !url) return;

    const originalName = this.originalFile()?.name || 'image';
    const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;

    const a = document.createElement('a');
    a.href = url;
    a.download = `compressed-${baseName}.webp`; // Always save as webp since we converted it
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  public continueEditing() {
    const file = this.compressedFile();
    if (file) {
      this.imageState.setFile(file);
      this.router.navigate(['/']);
    }
  }

  public reset() {
    const oldOrigUrl = this.originalUrl();
    if (oldOrigUrl) URL.revokeObjectURL(oldOrigUrl);
    
    const oldCompUrl = this.compressedUrl();
    if (oldCompUrl) URL.revokeObjectURL(oldCompUrl);

    this.originalFile.set(null);
    this.originalUrl.set(null);
    this.compressedFile.set(null);
    this.compressedUrl.set(null);
    this.imageState.clear();
  }

  public formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  public getSavings(): string {
    const orig = this.originalFile()?.size;
    const comp = this.compressedFile()?.size;
    if (!orig || !comp) return '0%';
    const saved = ((orig - comp) / orig) * 100;
    // if compressed is larger (happens sometimes with small files), return 0%
    if (saved < 0) return '0%';
    return saved.toFixed(0) + '%';
  }
}
