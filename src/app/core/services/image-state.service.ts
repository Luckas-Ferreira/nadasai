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
  /**
   * The working file as it was *before* each entry in `history`, same order and
   * length — `past[i]` is what the chain looked like before `history[i]` ran, and
   * `past[0]` is therefore always the untouched upload.
   *
   * This exists because apply() used to drop the previous file on the floor, so
   * a crop you regretted three tools later was simply gone: the only way back was
   * Start over and re-upload. Keeping the Files costs little — a Blob is backed by
   * disk, not heap, and a chain is a handful of steps — and it is what makes undo
   * possible at all.
   */
  readonly past: readonly File[];
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

  /** The tool that undo() would take back, or null when there is nothing to undo. */
  readonly undoableTool = computed(() => this._session()?.history.at(-1) ?? null);

  /** Starts a fresh session from a user upload. Throws AppError if unusable. */
  load(file: File): void {
    assertUsableImage(file);
    this._session.set({ file, originalName: file.name, history: [], past: [] });
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
      // Only push a previous file when there was one. Applying a tool with no
      // session (possible: apply() tolerates it and invents originalName) must
      // not push an entry that has no matching history slot.
      past: current ? [...current.past, current.file] : [],
    });
  }

  /**
   * Steps back one tool, restoring the file exactly as it was before it ran.
   *
   * Restores bytes, not a re-run: `past` holds the real File, so undoing a crop
   * cannot re-encode or re-compress anything. Undoing to `past[0]` hands back the
   * original upload untouched.
   *
   * No-op with nothing to undo, so callers do not have to guard.
   */
  undo(): void {
    const current = this._session();
    const file = current?.past.at(-1);
    if (!current || !file) return;

    this._session.set({
      file,
      originalName: current.originalName,
      history: current.history.slice(0, -1),
      past: current.past.slice(0, -1),
    });
  }

  clear(): void {
    this._session.set(null);
  }
}

/** Re-exported so components can catch the same type the service throws. */
export { AppError };
