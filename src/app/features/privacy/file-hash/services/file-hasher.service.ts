import { Injectable } from '@angular/core';
import { AppError } from '../../../../core/errors';
import { type HashAlgo, type HashResult, hashFile, hashText } from '../../../../core/hash/hash-file';

export interface HashFileOptions {
  readonly file: Blob;
  readonly algos: readonly HashAlgo[];
  readonly onProgress?: (percent: number) => void;
  readonly signal?: AbortSignal;
}

/**
 * Thin over core/hash, and that is the point: the algorithms are pure and
 * tested there, while this is where the size guard and the AppError mapping
 * live so the component never sees a raw throw.
 */
@Injectable({ providedIn: 'root' })
export class FileHasherService {
  async hashFile(options: HashFileOptions): Promise<HashResult> {
    const { file, algos, onProgress, signal } = options;
    if (algos.length === 0) return {};
    try {
      return await hashFile(file, algos, onProgress, signal);
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new AppError('generic', err);
    }
  }

  async hashText(text: string, algos: readonly HashAlgo[]): Promise<HashResult> {
    try {
      return await hashText(text, algos);
    } catch (err) {
      throw err instanceof AppError ? err : new AppError('generic', err);
    }
  }
}
