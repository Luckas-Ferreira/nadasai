import { createSha256, sha256 } from './sha256';
import { toHex } from './hash-file';

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);

describe('sha256 — FIPS 180-4 test vectors', () => {
  const vectors: readonly [string, string][] = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    // 448-bit message
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    // 896-bit message
    ['abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1'],
  ];

  vectors.forEach(([input, expected], i) => {
    it(`vector ${i + 1}`, () => {
      expect(sha256(bytes(input))).toBe(expected);
    });
  });

  it('hashes a million "a" characters', () => {
    const h = createSha256();
    const chunk = new Uint8Array(1000).fill(0x61);
    for (let i = 0; i < 1000; i++) h.update(chunk);
    expect(h.digest()).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
});

describe('sha256 cross-checked against WebCrypto', () => {
  // This is what closes the "a hand-rolled hash might be wrong" question.
  it('agrees with crypto.subtle.digest on random buffers', async () => {
    for (const len of [0, 1, 55, 56, 63, 64, 65, 200, 1000, 4096]) {
      const data = crypto.getRandomValues(new Uint8Array(len));
      const native = toHex(await crypto.subtle.digest('SHA-256', data));
      expect(sha256(data)).withContext(`${len} bytes`).toBe(native);
    }
  });
});

describe('sha256 incrementality', () => {
  [0, 1, 55, 56, 57, 63, 64, 65, 127, 128, 129].forEach((len) => {
    it(`matches the one-shot digest for a ${len}-byte input`, () => {
      const data = new Uint8Array(len).map((_, i) => (i * 11) % 256);
      const h = createSha256();
      h.update(data);
      expect(h.digest()).toBe(sha256(data));
    });
  });

  it('is independent of how the caller slices the input', () => {
    const data = new Uint8Array(1000).map((_, i) => (i * 17) % 256);
    const oneShot = sha256(data);

    for (const size of [1, 7, 63, 64, 65, 500]) {
      const h = createSha256();
      for (let i = 0; i < data.length; i += size) h.update(data.subarray(i, i + size));
      expect(h.digest()).withContext(`chunked by ${size}`).toBe(oneShot);
    }
  });
});
