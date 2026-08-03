import { AppError } from '../errors';
import {
  MAGIC_V1,
  MAGIC_V2,
  PBKDF2_ITERATIONS,
  buildEnvelope,
  decryptEnvelope,
  encryptBytes,
  parseEnvelope,
} from './envelope';

/**
 * This file is the fence around the on-disk format. Every assertion here exists
 * because breaking it makes somebody's existing .enc file permanently
 * unreadable — a failure that produces no bug report, only a lost document.
 *
 * If a change makes a test here fail, the change is wrong. Do not edit the
 * expectations to match new behaviour.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

/** Builds an envelope of a given version around a real AES-GCM payload. */
async function makeEnvelope(
  version: 'v2' | 'v1' | 'legacy',
  plaintext: string,
  password: string,
  salt: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const passKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext)));

  if (version === 'v2') {
    const meta = enc.encode(JSON.stringify({ name: 'note.txt', type: 'text/plain' }));
    const out = new Uint8Array(MAGIC_V2.length + 2 + meta.length + 16 + 12 + ct.length);
    out.set(MAGIC_V2, 0);
    new DataView(out.buffer).setUint16(MAGIC_V2.length, meta.length, false);
    out.set(meta, MAGIC_V2.length + 2);
    const off = MAGIC_V2.length + 2 + meta.length;
    out.set(salt, off);
    out.set(iv, off + 16);
    out.set(ct, off + 28);
    return out;
  }

  if (version === 'v1') {
    const out = new Uint8Array(MAGIC_V1.length + 16 + 12 + ct.length);
    out.set(MAGIC_V1, 0);
    out.set(salt, MAGIC_V1.length);
    out.set(iv, MAGIC_V1.length + 16);
    out.set(ct, MAGIC_V1.length + 28);
    return out;
  }

  const out = new Uint8Array(16 + 12 + ct.length);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(ct, 28);
  return out;
}

describe('crypto envelope — frozen format', () => {
  const SALT = fromHex('000102030405060708090a0b0c0d0e0f');
  const IV = fromHex('101112131415161718191a1b');
  const PASSWORD = 'correct horse battery staple';
  const PLAINTEXT = 'segredo';

  it('pins the magic bytes and their lengths', () => {
    // V1 is ELEVEN bytes and V2 is TEN. Reading V1 at offset 10 silently
    // shifts the salt by one byte and decryption fails on valid files.
    expect(dec.decode(MAGIC_V2)).toBe('NADASAI_V2');
    expect(MAGIC_V2.length).toBe(10);
    expect(dec.decode(MAGIC_V1)).toBe('NADASAI_ENC');
    expect(MAGIC_V1.length).toBe(11);
  });

  it('pins the KDF parameters', () => {
    // Raising this without a V3 header that stores the count makes every
    // existing .enc file undecryptable. See the note in envelope.ts.
    expect(PBKDF2_ITERATIONS).toBe(100_000);
  });

  it('builds a byte-exact V2 envelope (golden vector)', () => {
    const ciphertext = fromHex('deadbeefcafebabe').buffer;
    const out = buildEnvelope(ciphertext, SALT, IV, { name: 'a.txt', type: 'text/plain' });

    const meta = '{"name":"a.txt","type":"text/plain"}';
    const expected =
      hex(enc.encode('NADASAI_V2')) +
      '0024' +                                  // metaLen = 36, BIG-endian
      hex(enc.encode(meta)) +
      '000102030405060708090a0b0c0d0e0f' +      // salt
      '101112131415161718191a1b' +              // iv
      'deadbeefcafebabe';                       // ciphertext

    expect(meta.length).toBe(0x24);
    expect(hex(out)).toBe(expected);
  });

  it('writes metaLen big-endian, so a >255-byte meta round-trips', () => {
    // A little-endian "fix" passes every short-name test and corrupts exactly
    // the files with long names.
    const longName = 'x'.repeat(300);
    const out = buildEnvelope(new Uint8Array(40).buffer, SALT, IV, { name: longName, type: 'text/plain' });
    const parsed = parseEnvelope(out);
    expect(parsed.version).toBe('v2');
    expect(parsed.meta?.name).toBe(longName);
  });

  it('parses a subarray with a non-zero byteOffset identically to a copy', () => {
    // The component read metaLen through `new DataView(data.buffer)`, which is
    // only correct when byteOffset is 0. In a shared module it is not.
    const out = buildEnvelope(fromHex('00112233').buffer, SALT, IV, { name: 'b.bin', type: 'x/y' });
    const padded = new Uint8Array(out.length + 7);
    padded.set(out, 7);
    const view = padded.subarray(7);

    expect(view.byteOffset).not.toBe(0);
    expect(parseEnvelope(view)).toEqual(parseEnvelope(out.slice()));
  });

  describe('decrypting files written by earlier versions', () => {
    // The point of the whole module: a file encrypted by any shipped build
    // must still open.
    (['v2', 'v1', 'legacy'] as const).forEach((version) => {
      it(`decrypts a ${version} envelope`, async () => {
        const bytes = await makeEnvelope(version, PLAINTEXT, PASSWORD, SALT, IV);
        const result = await decryptEnvelope(bytes, PASSWORD);
        expect(result.version).toBe(version);
        expect(dec.decode(new Uint8Array(result.data))).toBe(PLAINTEXT);
      });
    });

    it('recovers name and type from V2 metadata only', async () => {
      const v2 = await decryptEnvelope(await makeEnvelope('v2', PLAINTEXT, PASSWORD, SALT, IV), PASSWORD);
      expect(v2.meta).toEqual({ name: 'note.txt', type: 'text/plain' });

      const v1 = await decryptEnvelope(await makeEnvelope('v1', PLAINTEXT, PASSWORD, SALT, IV), PASSWORD);
      expect(v1.meta).toBeNull();
    });
  });

  it('round-trips through encryptBytes', async () => {
    const bytes = await encryptBytes(enc.encode(PLAINTEXT).buffer, PASSWORD, { name: 'r.txt', type: 'text/plain' });
    const back = await decryptEnvelope(bytes, PASSWORD);
    expect(dec.decode(new Uint8Array(back.data))).toBe(PLAINTEXT);
    expect(back.meta).toEqual({ name: 'r.txt', type: 'text/plain' });
  });

  it('still decrypts a V2 envelope whose metadata is unparseable', async () => {
    // The payload is intact; only the suggested filename is lost. Refusing here
    // would strand a recoverable file.
    const good = await makeEnvelope('v2', PLAINTEXT, PASSWORD, SALT, IV);
    good[MAGIC_V2.length + 2] = 0x7b; // '{' with nothing after it — invalid JSON
    good[MAGIC_V2.length + 3] = 0x7b;

    const back = await decryptEnvelope(good, PASSWORD);
    expect(dec.decode(new Uint8Array(back.data))).toBe(PLAINTEXT);
    expect(back.meta).toBeNull();
  });

  describe('failure modes are distinguishable only where they really differ', () => {
    it('reports a wrong password as crypto_decrypt_failed', async () => {
      const bytes = await makeEnvelope('v2', PLAINTEXT, PASSWORD, SALT, IV);
      await expectAppError(() => decryptEnvelope(bytes, 'wrong'), 'crypto_decrypt_failed');
    });

    it('reports a flipped ciphertext bit as crypto_decrypt_failed TOO', async () => {
      // Deliberate: AES-GCM's tag is one bit of information and cannot tell
      // these apart. Anyone "improving" this into two messages is inventing a
      // distinction that does not exist.
      const bytes = await makeEnvelope('v2', PLAINTEXT, PASSWORD, SALT, IV);
      bytes[bytes.length - 1] ^= 0xff;
      await expectAppError(() => decryptEnvelope(bytes, PASSWORD), 'crypto_decrypt_failed');
    });

    it('rejects a V2 header whose metaLen overruns the buffer', () => {
      const out = buildEnvelope(fromHex('00112233').buffer, SALT, IV, { name: 'a', type: 'b' });
      new DataView(out.buffer).setUint16(MAGIC_V2.length, 0xffff, false);
      expect(() => parseEnvelope(out)).toThrowMatching(
        (e: unknown) => e instanceof AppError && e.code === 'crypto_bad_envelope',
      );
    });

    it('rejects a file too short to hold a salt and an IV', () => {
      expect(() => parseEnvelope(new Uint8Array(12))).toThrowMatching(
        (e: unknown) => e instanceof AppError && e.code === 'crypto_bad_envelope',
      );
    });
  });
});

async function expectAppError(fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    fail(`expected AppError('${code}') but nothing was thrown`);
  } catch (err) {
    expect(err instanceof AppError).toBe(true);
    expect((err as AppError).code).toBe(code);
  }
}
