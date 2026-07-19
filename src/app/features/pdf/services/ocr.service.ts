import { Injectable, signal } from '@angular/core';

export type OcrLang = 'por' | 'eng' | 'por+eng';

export interface OcrBlock {
  text: string;
  x: number;      // 0-1 (relative to page width)
  y: number;      // 0-1 (relative to page height)
  w: number;
  h: number;
  lineHeight?: number;
  confidence: number;
}

export interface OcrResult {
  lang: OcrLang;
  blocks: OcrBlock[];
  fullText: string;
}

@Injectable({ providedIn: 'root' })
export class OcrService {
  readonly progress = signal<number>(-1);
  readonly statusText = signal<string>('');

  private workerCache = new Map<string, import('tesseract.js').Worker>();

  private async getWorker(lang: string): Promise<import('tesseract.js').Worker> {
    if (this.workerCache.has(lang)) return this.workerCache.get(lang)!;

    console.log('[OCR] Creating worker for lang:', lang);
    this.statusText.set('Iniciando motor OCR...');

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(lang, 1, {
      logger: (m: { status: string; progress: number }) => {
        console.log('[OCR Logger]', m.status, (m.progress * 100).toFixed(0) + '%');
        this.statusText.set(m.status);
        if (
          m.status === 'recognizing text' ||
          m.status.startsWith('loading') ||
          m.status.startsWith('initializing')
        ) {
          this.progress.set(Math.round(m.progress * 100));
        } else {
          this.progress.set(-1);
        }
      },
    } as any);

    console.log('[OCR] Worker ready for lang:', lang);
    this.workerCache.set(lang, worker);
    return worker;
  }

  async recognise(canvas: HTMLCanvasElement, lang: string = 'por+eng'): Promise<OcrResult> {
    this.progress.set(0);
    console.log('[OCR] Starting recognition. Canvas:', canvas.width, 'x', canvas.height, '| lang:', lang);

    const worker = await this.getWorker(lang);
    console.log('[OCR] Worker ready, calling recognize...');

    const { data } = await worker.recognize(canvas, undefined, { blocks: true });
    console.log('[OCR] Done. Full text (200 chars):', data.text.slice(0, 200));

    this.progress.set(-1);

    const blocks: OcrBlock[] = [];
    const tData = data as any;

    // Tesseract.js v7 structure: data.blocks[].paragraphs[].lines[]
    // data.lines does NOT exist at the root level in v7.
    if (tData && tData.blocks && tData.blocks.length > 0) {
      for (const block of tData.blocks) {
        const paras = block.paragraphs ?? [];
        for (const para of paras) {
          const lines = para.lines ?? [];
          for (const line of lines) {
            const lh = (line.bbox.y1 - line.bbox.y0) / canvas.height;
            const words = line.words ?? [];
            for (const word of words) {
              if ((word.confidence ?? 0) < 30) continue;
              const text = (word.text ?? '').trim();
              if (!text) continue;

              const x = word.bbox.x0 / canvas.width;
              const y = word.bbox.y0 / canvas.height;
              const w = (word.bbox.x1 - word.bbox.x0) / canvas.width;
              const h = (word.bbox.y1 - word.bbox.y0) / canvas.height;

              blocks.push({ text, confidence: word.confidence, x, y, w, h, lineHeight: lh });
            }
          }
        }
      }
    } else {
      console.warn('[OCR] No blocks. Available keys:', tData ? Object.keys(tData) : 'null');
    }

    console.log('[OCR] Extracted', blocks.length, 'blocks from', tData?.blocks?.length ?? 0, 'root blocks');
    return { lang: lang as OcrLang, blocks, fullText: data.text };
  }

  async terminate(): Promise<void> {
    for (const worker of this.workerCache.values()) {
      await worker.terminate();
    }
    this.workerCache.clear();
  }
}
