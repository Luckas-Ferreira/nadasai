import { createMd5, md5 } from './md5';

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);

describe('md5 — RFC 1321 test vectors', () => {
  const vectors: readonly [string, string][] = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890',
      '57edf4a22be3c955ac49da2e2107b67a'],
  ];

  vectors.forEach(([input, expected]) => {
    it(`hashes ${input.length ? `"${input.slice(0, 24)}${input.length > 24 ? '…' : ''}"` : 'the empty string'}`, () => {
      expect(md5(bytes(input))).toBe(expected);
    });
  });
});

describe('md5 incrementality', () => {
  // These are exactly the sizes where the padding branch changes behaviour, and
  // where a rewritten incremental version breaks if it is going to break.
  [0, 1, 55, 56, 57, 63, 64, 65, 127, 128, 129].forEach((len) => {
    it(`matches the one-shot digest for a ${len}-byte input`, () => {
      const data = new Uint8Array(len).map((_, i) => (i * 7) % 256);
      const h = createMd5();
      h.update(data);
      expect(h.digest()).toBe(md5(data));
    });
  });

  it('is independent of how the caller slices the input', () => {
    const data = new Uint8Array(1000).map((_, i) => (i * 13) % 256);
    const oneShot = md5(data);

    for (const size of [1, 7, 63, 64, 65, 500]) {
      const h = createMd5();
      for (let i = 0; i < data.length; i += size) h.update(data.subarray(i, i + size));
      expect(h.digest()).withContext(`chunked by ${size}`).toBe(oneShot);
    }
  });

  it('hashes a subarray with a non-zero byteOffset correctly', () => {
    const backing = new Uint8Array(200).map((_, i) => i % 256);
    const view = backing.subarray(70, 170);
    expect(view.byteOffset).toBe(70);
    expect(md5(view)).toBe(md5(backing.slice(70, 170)));
  });

  it('refuses to digest twice', () => {
    const h = createMd5();
    h.update(bytes('abc'));
    h.digest();
    expect(() => h.digest()).toThrow();
    expect(() => h.update(bytes('x'))).toThrow();
  });
});
