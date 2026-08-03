import { Injectable } from '@angular/core';
import { AppError } from '../../../../core/errors';
import {
  MAX_CRYPTO_BYTES,
  type EnvelopeVersion,
  decryptEnvelope,
  encryptBytes,
} from '../../../../core/crypto/envelope';
import { mimeFromFilename, restoreName } from '../../../../core/crypto/filenames';

export interface EncryptFileOptions {
  readonly file: File;
  readonly password: string;
  readonly onProgress?: (percent: number) => void;
}

export interface EncryptOutcome {
  readonly blob: Blob;
  readonly filename: string;
}

export interface DecryptOutcome extends EncryptOutcome {
  readonly version: EnvelopeVersion;
}

/**
 * Reads the file in slices so the progress bar means something, then hands the
 * bytes to core/crypto. AES-GCM itself cannot be chunked without changing the
 * on-disk format, so the read is the only phase that can report progress —
 * the component switches to an indeterminate spinner for the crypto itself.
 */
async function readAll(file: File, onProgress?: (percent: number) => void): Promise<ArrayBuffer> {
  if (file.size > MAX_CRYPTO_BYTES) throw new AppError('crypto_too_large');

  const CHUNK = 4 * 1024 * 1024;
  const out = new Uint8Array(file.size);
  let read = 0;

  while (read < file.size) {
    const end = Math.min(read + CHUNK, file.size);
    out.set(new Uint8Array(await file.slice(read, end).arrayBuffer()), read);
    read = end;
    onProgress?.(Math.round((read / file.size) * 100));
  }
  if (file.size === 0) onProgress?.(100);

  return out.buffer;
}

@Injectable({ providedIn: 'root' })
export class FileEncryptorService {
  async encrypt(options: EncryptFileOptions): Promise<EncryptOutcome> {
    const { file, password, onProgress } = options;
    const plain = await readAll(file, onProgress);

    const envelope = await encryptBytes(plain, password, {
      name: file.name,
      type: file.type || mimeFromFilename(file.name),
    });

    return {
      blob: new Blob([envelope], { type: 'application/octet-stream' }),
      // Appended, never replacing the original extension — decryption relies on
      // being able to strip exactly this.
      filename: `${file.name}.enc`,
    };
  }

  async decrypt(options: EncryptFileOptions): Promise<DecryptOutcome> {
    const { file, password, onProgress } = options;
    const bytes = new Uint8Array(await readAll(file, onProgress));

    const { data, meta, version } = await decryptEnvelope(bytes, password);
    const { name, type } = restoreName(file.name, meta);

    return { blob: new Blob([data], { type }), filename: name, version };
  }
}
