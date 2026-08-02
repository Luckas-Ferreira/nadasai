import { Injectable, computed, signal } from '@angular/core';
import { AppError } from '../errors';
import { assertUsableAudio } from '../audio/audio-file.util';
import { suffixedName } from '../image/image-file.util';
import type { ToolId } from '../tools/tools';

export interface AudioEditSession {
  readonly file: File;
  /** The name the user originally uploaded. Keeps chained filenames from stacking prefixes. */
  readonly originalName: string;
  /** Tools applied so far, in order. Drives the provenance breadcrumb. */
  readonly history: readonly ToolId[];
  /**
   * The working file as it was *before* each entry in `history`, same order and
   * length — `past[i]` is what the session looked like before `history[i]` ran.
   * `past[0]` is therefore always the untouched upload.
   */
  readonly past: readonly File[];
}

/**
 * The single hand-off point between audio tools: each tool reads `file` on init and
 * writes its result back with `apply()`.
 *
 * Audio tools each own their decoded `AudioBuffer` (and the AudioContext that
 * backs it), because contexts are expensive and must die with the view — but
 * the raw `File` is kept here across steps so undo and tool chaining work seamlessly.
 */
@Injectable({ providedIn: 'root' })
export class AudioStateService {
  private readonly _session = signal<AudioEditSession | null>(null);

  readonly session = this._session.asReadonly();
  readonly currentFile = computed(() => this._session()?.file ?? null);
  readonly history = computed(() => this._session()?.history ?? []);

  /** The tool that undo() would take back, or null when there is nothing to undo. */
  readonly undoableTool = computed(() => this._session()?.history.at(-1) ?? null);

  /** Starts a fresh session from a user upload. Throws AppError if unusable. */
  load(file: File): void {
    assertUsableAudio(file);
    this._session.set({
      file,
      originalName: file.name,
      history: [],
      past: [],
    });
  }

  /** Records a tool's output as the new working file in the chain. */
  apply(tool: ToolId, blob: Blob, suffix: string, ext: string): void {
    const current = this._session();
    const originalName = current?.originalName ?? 'audio.wav';
    const file = new File([blob], suffixedName(originalName, suffix, ext), {
      type: blob.type || 'audio/wav',
    });

    assertUsableAudio(file);

    this._session.set({
      file,
      originalName,
      history: [...(current?.history ?? []), tool],
      past: current ? [...current.past, current.file] : [],
    });
  }

  /** Steps back one tool, restoring the file exactly as it was before it ran. */
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

export { AppError };
