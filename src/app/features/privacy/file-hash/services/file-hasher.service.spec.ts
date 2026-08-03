import { TestBed } from '@angular/core/testing';
import { AppError } from '../../../../core/errors';
import { CHUNK_BYTES, MAX_WHOLE_BUFFER_BYTES } from '../../../../core/hash/hash-file';
import { FileHasherService } from './file-hasher.service';

/**
 * The digests themselves are pinned against published vectors in
 * core/hash/*.spec.ts. This layer owns three things worth their own test: which
 * algorithms actually run, that the chunked read produces the same digest as a
 * single-shot one, and that a failure arrives as an AppError rather than a raw
 * throw the component would show as a stopped spinner.
 */

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('FileHasherService', () => {
  let service: FileHasherService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FileHasherService);
  });

  it('computes only the algorithms asked for', async () => {
    const file = new Blob([new Uint8Array(1024)]);

    const one = await service.hashFile({ file, algos: ['sha256'] });
    expect(Object.keys(one)).toEqual(['sha256']);

    // SHA-512 is opt-in because it is the one that cannot stream — computing it
    // alongside the others would quietly read the whole file into memory.
    const all = await service.hashFile({ file, algos: ['sha256', 'sha512', 'md5'] });
    expect(Object.keys(all).sort()).toEqual(['md5', 'sha256', 'sha512']);
  });

  it('gives the same digest across a chunk boundary as in one pass', async () => {
    // Deliberately larger than one 4 MB slice: an incremental hash that mishandles
    // the carry between blocks is correct on small inputs and wrong here.
    const bytes = new Uint8Array(CHUNK_BYTES + 12345);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + (i >> 8)) % 256;

    const streamed = await service.hashFile({ file: new Blob([bytes]), algos: ['sha256'] });
    const native = await crypto.subtle.digest('SHA-256', bytes);
    const expected = Array.from(new Uint8Array(native), (b) => b.toString(16).padStart(2, '0')).join('');

    expect(streamed.sha256).toBe(expected);
  }, 30000);

  it('reports progress and ends at 100, even for an empty file', async () => {
    const seen: number[] = [];
    const result = await service.hashFile({
      file: new Blob([]),
      algos: ['sha256'],
      onProgress: (p) => seen.push(p),
    });

    expect(result.sha256).toBe(EMPTY_SHA256);
    expect(seen[seen.length - 1]).toBe(100);
  });

  it('returns nothing rather than reading the file when no algorithm is selected', async () => {
    const file = new Blob([new Uint8Array(64)]);
    const slice = spyOn(file, 'slice').and.callThrough();

    expect(await service.hashFile({ file, algos: [] })).toEqual({});
    expect(slice).not.toHaveBeenCalled();
  });

  it('passes an abort through as an AbortError, not as a generic failure', async () => {
    const controller = new AbortController();
    controller.abort();

    await expectAsync(
      service.hashFile({ file: new Blob([new Uint8Array(1024)]), algos: ['sha256'], signal: controller.signal }),
    ).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
  });

  it('refuses SHA-512 on a file too large to hold whole', async () => {
    const huge = { size: MAX_WHOLE_BUFFER_BYTES + 1, slice: () => new Blob([]) } as unknown as Blob;

    await expectAsync(service.hashFile({ file: huge, algos: ['sha512'] })).toBeRejectedWith(
      jasmine.objectContaining({ code: 'hash_too_large' } as Partial<AppError>),
    );
  });

  it('hashes text without a file', async () => {
    const result = await service.hashText('abc', ['sha256']);
    expect(result.sha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
