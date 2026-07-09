import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ImageStateService {
  public currentFile = signal<File | null>(null);
  
  public setFile(file: File) {
    this.currentFile.set(file);
  }

  public clear() {
    this.currentFile.set(null);
  }
}
