import { TestBed } from '@angular/core/testing';
import { AppError } from '../../../../core/errors';
import { MAX_CRYPTO_BYTES } from '../../../../core/crypto/envelope';
import { FileEncryptorService } from './file-encryptor.service';

/**
 * The envelope format itself is pinned byte-exactly in envelope.spec.ts. What
 * is left to this layer is the part a user actually loses a file to: the name
 * and type that come back, and the guard that stops a file too large to hold.
 */

const PASSWORD = 'uma senha razoavelmente longa';

function makeFile(name = 'foto.png', type = 'image/png'): File {
  const bytes = new Uint8Array(4096);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) % 256;
  return new File([bytes], name, { type });
}

describe('FileEncryptorService', () => {
  let service: FileEncryptorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FileEncryptorService);
  });

  it('roundtrips the exact bytes, the name and the type', async () => {
    const original = makeFile();
    const encrypted = await service.encrypt({ file: original, password: PASSWORD });
    expect(encrypted.filename).toBe('foto.png.enc');

    const envelope = new File([encrypted.blob], encrypted.filename);
    const decrypted = await service.decrypt({ file: envelope, password: PASSWORD });

    expect(decrypted.filename).toBe('foto.png');
    expect(decrypted.blob.type).toBe('image/png');
    expect(new Uint8Array(await decrypted.blob.arrayBuffer())).toEqual(
      new Uint8Array(await original.arrayBuffer()),
    );
  });

  it('recovers the name from the envelope, not from the .enc filename', async () => {
    const encrypted = await service.encrypt({ file: makeFile('contrato.pdf', 'application/pdf'), password: PASSWORD });

    // Renamed in transit — a mail client, a download folder collision, a user.
    // The name lives inside the encrypted metadata, so it survives.
    const renamed = new File([encrypted.blob], 'anexo (2).enc');
    const decrypted = await service.decrypt({ file: renamed, password: PASSWORD });

    expect(decrypted.filename).toBe('contrato.pdf');
  });

  it('rejects a wrong password', async () => {
    const encrypted = await service.encrypt({ file: makeFile(), password: PASSWORD });
    const envelope = new File([encrypted.blob], 'foto.png.enc');

    await expectAsync(service.decrypt({ file: envelope, password: 'outra senha' })).toBeRejected();
  });

  it('reports read progress and finishes at 100', async () => {
    const seen: number[] = [];
    await service.encrypt({ file: makeFile(), password: PASSWORD, onProgress: (p) => seen.push(p) });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(100);
  });

  it('refuses a file over the size ceiling before reading a byte of it', async () => {
    // Faked rather than allocated: the point of the guard is that 256 MB is
    // more than the tab can hold in memory twice, so a spec that actually built
    // one would be reproducing the crash it prevents.
    const huge = { size: MAX_CRYPTO_BYTES + 1, name: 'grande.bin', type: '' } as unknown as File;

    await expectAsync(service.encrypt({ file: huge, password: PASSWORD })).toBeRejectedWith(
      jasmine.objectContaining({ code: 'crypto_too_large' } as Partial<AppError>),
    );
  });
});
