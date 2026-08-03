import { AppError } from '../errors';

/**
 * PNG chunk-level surgery.
 *
 * PNG makes this almost free: the CRC is per chunk, so removing whole chunks
 * needs no recomputation and the IDAT bytes are copied verbatim. That property
 * is what makes the strip trivially lossless, and it deserves the test that
 * pins it.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface PngChunk {
  readonly type: string;
  /** Offset of the 4-byte length field. */
  readonly start: number;
  /** Offset just past the CRC. */
  readonly end: number;
  readonly data: Uint8Array;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && SIGNATURE.every((b, i) => bytes[i] === b);
}

export function walkPngChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new AppError('exif_unsupported');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let at = 8;

  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at, false);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const end = at + 12 + length; // length + type + data + crc
    if (end > bytes.length) throw new AppError('exif_malformed');

    chunks.push({ type, start: at, end, data: bytes.subarray(at + 8, at + 8 + length) });
    at = end;
    if (type === 'IEND') break;
  }

  if (chunks.length === 0) throw new AppError('exif_malformed');
  return chunks;
}

/** Textual and timestamp chunks, plus the EXIF one PNG gained in 2017. */
const METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

export function stripPngMetadata(bytes: Uint8Array, options: { keepIcc: boolean }): Uint8Array {
  const chunks = walkPngChunks(bytes);
  const kept = chunks.filter((c) => {
    if (METADATA_CHUNKS.has(c.type)) return false;
    if (c.type === 'iCCP') return options.keepIcc;
    return true;
  });

  const size = 8 + kept.reduce((sum, c) => sum + (c.end - c.start), 0);
  const out = new Uint8Array(size);
  out.set(SIGNATURE, 0);

  let at = 8;
  for (const chunk of kept) {
    out.set(bytes.subarray(chunk.start, chunk.end), at);
    at += chunk.end - chunk.start;
  }

  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Only needed to BUILD chunks (the specs do); stripping never recomputes one. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
