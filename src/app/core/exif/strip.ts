import { AppError } from '../errors';
import { readMetadata } from './exif-parser';
import { isJpeg, stripJpegMetadata } from './jpeg-segments';
import { isPng, stripPngMetadata } from './png-chunks';
import { isWebp, stripWebpMetadata } from './webp-chunks';

export interface StripOptions {
  readonly keepIcc: boolean;
  readonly keepOrientation: boolean;
}

export interface StripResult {
  readonly bytes: Uint8Array;
  readonly removedBytes: number;
}

export const DEFAULT_STRIP_OPTIONS: StripOptions = {
  // Colour-space description, not personal data. Dropping it is what made the
  // old canvas path shift the colours of a wide-gamut photo.
  keepIcc: true,
  // Keeps a ~32-byte APP1 holding nothing but the Orientation tag, so a photo
  // shot in portrait does not come back sideways.
  keepOrientation: true,
};

/**
 * Removes metadata WITHOUT re-encoding. The compressed image data is copied
 * byte for byte, which is what makes this lossless — and what the two-part
 * proof in strip.spec.ts pins (identical decoded pixels AND an identical
 * compressed tail; the first alone would pass a re-encode at quality 100).
 *
 * TIFF is deliberately refused rather than half-supported: rewriting IFD offset
 * chains losslessly is a bigger job than the other three formats combined, and
 * the tool used to accept TIFF, fail silently on it, and show nothing at all.
 */
export function stripMetadata(bytes: Uint8Array, options: StripOptions = DEFAULT_STRIP_OPTIONS): StripResult {
  let out: Uint8Array;

  if (isJpeg(bytes)) {
    const orientation = options.keepOrientation ? readMetadata(bytes).exif?.orientation : undefined;
    out = stripJpegMetadata(bytes, options, orientation);
  } else if (isPng(bytes)) {
    out = stripPngMetadata(bytes, options);
  } else if (isWebp(bytes)) {
    out = stripWebpMetadata(bytes, options);
  } else {
    throw new AppError('exif_unsupported');
  }

  return { bytes: out, removedBytes: Math.max(0, bytes.length - out.length) };
}

/** What the dropzone should accept — TIFF is absent on purpose. */
export const STRIPPABLE_ACCEPT = 'image/jpeg,image/png,image/webp';

export function isStrippable(bytes: Uint8Array): boolean {
  return isJpeg(bytes) || isPng(bytes) || isWebp(bytes);
}
