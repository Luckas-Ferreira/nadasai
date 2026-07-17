import { Injectable, signal } from '@angular/core';

export type OcrLang = 'por' | 'eng' | 'por+eng';

export interface OcrBlock {
  text: string;
  x: number;      // 0–1 (relative to page width)
  y: number;      // 0–1 (relative to page height)
  w: number;
  h: number;
  confidence: number;
}

export interface OcrResult {
  lang: OcrLang;
  blocks: OcrBlock[];
  fullText: string;
}

/**
 * Wraps Tesseract.js to OCR a rendered canvas.
 * Tesseract is loaded lazily (only when first needed) to keep
 * the initial bundle lean.
 *
 * Language models are downloaded once and cached by the browser.
 * Typical size: por ~4.5 MB, eng ~4 MB.
 */
@Injectable({ providedIn: 'root' })
export class OcrService {
  /** -1 = idle, 0–100 = OCR progress for the current page */
  readonly progress = signal<number>(-1);

  private workerCache = new Map<OcrLang, import('tesseract.js').Worker>();

  private async getWorker(lang: OcrLang): Promise<import('tesseract.js').Worker> {
    if (this.workerCache.has(lang)) return this.workerCache.get(lang)!;

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(lang, 1, {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          this.progress.set(Math.round(m.progress * 100));
        }
      },
    });

    this.workerCache.set(lang, worker);
    return worker;
  }

  async recognise(canvas: HTMLCanvasElement, lang: OcrLang = 'por+eng'): Promise<OcrResult> {
    this.progress.set(0);

    const worker = await this.getWorker(lang);
    const { data } = await worker.recognize(canvas);

    this.progress.set(-1);

    // The `words` array exists at runtime but some older @types/tesseract.js
    // declarations place it only on sub-types — cast to access it safely.
    type TWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
    const words = (data as unknown as { words: TWord[] }).words ?? [];

    const blocks: OcrBlock[] = words
      .filter((w: TWord) => w.confidence > 30)
      .map((w: TWord) => ({
        text: w.text,
        x: w.bbox.x0 / canvas.width,
        y: w.bbox.y0 / canvas.height,
        w: (w.bbox.x1 - w.bbox.x0) / canvas.width,
        h: (w.bbox.y1 - w.bbox.y0) / canvas.height,
        confidence: w.confidence,
      }));

    return { lang, blocks, fullText: data.text };
  }

  async terminate(): Promise<void> {
    for (const worker of this.workerCache.values()) {
      await worker.terminate();
    }
    this.workerCache.clear();
  }
}
