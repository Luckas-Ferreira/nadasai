import { Injectable, signal } from '@angular/core';
import { removeBackground, Config } from '@imgly/background-removal';

@Injectable({
  providedIn: 'root'
})
export class BackgroundRemovalService {
  public isProcessing = signal<boolean>(false);
  public progress = signal<number>(0);
  public processedImageUrl = signal<string | null>(null);

  async processImage(file: File) {
    this.isProcessing.set(true);
    this.progress.set(0);
    this.processedImageUrl.set(null);

    const config: Config = {
      progress: (key: string, current: number, total: number) => {
        const percentage = Math.round((current / total) * 100);
        this.progress.set(percentage);
      }
    };

    try {
      // O imgly já lida com WASM e processamento local pesado internamente
      const imageBlob = await removeBackground(file, config);
      const url = URL.createObjectURL(imageBlob);
      this.processedImageUrl.set(url);
    } catch (error) {
      console.error('Erro ao remover fundo:', error);
    } finally {
      this.isProcessing.set(false);
    }
  }
}
