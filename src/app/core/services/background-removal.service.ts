import { Injectable } from '@angular/core';
import { removeBackground } from '@imgly/background-removal';
import { AppError } from '../errors';

/**
 * Stateless on purpose.
 *
 * This used to be a root singleton holding isProcessing/progress/processedImageUrl
 * signals, which meant: (a) the previous image's result was still in the signal
 * when you re-entered the tool, and (b) nothing guarded re-entrancy, so leaving
 * mid-run and coming back kicked off a SECOND concurrent model run that fought
 * the first one for the same signals — the progress bar could even go backwards.
 *
 * State now lives in the component, which Angular destroys on navigation. The
 * cache keeps that from costing anything: coming back to an already-processed
 * file returns instantly instead of re-running a multi-second WASM model.
 */
@Injectable({ providedIn: 'root' })
export class BackgroundRemovalService {
  private readonly cache = new WeakMap<File, Blob>();

  async removeBackground(file: File, onProgress?: (percent: number) => void): Promise<Blob> {
    const cached = this.cache.get(file);
    if (cached) {
      onProgress?.(100);
      return cached;
    }

    try {
      const blob = await removeBackground(file, {
        progress: (_key, current, total) => {
          onProgress?.(total > 0 ? Math.round((current / total) * 100) : 0);
        },
      });

      this.cache.set(file, blob);
      return blob;
    } catch (err) {
      console.error('Background removal failed:', err);
      throw new AppError('model_failed', err);
    }
  }
}
