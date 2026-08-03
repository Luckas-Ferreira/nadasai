import { Injectable } from '@angular/core';
import { armor, dearmor } from '../../../../core/crypto/armor';
import { decryptEnvelope, encryptBytes } from '../../../../core/crypto/envelope';

/**
 * There is deliberately NO crypto in this file.
 *
 * It composes core/crypto, so an armored message and a .enc file are the same
 * envelope in two wrappers — the contents of one can be pasted into the other.
 * A second implementation would be a second thing to get wrong, and the spec
 * pins the interchange by decrypting this tool's output with the file tool's.
 */
const TEXT_META = { name: 'message.txt', type: 'text/plain' } as const;

@Injectable({ providedIn: 'root' })
export class TextEncryptorService {
  async encrypt(text: string, password: string): Promise<string> {
    const bytes = await encryptBytes(new TextEncoder().encode(text).buffer, password, TEXT_META);
    return armor(bytes);
  }

  async decrypt(armored: string, password: string): Promise<string> {
    const { data } = await decryptEnvelope(dearmor(armored), password);
    return new TextDecoder().decode(data);
  }
}
