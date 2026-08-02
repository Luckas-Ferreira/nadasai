import { Injectable, computed, signal } from '@angular/core';

export interface AudioSession {
  readonly file: File;
  /** The name the user originally uploaded. */
  readonly originalName: string;
}

/**
 * The single hand-off point between audio tools: each tool calls `load()` when
 * the user drops a file, and reads `currentFile` on init to restore the track
 * when navigating between tools.
 *
 * Audio tools each own their decoded `AudioBuffer` (and the AudioContext that
 * backs it), because contexts are expensive and must die with the view — but
 * the raw `File` is cheap enough to keep here and re-decode on arrival.
 */
@Injectable({ providedIn: 'root' })
export class AudioStateService {
  private readonly _session = signal<AudioSession | null>(null);

  readonly session = this._session.asReadonly();
  readonly currentFile = computed(() => this._session()?.file ?? null);

  /** Stores the file so the next audio tool can pick it up. */
  load(file: File): void {
    this._session.set({ file, originalName: file.name });
  }

  clear(): void {
    this._session.set(null);
  }
}
