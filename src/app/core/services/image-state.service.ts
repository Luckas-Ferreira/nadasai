import { Injectable, computed, signal } from '@angular/core';
import { AppError } from '../errors';
import { assertUsableImage, suffixedName } from '../image/image-file.util';
import type { ToolId } from '../tools/tools';

export interface EditSession {
  readonly file: File;
  /** The name the user originally uploaded. Keeps chained filenames from stacking prefixes. */
  readonly originalName: string;
  /** Tools applied so far, in order. Drives the provenance breadcrumb. */
  readonly history: readonly ToolId[];
}

/**
 * The single hand-off point between tools: each tool reads `file` on init and
 * writes its result back with `apply()`.
 *
 * Both entry points validate that the payload is an image. That guard is what
 * stops the converter from pushing an `application/pdf` into the chain, which
 * used to reach crop/compress/resize (they only type-checked on drag-and-drop,
 * never on the file they hydrated from here) and render a broken <img>.
 */
@Injectable({ providedIn: 'root' })
export class ImageStateService {
  private readonly _session = signal<EditSession | null>(null);

  readonly session = this._session.asReadonly();
  readonly currentFile = computed(() => this._session()?.file ?? null);
  readonly history = computed(() => this._session()?.history ?? []);

  /** Starts a fresh session from a user upload. Throws AppError if unusable. */
  load(file: File): void {
    assertUsableImage(file);
    this._session.set({ file, originalName: file.name, history: [] });
  }

  /** Records a tool's output as the new working file. Throws AppError if unusable. */
  apply(tool: ToolId, blob: Blob, suffix: string, ext: string): void {
    const current = this._session();
    const originalName = current?.originalName ?? 'image.png';
    const file = new File([blob], suffixedName(originalName, suffix, ext), { type: blob.type });

    assertUsableImage(file);

    this._session.set({
      file,
      originalName,
      history: [...(current?.history ?? []), tool],
    });
  }

  clear(): void {
    this._session.set(null);
  }
}

/** Re-exported so components can catch the same type the service throws. */
export { AppError };
