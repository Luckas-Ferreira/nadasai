import {
  MAX_UPLOAD_BYTES,
  assertUsableImage,
  baseName,
  extForMime,
  formatBytes,
  isSupportedImage,
  suffixedName,
} from './image-file.util';
import { AppError } from '../errors';

function fakeFile(name: string, type: string, size = 10): File {
  const file = new File([new Uint8Array(size)], name, { type });
  return file;
}

describe('image-file.util', () => {
  describe('suffixedName', () => {
    it('uses the real output extension, not the source one', () => {
      // The old app downloaded PNG bytes as `nobg-photo.jpg`.
      expect(suffixedName('photo.jpg', 'nobg', 'png')).toBe('photo-nobg.png');
    });

    it('does not stack prefixes when tools are chained', () => {
      expect(suffixedName('photo.jpg', 'crop', 'png')).toBe('photo-crop.png');
    });

    it('handles names with dots and names without an extension', () => {
      expect(suffixedName('my.photo.final.jpeg', 'min', 'webp')).toBe('my.photo.final-min.webp');
      expect(suffixedName('noext', 'min', 'webp')).toBe('noext-min.webp');
    });
  });

  describe('baseName', () => {
    it('strips only the last extension', () => {
      expect(baseName('a.b.c.png')).toBe('a.b.c');
      expect(baseName('plain')).toBe('plain');
    });
  });

  describe('extForMime', () => {
    it('maps known image and document types', () => {
      expect(extForMime('image/jpeg')).toBe('jpg');
      expect(extForMime('image/webp')).toBe('webp');
      expect(extForMime('application/pdf')).toBe('pdf');
      expect(extForMime('image/vnd.microsoft.icon')).toBe('ico');
    });
  });

  describe('isSupportedImage', () => {
    it('accepts AVIF as input even though we cannot encode it', () => {
      expect(isSupportedImage(fakeFile('x.avif', 'image/avif'))).toBe(true);
    });

    it('rejects PDF — this is what stops the converter feeding one back into the chain', () => {
      expect(isSupportedImage(fakeFile('x.pdf', 'application/pdf'))).toBe(false);
    });
  });

  describe('assertUsableImage', () => {
    it('throws unsupported_file for a non-image', () => {
      expect(() => assertUsableImage(fakeFile('x.txt', 'text/plain'))).toThrowMatching(
        (err: AppError) => err.code === 'unsupported_file',
      );
    });

    it('throws too_large past the size cap', () => {
      const big = fakeFile('big.png', 'image/png', 1);
      Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });

      expect(() => assertUsableImage(big)).toThrowMatching(
        (err: AppError) => err.code === 'too_large',
      );
    });

    it('accepts a normal image', () => {
      expect(() => assertUsableImage(fakeFile('ok.png', 'image/png'))).not.toThrow();
    });
  });

  describe('formatBytes', () => {
    it('formats across units', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    });
  });
});
