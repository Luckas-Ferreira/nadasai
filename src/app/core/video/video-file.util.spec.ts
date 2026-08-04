import { AppError } from '../errors';
import {
  MAX_VIDEO_BYTES,
  assertUsableVideo,
  isSupportedVideo,
  readAudioHint,
} from './video-file.util';

function fakeFile(name: string, type: string, size = 1024): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('video-file.util', () => {
  describe('isSupportedVideo', () => {
    it('accepts the declared MIME types', () => {
      expect(isSupportedVideo(fakeFile('a.mp4', 'video/mp4'))).toBe(true);
      expect(isSupportedVideo(fakeFile('a.mov', 'video/quicktime'))).toBe(true);
      expect(isSupportedVideo(fakeFile('a.webm', 'video/webm'))).toBe(true);
    });

    /**
     * O Windows entrega .mkv e .avi com `type` vazio com frequência suficiente
     * para que um filtro só por MIME os torne inabríveis — este é o caso que a
     * volta pelo nome existe para cobrir.
     */
    it('falls back to the extension when the OS reports no type', () => {
      expect(isSupportedVideo(fakeFile('reuniao.mkv', ''))).toBe(true);
      expect(isSupportedVideo(fakeFile('antigo.avi', ''))).toBe(true);
      expect(isSupportedVideo(fakeFile('camera.MP4', ''))).toBe(true);
    });

    it('rejects audio and documents', () => {
      expect(isSupportedVideo(fakeFile('a.mp3', 'audio/mpeg'))).toBe(false);
      expect(isSupportedVideo(fakeFile('a.pdf', 'application/pdf'))).toBe(false);
      // `.m4a` e `.m4v` diferem por uma letra e são coisas diferentes.
      expect(isSupportedVideo(fakeFile('a.m4a', ''))).toBe(false);
      expect(isSupportedVideo(fakeFile('a.m4v', ''))).toBe(true);
    });
  });

  describe('assertUsableVideo', () => {
    it('throws a typed error for the wrong kind of file', () => {
      expect(() => assertUsableVideo(fakeFile('a.mp3', 'audio/mpeg'))).toThrowMatching(
        (err) => err instanceof AppError && err.code === 'video_unsupported',
      );
    });

    it('throws on the byte ceiling', () => {
      expect(() =>
        assertUsableVideo(fakeFile('a.mp4', 'video/mp4', MAX_VIDEO_BYTES + 1)),
      ).toThrowMatching((err) => err instanceof AppError && err.code === 'video_too_large');
    });

    it('passes a file at exactly the ceiling', () => {
      expect(() => assertUsableVideo(fakeFile('a.mp4', 'video/mp4', MAX_VIDEO_BYTES))).not.toThrow();
    });
  });

  describe('readAudioHint', () => {
    it('reads the Firefox flag', () => {
      expect(readAudioHint({ mozHasAudio: true } as unknown as HTMLVideoElement)).toBe(true);
      expect(readAudioHint({ mozHasAudio: false } as unknown as HTMLVideoElement)).toBe(false);
    });

    it('reads the audioTracks list when there is one', () => {
      expect(readAudioHint({ audioTracks: { length: 1 } } as unknown as HTMLVideoElement)).toBe(true);
      expect(readAudioHint({ audioTracks: { length: 0 } } as unknown as HTMLVideoElement)).toBe(false);
    });

    /**
     * O contador do WebKit só é conclusivo DEPOIS de decodificar algo: zero
     * significa "ainda não sei", e devolver `false` ali faria a ferramenta
     * acusar de mudo todo vídeo que ainda não começou a tocar.
     */
    it('treats a zeroed WebKit counter as unknown, not as silence', () => {
      expect(
        readAudioHint({ webkitAudioDecodedByteCount: 0 } as unknown as HTMLVideoElement),
      ).toBeNull();
      expect(
        readAudioHint({ webkitAudioDecodedByteCount: 4096 } as unknown as HTMLVideoElement),
      ).toBe(true);
    });

    it('is null when the browser says nothing', () => {
      expect(readAudioHint({} as HTMLVideoElement)).toBeNull();
    });
  });
});
