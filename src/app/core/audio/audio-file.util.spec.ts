import { AppError } from '../errors';
import {
  MAX_AUDIO_BYTES,
  assertUsableAudio,
  formatClock,
  formatTimecode,
  isSupportedAudio,
  parseTimecode,
} from './audio-file.util';

function fakeFile(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('audio-file.util', () => {
  describe('isSupportedAudio', () => {
    it('accepts by MIME type', () => {
      expect(isSupportedAudio(fakeFile('song.mp3', 'audio/mpeg'))).toBe(true);
      expect(isSupportedAudio(fakeFile('voice.ogg', 'audio/ogg'))).toBe(true);
    });

    it('falls back to the extension when the OS reports no type', () => {
      // Windows hands .m4a and .flac over with an empty `type` often enough that
      // a MIME-only gate rejects files the browser decodes perfectly.
      expect(isSupportedAudio(fakeFile('track.m4a', ''))).toBe(true);
      expect(isSupportedAudio(fakeFile('master.FLAC', ''))).toBe(true);
    });

    it('rejects anything else', () => {
      expect(isSupportedAudio(fakeFile('notes.txt', 'text/plain'))).toBe(false);
      expect(isSupportedAudio(fakeFile('photo.png', 'image/png'))).toBe(false);
    });
  });

  describe('assertUsableAudio', () => {
    it('throws a typed error the UI can translate', () => {
      expect(() => assertUsableAudio(fakeFile('a.txt', 'text/plain'))).toThrowMatching(
        (err) => err instanceof AppError && err.code === 'audio_unsupported',
      );
    });

    it('rejects a file past the byte ceiling', () => {
      const huge = { name: 'big.mp3', type: 'audio/mpeg', size: MAX_AUDIO_BYTES + 1 } as File;
      expect(() => assertUsableAudio(huge)).toThrowMatching(
        (err) => err instanceof AppError && err.code === 'audio_too_large',
      );
    });
  });

  describe('formatTimecode', () => {
    it('keeps milliseconds, because the fields are the precise control', () => {
      expect(formatTimecode(0)).toBe('0:00.000');
      expect(formatTimecode(9.25)).toBe('0:09.250');
      expect(formatTimecode(75.5)).toBe('1:15.500');
    });

    it('carries a rounded-up millisecond into the seconds', () => {
      // Naive rounding renders 59.9996 as "0:59.1000".
      expect(formatTimecode(59.9996)).toBe('1:00.000');
    });

    it('never goes negative', () => {
      expect(formatTimecode(-3)).toBe('0:00.000');
    });
  });

  describe('formatClock', () => {
    it('drops the milliseconds for rulers', () => {
      expect(formatClock(0)).toBe('0:00');
      expect(formatClock(61.4)).toBe('1:01');
      expect(formatClock(600)).toBe('10:00');
    });
  });

  describe('parseTimecode', () => {
    it('reads back what formatTimecode writes', () => {
      expect(parseTimecode('1:15.500')).toBeCloseTo(75.5);
    });

    it('accepts what people actually type', () => {
      expect(parseTimecode('90')).toBe(90);
      expect(parseTimecode('1:30')).toBe(90);
      expect(parseTimecode('01:30,500')).toBeCloseTo(90.5);
      expect(parseTimecode('1:02:03')).toBe(3723);
    });

    it('returns null instead of zero for junk, so a half-typed field is not committed', () => {
      expect(parseTimecode('')).toBeNull();
      expect(parseTimecode('abc')).toBeNull();
      expect(parseTimecode('1:2:3:4')).toBeNull();
      expect(parseTimecode('-5')).toBeNull();
    });
  });
});
