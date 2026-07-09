import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslationService } from '../../core/services/translation.service';
import { ImageStateService } from '../../core/services/image-state.service';
import { Router } from '@angular/router';
import { jsPDF } from 'jspdf';
import imageCompression from 'browser-image-compression';

export type TargetFormat = 'WEBP' | 'JPEG' | 'PNG' | 'AVIF' | 'PDF' | 'ICO';

@Component({
  selector: 'app-convert',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './convert.component.html',
})
export class ConvertComponent implements OnInit {
  public i18n = inject(TranslationService);
  public imageState = inject(ImageStateService);
  private router = inject(Router);
  
  public originalFile = signal<File | null>(null);
  public originalUrl = signal<string | null>(null);
  public processedFile = signal<File | null>(null);
  public processedUrl = signal<string | null>(null);
  
  public isDragging = signal(false);
  public isConverting = signal(false);
  
  public selectedFormat = signal<TargetFormat>('WEBP');
  public formats: TargetFormat[] = ['WEBP', 'JPEG', 'PNG', 'AVIF', 'PDF', 'ICO'];

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
  }

  public async convert() {
    const file = this.originalFile();
    const url = this.originalUrl();
    if (!file || !url) return;

    this.isConverting.set(true);

    try {
      const img = new Image();
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const format = this.selectedFormat();
      const originalName = file.name;
      const baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;

      if (format === 'PDF') {
        this.convertToPdf(img, baseName);
      } else {
        await this.convertToImage(file, format, baseName);
      }
    } catch (e) {
      console.error('Conversion error:', e);
    } finally {
      this.isConverting.set(false);
    }
  }

  private convertToPdf(img: HTMLImageElement, baseName: string) {
    const orientation = img.width > img.height ? 'landscape' : 'portrait';
    const doc = new jsPDF({
      orientation: orientation,
      unit: 'px',
      format: [img.width, img.height]
    });

    doc.addImage(img, 'JPEG', 0, 0, img.width, img.height);
    const pdfBlob = doc.output('blob');
    const resultFile = new File([pdfBlob], `converted-${baseName}.pdf`, { type: 'application/pdf' });
    this.processedFile.set(resultFile);
    this.processedUrl.set(URL.createObjectURL(resultFile));
  }

  private async convertToImage(file: File, format: TargetFormat, baseName: string) {
    if (format === 'PNG' || format === 'AVIF' || format === 'ICO') {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((resolve) => { img.onload = resolve; });
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (format === 'ICO') {
        const size = Math.min(Math.max(img.width, img.height), 256);
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, size, size);
        
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const pngBuffer = await blob.arrayBuffer();
          
          const header = new DataView(new ArrayBuffer(22));
          header.setUint16(0, 0, true);
          header.setUint16(2, 1, true);
          header.setUint16(4, 1, true);
          header.setUint8(6, size === 256 ? 0 : size);
          header.setUint8(7, size === 256 ? 0 : size);
          header.setUint8(8, 0);
          header.setUint8(9, 0);
          header.setUint16(10, 1, true);
          header.setUint16(12, 32, true);
          header.setUint32(14, pngBuffer.byteLength, true);
          header.setUint32(18, 22, true);
          
          const icoBlob = new Blob([header.buffer, pngBuffer], { type: 'image/x-icon' });
          const resultFile = new File([icoBlob], `converted-${baseName}.ico`, { type: 'image/x-icon' });
          this.processedFile.set(resultFile);
          this.processedUrl.set(URL.createObjectURL(resultFile));
        }, 'image/png');
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const mimeType = `image/${format.toLowerCase()}`;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const ext = format.toLowerCase();
        const resultFile = new File([blob], `converted-${baseName}.${ext}`, { type: mimeType });
        this.processedFile.set(resultFile);
        this.processedUrl.set(URL.createObjectURL(resultFile));
      }, mimeType, 0.7);
      return;
    }

    const options = {
      maxSizeMB: 5,
      maxWidthOrHeight: 4000,
      useWebWorker: true,
      initialQuality: 0.9,
      fileType: `image/${format.toLowerCase()}` as string,
      alwaysKeepResolution: true
    };

    const compressed = await imageCompression(file, options);
    const resultFile = new File([compressed], `converted-${baseName}.${format.toLowerCase()}`, { type: compressed.type });
    this.processedFile.set(resultFile);
    this.processedUrl.set(URL.createObjectURL(resultFile));
  }

  public download() {
    const file = this.processedFile();
    const url = this.processedUrl();
    if (!file || !url) return;

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
    const oldOrigUrl = this.originalUrl();
    if (oldOrigUrl) URL.revokeObjectURL(oldOrigUrl);
    
    const oldProcUrl = this.processedUrl();
    if (oldProcUrl) URL.revokeObjectURL(oldProcUrl);

    this.originalFile.set(null);
    this.originalUrl.set(null);
    this.processedFile.set(null);
    this.processedUrl.set(null);
    this.imageState.clear();
    this.selectedFormat.set('WEBP');
  }
}
