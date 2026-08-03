import { AppError } from '../errors';

/**
 * WebP (RIFF) chunk surgery.
 *
 * Worth having because the dropzone already advertises WebP and the old canvas
 * path silently transcoded it to JPEG under a .webp filename. Two things bite
 * if missed, and both are covered by the spec: the RIFF size field at offset 4
 * has to be rewritten, and the VP8X feature flags have to have their EXIF/XMP
 * bits cleared or decoders go looking for chunks that are no longer there.
 */

const RIFF = 'RIFF';
const WEBP = 'WEBP';

/** VP8X flag bits, in the first byte of that chunk. */
const FLAG_XMP = 0x04;
const FLAG_EXIF = 0x08;
const FLAG_ICC = 0x20;

export interface RiffChunk {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly data: Uint8Array;
}

function fourCC(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

export function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && fourCC(bytes, 0) === RIFF && fourCC(bytes, 8) === WEBP;
}

export function walkWebpChunks(bytes: Uint8Array): RiffChunk[] {
  if (!isWebp(bytes)) throw new AppError('exif_unsupported');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: RiffChunk[] = [];
  let at = 12;

  while (at + 8 <= bytes.length) {
    const type = fourCC(bytes, at);
    const size = view.getUint32(at + 4, true); // RIFF is little-endian
    // Chunks are padded to an even length; the pad byte is not counted in size.
    const end = at + 8 + size + (size % 2);
    if (at + 8 + size > bytes.length) throw new AppError('exif_malformed');

    chunks.push({ type, start: at, end: Math.min(end, bytes.length), data: bytes.subarray(at + 8, at + 8 + size) });
    at = end;
  }

  if (chunks.length === 0) throw new AppError('exif_malformed');
  return chunks;
}

export function stripWebpMetadata(bytes: Uint8Array, options: { keepIcc: boolean }): Uint8Array {
  const chunks = walkWebpChunks(bytes);

  const kept = chunks.filter((c) => {
    if (c.type === 'EXIF' || c.type === 'XMP ') return false;
    if (c.type === 'ICCP') return options.keepIcc;
    return true;
  });

  const body = kept.reduce((sum, c) => sum + (c.end - c.start), 0);
  const out = new Uint8Array(12 + body);
  const view = new DataView(out.buffer);

  out.set(bytes.subarray(0, 12), 0);
  // The RIFF size counts everything after this field, i.e. "WEBP" + the chunks.
  view.setUint32(4, 4 + body, true);

  let at = 12;
  for (const chunk of kept) {
    out.set(bytes.subarray(chunk.start, chunk.end), at);

    // Clear the flags for what was just removed. VP8X is always the first
    // chunk when it exists, and its payload starts 8 bytes in.
    if (chunk.type === 'VP8X') {
      let flags = out[at + 8];
      flags &= ~(FLAG_EXIF | FLAG_XMP);
      if (!options.keepIcc) flags &= ~FLAG_ICC;
      out[at + 8] = flags;
    }

    at += chunk.end - chunk.start;
  }

  return out;
}
