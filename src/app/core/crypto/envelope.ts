import { AppError } from '../errors';

/**
 * The on-disk format for encrypt-file, and the one file in this repo where a
 * regression does not produce a bug report — it produces a user whose file is
 * permanently unreadable.
 *
 * Everything below was moved verbatim out of encrypt-file.component.ts. The
 * layout, the KDF parameters and the byte order are FROZEN. `envelope.spec.ts`
 * pins them with a hardcoded golden vector and with three hand-assembled
 * envelopes (one per version) that must all decrypt; if you find yourself
 * editing those tests to make a change pass, the change is wrong.
 *
 * WRITE (V2):
 *
 *    0            "NADASAI_V2"      10 bytes, ASCII
 *   10            metaLen           uint16, BIG-ENDIAN
 *   12            metaJson          metaLen bytes, UTF-8: { name, type }
 *   12+metaLen    salt              16 bytes
 *   28+metaLen    iv                12 bytes
 *   40+metaLen    ciphertext‖tag    the rest; WebCrypto appends the 16-byte GCM tag
 *
 * READ: V2, then V1 ("NADASAI_ENC", ELEVEN bytes, no meta), then headerless
 * legacy (salt at 0, iv at 16, ciphertext at 28). The order is load-bearing,
 * and there is no prefix collision: both magics share "NADASAI_" and diverge at
 * index 8 (V vs E), and V1 is one byte longer than V2.
 *
 * WHY THE ITERATION COUNT IS STILL 100_000. It is below current OWASP guidance
 * (600k for PBKDF2-HMAC-SHA256) and raising it is the obvious improvement — and
 * it would silently make every existing .enc file undecryptable, because the
 * count is not stored in the envelope. Raising it needs a V3 header carrying the
 * count, with the V2 reader left intact. That is a deliberate, separate change,
 * never a side effect of touching this file.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const MAGIC_V2 = enc.encode('NADASAI_V2');   // 10 bytes
export const MAGIC_V1 = enc.encode('NADASAI_ENC');  // 11 bytes

export const PBKDF2_ITERATIONS = 100_000;
export const PBKDF2_HASH = 'SHA-256';
export const SALT_BYTES = 16;
export const IV_BYTES = 12;

/**
 * AES-GCM holds the plaintext, the ciphertext and the assembled envelope in
 * memory simultaneously, so the real ceiling is well under what a "max upload"
 * number would suggest. The drag hint used to promise 500 MB and nothing
 * enforced it.
 */
export const MAX_CRYPTO_BYTES = 256 * 1024 * 1024;

export type EnvelopeVersion = 'v2' | 'v1' | 'legacy';

export interface EnvelopeMeta {
  readonly name: string;
  readonly type: string;
}

export interface ParsedEnvelope {
  readonly version: EnvelopeVersion;
  readonly meta: EnvelopeMeta | null;
  readonly salt: Uint8Array;
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
}

/**
 * `crypto.subtle` is undefined on an insecure origin — a LAN address, a kiosk.
 * Reading `.encrypt` off it then throws a TypeError that the old catch-all
 * reported to the user as "wrong password", which is simply false.
 */
export function subtleOrThrow(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new AppError('crypto_unsupported');
  return subtle;
}

export function randomBytes(length: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) throw new AppError('crypto_unsupported');
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const subtle = subtleOrThrow();
  const passKey = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function startsWith(bytes: Uint8Array, magic: Uint8Array): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

export function buildEnvelope(
  ciphertext: ArrayBuffer,
  salt: Uint8Array,
  iv: Uint8Array,
  meta: EnvelopeMeta,
): Uint8Array {
  const metaBytes = enc.encode(JSON.stringify({ name: meta.name, type: meta.type }));
  const headerLen = MAGIC_V2.length + 2 + metaBytes.length;
  const out = new Uint8Array(headerLen + salt.length + iv.length + ciphertext.byteLength);

  out.set(MAGIC_V2, 0);
  // Big-endian, and the `false` is the whole reason this line is not obvious.
  // A spec asserts a >255-byte meta round-trips, which is what catches an
  // endianness "fix".
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint16(MAGIC_V2.length, metaBytes.length, false);
  out.set(metaBytes, MAGIC_V2.length + 2);
  out.set(salt, headerLen);
  out.set(iv, headerLen + salt.length);
  out.set(new Uint8Array(ciphertext), headerLen + salt.length + iv.length);

  return out;
}

/**
 * Splits an envelope without decrypting it. Everything this function can detect
 * is a structural fault — "this is not one of our files" — which is a different
 * message from a failed authentication tag. See the comment on ErrorCode.
 */
export function parseEnvelope(bytes: Uint8Array): ParsedEnvelope {
  const body = (version: EnvelopeVersion, offset: number, meta: EnvelopeMeta | null): ParsedEnvelope => {
    if (bytes.length < offset + SALT_BYTES + IV_BYTES) throw new AppError('crypto_bad_envelope');
    return {
      version,
      meta,
      salt: bytes.slice(offset, offset + SALT_BYTES),
      iv: bytes.slice(offset + SALT_BYTES, offset + SALT_BYTES + IV_BYTES),
      ciphertext: bytes.slice(offset + SALT_BYTES + IV_BYTES),
    };
  };

  if (startsWith(bytes, MAGIC_V2)) {
    if (bytes.length < MAGIC_V2.length + 2) throw new AppError('crypto_bad_envelope');
    // The component did `new DataView(data.buffer)`, which only worked because
    // its input always had byteOffset 0. Here the input may be a subarray, and
    // getting this wrong reads a bogus metaLen and rejects VALID files.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const metaLen = view.getUint16(MAGIC_V2.length, false);
    const metaStart = MAGIC_V2.length + 2;
    if (bytes.length < metaStart + metaLen) throw new AppError('crypto_bad_envelope');

    // A V2 file with unparseable meta must still decrypt — the payload is intact,
    // only the suggested filename is lost.
    let meta: EnvelopeMeta | null = null;
    try {
      const parsed: unknown = JSON.parse(dec.decode(bytes.slice(metaStart, metaStart + metaLen)));
      if (parsed && typeof parsed === 'object') {
        const rec = parsed as Record<string, unknown>;
        meta = {
          name: typeof rec['name'] === 'string' ? rec['name'] : '',
          type: typeof rec['type'] === 'string' ? rec['type'] : '',
        };
      }
    } catch {
      meta = null;
    }

    return body('v2', metaStart + metaLen, meta);
  }

  if (startsWith(bytes, MAGIC_V1)) return body('v1', MAGIC_V1.length, null);

  return body('legacy', 0, null);
}

export async function encryptBytes(
  plain: ArrayBuffer,
  password: string,
  meta: EnvelopeMeta,
): Promise<Uint8Array> {
  if (plain.byteLength > MAX_CRYPTO_BYTES) throw new AppError('crypto_too_large');
  const subtle = subtleOrThrow();
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveKey(password, salt);
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return buildEnvelope(ciphertext, salt, iv, meta);
}

export async function decryptEnvelope(
  bytes: Uint8Array,
  password: string,
): Promise<{ data: ArrayBuffer; meta: EnvelopeMeta | null; version: EnvelopeVersion }> {
  const subtle = subtleOrThrow();
  const parsed = parseEnvelope(bytes);
  const key = await deriveKey(password, parsed.salt);

  let data: ArrayBuffer;
  try {
    data = await subtle.decrypt({ name: 'AES-GCM', iv: parsed.iv }, key, parsed.ciphertext);
  } catch (cause) {
    // Wrong password and tampered bytes are the SAME failure here — the GCM tag
    // is one bit of information. The message names both causes rather than
    // guessing one.
    throw new AppError('crypto_decrypt_failed', cause);
  }

  return { data, meta: parsed.meta, version: parsed.version };
}
