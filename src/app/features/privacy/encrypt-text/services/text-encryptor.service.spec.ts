import { TestBed } from '@angular/core/testing';
import { ARMOR_BEGIN, ARMOR_END, dearmor } from '../../../../core/crypto/armor';
import { FileEncryptorService } from '../../encrypt-file/services/file-encryptor.service';
import { TextEncryptorService } from './text-encryptor.service';

const PASSWORD = 'uma senha razoavelmente longa';
const MESSAGE = 'Mensagem com acento, emoji 🔒 e uma linha\nquebrada.';

describe('TextEncryptorService', () => {
  let service: TextEncryptorService;
  let files: FileEncryptorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TextEncryptorService);
    files = TestBed.inject(FileEncryptorService);
  });

  it('roundtrips a message, accents and newlines included', async () => {
    const armored = await service.encrypt(MESSAGE, PASSWORD);

    expect(armored.startsWith(ARMOR_BEGIN)).toBe(true);
    expect(armored.trimEnd().endsWith(ARMOR_END)).toBe(true);
    expect(armored).not.toContain('Mensagem');

    expect(await service.decrypt(armored, PASSWORD)).toBe(MESSAGE);
  });

  /**
   * The claim in the service's header comment, which was until now only a
   * comment: one envelope in two wrappers. If these ever diverge, a message
   * saved as a file stops opening in the tool that made it.
   */
  it('produces the SAME envelope the file tool reads', async () => {
    const armored = await service.encrypt(MESSAGE, PASSWORD);
    const envelope = new File([dearmor(armored)], 'mensagem.enc');

    const decrypted = await files.decrypt({ file: envelope, password: PASSWORD });

    expect(decrypted.filename).toBe('message.txt');
    expect(await decrypted.blob.text()).toBe(MESSAGE);
  });

  it('survives a block that a mail client mangled', async () => {
    const armored = await service.encrypt(MESSAGE, PASSWORD);
    const body = armored.replace(ARMOR_BEGIN, '').replace(ARMOR_END, '').replace(/\s+/g, '');
    const rewrapped = (body.match(/.{1,40}/g) ?? []).join('\r\n');

    // Rewrapped at another width, CRLFs from a Windows client, and a sentence
    // pasted on either side. The markers are what let the prose be discarded.
    const quoted = `Segue o bloco:\r\n${ARMOR_BEGIN}\r\n${rewrapped}\r\n${ARMOR_END}\r\nabraço`;
    expect(await service.decrypt(quoted, PASSWORD)).toBe(MESSAGE);

    // And with the markers stripped by a chat app, the bare block still opens.
    expect(await service.decrypt(rewrapped, PASSWORD)).toBe(MESSAGE);
  });

  it('rejects a wrong password and rejects text that is not a block', async () => {
    const armored = await service.encrypt(MESSAGE, PASSWORD);

    await expectAsync(service.decrypt(armored, 'outra senha')).toBeRejected();
    await expectAsync(service.decrypt('...', PASSWORD)).toBeRejected();
  });
});
