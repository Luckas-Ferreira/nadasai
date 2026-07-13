import { saveAs } from 'file-saver';

/**
 * Single download path for the whole app, replacing the hand-rolled
 * createElement('a') dance that used to be copy-pasted into all five tools.
 * file-saver was already a dependency but was never imported.
 */
export function saveBlob(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}
