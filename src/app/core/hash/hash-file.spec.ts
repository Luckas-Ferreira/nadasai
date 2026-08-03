import { AppError } from '../errors';
import { MAX_WHOLE_BUFFER_BYTES, hashFile, hashText, matchAlgo, normalizeExpected, toHex } from './hash-file';
import { md5 } from './md5';
import { sha256 } from './sha256';

describe('hashFile', () => {
  const data = new Uint8Array(10 * 1024 * 1024).map((_, i) => (i * 31) % 256);
  const blob = new Blob([data]);

  it('streams a multi-chunk blob to the same digests as the one-shot functions', async () => {
    const result = await hashFile(blob, ['sha256', 'md5']);
    expect(result.sha256).toBe(sha256(data));
    expect(result.md5).toBe(md5(data));
  });

  it('agrees with WebCrypto for sha512', async () => {
    const small = new Blob([new Uint8Array([1, 2, 3])]);
    const result = await hashFile(small, ['sha512']);
    const native = toHex(await crypto.subtle.digest('SHA-512', new Uint8Array([1, 2, 3])));
    expect(result.sha512).toBe(native);
  });

  it('only computes what was asked for', async () => {
    const result = await hashFile(new Blob(['abc']), ['sha256']);
    expect(result.sha256).toBeDefined();
    expect(result.md5).toBeUndefined();
    expect(result.sha512).toBeUndefined();
  });

  it('reports monotonic progress ending at 100', async () => {
    const seen: number[] = [];
    await hashFile(blob, ['sha256'], (p) => seen.push(p));
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[seen.length - 1]).toBe(100);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });

  it('handles an empty blob', async () => {
    const result = await hashFile(new Blob([]), ['sha256', 'md5']);
    expect(result.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(result.md5).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('refuses sha512 on a blob past the whole-buffer limit', async () => {
    // The streamed algorithms have no such limit; only the one that must read
    // the file whole does.
    const huge = { size: MAX_WHOLE_BUFFER_BYTES + 1 } as Blob;
    try {
      await hashFile(huge, ['sha512']);
      fail('expected hash_too_large');
    } catch (err) {
      expect(err instanceof AppError).toBe(true);
      expect((err as AppError).code).toBe('hash_too_large');
    }
  });

  it('hashes text', async () => {
    const result = await hashText('abc', ['sha256']);
    expect(result.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('normalizeExpected', () => {
  it('takes just the digest from a sha256sum line', () => {
    expect(normalizeExpected('d2a84f4b8b650937ec8f73cd8be2c74a  ubuntu-24.04.iso'))
      .toBe('d2a84f4b8b650937ec8f73cd8be2c74a');
  });

  it('handles the binary-mode asterisk and stray whitespace', () => {
    expect(normalizeExpected('  ABCDEF *file.iso  ')).toBe('abcdef');
  });

  it('lowercases', () => {
    expect(normalizeExpected('DEADBEEF')).toBe('deadbeef');
  });
});

describe('matchAlgo', () => {
  const result = { sha256: 'aaa', md5: 'bbb' };

  it('names which algorithm matched', () => {
    expect(matchAlgo('AAA', result)).toBe('sha256');
    expect(matchAlgo('bbb  file.iso', result)).toBe('md5');
  });

  it('returns null when nothing matches or nothing was pasted', () => {
    expect(matchAlgo('ccc', result)).toBeNull();
    expect(matchAlgo('   ', result)).toBeNull();
  });
});
