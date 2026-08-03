import { AppError } from '../errors';

/**
 * JPEG marker-level surgery.
 *
 * The point of working at this level is that the compressed scan is never
 * decoded: stripping metadata copies the entropy-coded bytes verbatim, so the
 * output is bit-for-bit the same image. The tool this replaces decoded to a
 * canvas and re-encoded at quality 0.95 — a second generation of loss, plus a
 * destroyed ICC profile, on every use of a tool whose entire promise is
 * "remove the metadata".
 */

export const SOI = 0xd8;
export const EOI = 0xd9;
export const SOS = 0xda;
export const APP0 = 0xe0;
export const APP1 = 0xe1;
export const APP2 = 0xe2;
export const APP13 = 0xed;
export const APP15 = 0xef;
export const COM = 0xfe;

export interface JpegSegment {
  readonly marker: number;
  /** Offset of the 0xFF that introduces the segment. */
  readonly start: number;
  /** Offset just past the segment's payload. */
  readonly end: number;
  /** The payload, excluding the marker and the two length bytes. */
  readonly payload: Uint8Array;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === SOI && bytes[2] === 0xff;
}

/**
 * Walks the header segments and stops AT the start-of-scan marker. Everything
 * from SOS to the end is entropy-coded image data plus the final EOI, and it is
 * copied as one opaque block — parsing into it would mean decoding.
 */
export function walkJpegSegments(bytes: Uint8Array): { segments: JpegSegment[]; scanStart: number } {
  if (!isJpeg(bytes)) throw new AppError('exif_unsupported');

  const segments: JpegSegment[] = [];
  let at = 2; // past SOI

  while (at < bytes.length) {
    if (bytes[at] !== 0xff) throw new AppError('exif_malformed');

    // Fill bytes: a run of 0xFF before the marker is legal padding.
    let markerAt = at + 1;
    while (markerAt < bytes.length && bytes[markerAt] === 0xff) markerAt++;
    if (markerAt >= bytes.length) throw new AppError('exif_malformed');

    const marker = bytes[markerAt];

    // Standalone markers carry no length.
    if (marker === EOI) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at = markerAt + 1;
      continue;
    }

    if (marker === SOS) return { segments, scanStart: at };

    if (markerAt + 3 > bytes.length) throw new AppError('exif_malformed');
    const length = (bytes[markerAt + 1] << 8) | bytes[markerAt + 2];
    if (length < 2) throw new AppError('exif_malformed');

    const payloadStart = markerAt + 3;
    const end = markerAt + 1 + length;
    if (end > bytes.length) throw new AppError('exif_malformed');

    segments.push({ marker, start: at, end, payload: bytes.subarray(payloadStart, end) });
    at = end;
  }

  // No SOS at all — a header-only file. Treat the tail as empty.
  return { segments, scanStart: bytes.length };
}

const EXIF_PREFIX = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

export function isExifSegment(segment: JpegSegment): boolean {
  if (segment.marker !== APP1 || segment.payload.length < EXIF_PREFIX.length) return false;
  return EXIF_PREFIX.every((b, i) => segment.payload[i] === b);
}

export function isXmpSegment(segment: JpegSegment): boolean {
  if (segment.marker !== APP1) return false;
  const head = String.fromCharCode(...segment.payload.subarray(0, 28));
  return head.startsWith('http://ns.adobe.com/xap/');
}

export function isIccSegment(segment: JpegSegment): boolean {
  if (segment.marker !== APP2 || segment.payload.length < 11) return false;
  return String.fromCharCode(...segment.payload.subarray(0, 11)) === 'ICC_PROFILE';
}

export interface JpegStripOptions {
  /**
   * The ICC profile is a colour-space description, not personal data. Dropping
   * it is what made the old canvas path shift the colours of a Display-P3 or
   * AdobeRGB photo.
   */
  readonly keepIcc: boolean;
  /**
   * Orientation lives in IFD0 inside APP1, so discarding APP1 takes it with
   * everything else — and a phone photo shot in portrait, which every viewer
   * currently rotates for you, comes back sideways. `exiftool -all=` behaves
   * the same way and users hate it. When true, a minimal APP1 carrying ONLY
   * Orientation is written back: ~32 bytes that reveal no camera, no place and
   * no time, and the scan stays untouched so the strip is still lossless.
   */
  readonly keepOrientation: boolean;
}

/** Marker classes that carry metadata rather than image structure. */
function isMetadataSegment(segment: JpegSegment, keepIcc: boolean): boolean {
  const m = segment.marker;
  if (m === COM) return true;
  if (m === APP0) return false;                      // JFIF: density only
  if (m === APP2) return !(keepIcc && isIccSegment(segment));
  if (m === APP13) return true;                      // Photoshop IRB / IPTC
  return m >= APP1 && m <= APP15;                    // APP1 (Exif, XMP), APP3..APP15
}

/**
 * Builds the 32-byte APP1 that carries nothing but the Orientation tag:
 *
 *   FF E1 len "Exif\0\0" II 42 8 <1 entry> <next=0>
 */
export function buildOrientationApp1(orientation: number): Uint8Array {
  const tiff = new Uint8Array(26);
  const view = new DataView(tiff.buffer);

  tiff[0] = 0x49; tiff[1] = 0x49;          // "II" — little-endian
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);              // IFD0 starts right after the header
  view.setUint16(8, 1, true);              // one entry
  view.setUint16(10, 0x0112, true);        // Orientation
  view.setUint16(12, 3, true);             // SHORT
  view.setUint32(14, 1, true);             // count
  view.setUint16(18, orientation, true);   // inline value (padded to 4 bytes)
  view.setUint32(22, 0, true);             // no next IFD

  const payload = new Uint8Array(EXIF_PREFIX.length + tiff.length);
  payload.set(EXIF_PREFIX, 0);
  payload.set(tiff, EXIF_PREFIX.length);

  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff;
  out[1] = APP1;
  out[2] = ((payload.length + 2) >> 8) & 0xff;
  out[3] = (payload.length + 2) & 0xff;
  out.set(payload, 4);
  return out;
}

export function stripJpegMetadata(
  bytes: Uint8Array,
  options: JpegStripOptions,
  orientation?: number,
): Uint8Array {
  const { segments, scanStart } = walkJpegSegments(bytes);

  const kept = segments.filter((s) => !isMetadataSegment(s, options.keepIcc));

  const orientationSegment =
    options.keepOrientation && orientation !== undefined && orientation > 1 && orientation <= 8
      ? buildOrientationApp1(orientation)
      : null;

  const tail = bytes.subarray(scanStart); // SOS + entropy-coded scan + EOI, verbatim
  const size =
    2 +
    (orientationSegment?.length ?? 0) +
    kept.reduce((sum, s) => sum + (s.end - s.start), 0) +
    tail.length;

  const out = new Uint8Array(size);
  let at = 0;

  out[at++] = 0xff;
  out[at++] = SOI;

  // The orientation APP1 goes first so it precedes any other APPn, which is
  // what decoders expect of an Exif segment.
  if (orientationSegment) {
    out.set(orientationSegment, at);
    at += orientationSegment.length;
  }

  for (const segment of kept) {
    out.set(bytes.subarray(segment.start, segment.end), at);
    at += segment.end - segment.start;
  }

  out.set(tail, at);
  return out;
}
