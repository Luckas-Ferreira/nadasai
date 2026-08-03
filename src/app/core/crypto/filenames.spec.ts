import { mimeFromFilename, restoreName, sanitizeDecryptedFilename } from './filenames';

describe('sanitizeDecryptedFilename', () => {
  it('strips .enc case-insensitively', () => {
    expect(sanitizeDecryptedFilename('photo.jpg.enc')).toBe('photo.jpg');
    expect(sanitizeDecryptedFilename('photo.jpg.ENC')).toBe('photo.jpg');
  });

  it("moves a browser's duplicate suffix back behind the extension", () => {
    // Chrome saves a second copy of report.pdf.enc as "report.pdf (1).enc";
    // stripping .enc leaves "report.pdf (1)", which no longer looks like a PDF
    // to the OS. The original regex used string-style double escapes inside a
    // regex literal, so this branch never ran.
    expect(sanitizeDecryptedFilename('report.pdf (1).enc')).toBe('report (1).pdf');
    expect(sanitizeDecryptedFilename('notes.docx (12).enc')).toBe('notes (12).docx');
  });

  it('leaves ordinary names alone', () => {
    expect(sanitizeDecryptedFilename('plain.txt')).toBe('plain.txt');
    expect(sanitizeDecryptedFilename('no-extension')).toBe('no-extension');
  });
});

describe('mimeFromFilename', () => {
  it('maps the known extensions', () => {
    expect(mimeFromFilename('a.pdf')).toBe('application/pdf');
    expect(mimeFromFilename('a.JPG')).toBe('image/jpeg');
    expect(mimeFromFilename('a.jpeg')).toBe('image/jpeg');
    expect(mimeFromFilename('a.mp3')).toBe('audio/mpeg');
    expect(mimeFromFilename('a.zip')).toBe('application/zip');
  });

  it('falls back to octet-stream', () => {
    expect(mimeFromFilename('a.xyz')).toBe('application/octet-stream');
    expect(mimeFromFilename('noextension')).toBe('application/octet-stream');
  });
});

describe('restoreName', () => {
  it('prefers the envelope metadata when it is there', () => {
    expect(restoreName('whatever.enc', { name: 'contrato.pdf', type: 'application/pdf' }))
      .toEqual({ name: 'contrato.pdf', type: 'application/pdf' });
  });

  it('reconstructs from the filename when there is no metadata', () => {
    expect(restoreName('contrato.pdf.enc', null))
      .toEqual({ name: 'contrato.pdf', type: 'application/pdf' });
  });

  it('prefixes decrypted_ when stripping changed nothing', () => {
    // A legacy envelope that was renamed and no longer ends in .enc — writing
    // the plaintext over the name the user picked would be surprising.
    expect(restoreName('mystery', null).name).toBe('decrypted_mystery');
  });
});
