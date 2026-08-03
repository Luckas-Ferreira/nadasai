import { AppError } from '../errors';
import { createMd5 } from './md5';
import { createSha256 } from './sha256';

/**
 * File hashing, streamed.
 *
 * SHA-256 and MD5 run incrementally over 4 MB slices, so memory is flat and the
 * progress bar is real. SHA-512 has no incremental implementation here (64-bit
 * arithmetic in JS is hi/lo pairs and slower than native), so it goes through
 * crypto.subtle.digest, which must read the file whole — hence the size guard,
 * and hence it being opt-in rather than computed alongside the other two.
 */

export type HashAlgo = 'sha256' | 'sha512' | 'md5';

export const CHUNK_BYTES = 4 * 1024 * 1024;

/** The ceiling for the one algorithm that cannot be streamed. */
export const MAX_WHOLE_BUFFER_BYTES = 512 * 1024 * 1024;

export type HashResult = Partial<Record<HashAlgo, string>>;

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashFile(
  file: Blob,
  algos: readonly HashAlgo[],
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<HashResult> {
  const result: HashResult = {};
  const wantsSha512 = algos.includes('sha512');

  if (wantsSha512 && file.size > MAX_WHOLE_BUFFER_BYTES) throw new AppError('hash_too_large');

  const md5 = algos.includes('md5') ? createMd5() : null;
  const sha256 = algos.includes('sha256') ? createSha256() : null;

  if (md5 || sha256) {
    let read = 0;
    // File.slice + arrayBuffer, not file.stream(), because a Blob slice is a
    // view onto the same data — nothing is copied until the slice is read, and
    // the loop never holds more than one chunk.
    while (read < file.size) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const end = Math.min(read + CHUNK_BYTES, file.size);
      const chunk = new Uint8Array(await file.slice(read, end).arrayBuffer());
      md5?.update(chunk);
      sha256?.update(chunk);
      read = end;
      onProgress?.(file.size === 0 ? 100 : Math.round((read / file.size) * 100));
    }
    if (file.size === 0) onProgress?.(100);

    if (md5) result.md5 = md5.digest();
    if (sha256) result.sha256 = sha256.digest();
  }

  if (wantsSha512) {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new AppError('crypto_unsupported');
    result.sha512 = toHex(await subtle.digest('SHA-512', await file.arrayBuffer()));
    onProgress?.(100);
  }

  return result;
}

export async function hashText(text: string, algos: readonly HashAlgo[]): Promise<HashResult> {
  return hashFile(new Blob([new TextEncoder().encode(text)]), algos);
}

/**
 * People paste checksums straight out of a `.sha256sum` file, which looks like
 *
 *     d2a84f4b8b650937ec8f73cd8be2c74a  ubuntu-24.04.iso
 *
 * and the tool used to report every one of those as a mismatch.
 */
export function normalizeExpected(input: string): string {
  return input.trim().split(/[\s*]+/)[0].toLowerCase();
}

/** Which algorithm the pasted checksum matched, so the UI can name it. */
export function matchAlgo(expected: string, result: HashResult): HashAlgo | null {
  const wanted = normalizeExpected(expected);
  if (!wanted) return null;
  for (const algo of ['sha256', 'sha512', 'md5'] as const) {
    if (result[algo] && result[algo] === wanted) return algo;
  }
  return null;
}
