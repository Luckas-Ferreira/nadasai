import { AppError } from '../errors';

/**
 * The TIFF/IFD reader that sits under EXIF.
 *
 * EXIF is a TIFF file wrapped in a JPEG APP1 segment, so every offset inside it
 * is relative to the START OF THE TIFF HEADER, not to the file. That is the
 * single most common way these parsers go wrong, and it is why `tiffStart` is
 * threaded through every function here rather than being folded into a
 * subarray.
 */

export const TYPE_SIZES: Readonly<Record<number, number>> = {
  1: 1,  // BYTE
  2: 1,  // ASCII
  3: 2,  // SHORT
  4: 4,  // LONG
  5: 8,  // RATIONAL
  6: 1,  // SBYTE
  7: 1,  // UNDEFINED
  8: 2,  // SSHORT
  9: 4,  // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

export interface IfdEntry {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  /** Absolute offset within the DataView of the value bytes. */
  readonly valueOffset: number;
  readonly byteLength: number;
}

export interface Ifd {
  readonly entries: IfdEntry[];
  /** Offset of the next IFD relative to tiffStart, or 0 when there is none. */
  readonly nextIfd: number;
}

export interface TiffHeader {
  readonly little: boolean;
  /** Offset of IFD0 relative to tiffStart. */
  readonly firstIfd: number;
}

export function readTiffHeader(view: DataView, tiffStart: number): TiffHeader {
  if (tiffStart + 8 > view.byteLength) throw new AppError('exif_malformed');

  const order = view.getUint16(tiffStart, false);
  const little = order === 0x4949; // "II"
  if (!little && order !== 0x4d4d) throw new AppError('exif_malformed'); // "MM"

  if (view.getUint16(tiffStart + 2, little) !== 42) throw new AppError('exif_malformed');

  return { little, firstIfd: view.getUint32(tiffStart + 4, little) };
}

export function readIfd(view: DataView, tiffStart: number, ifdOffset: number, little: boolean): Ifd {
  const base = tiffStart + ifdOffset;
  if (base + 2 > view.byteLength) throw new AppError('exif_malformed');

  const count = view.getUint16(base, little);
  const entries: IfdEntry[] = [];

  for (let i = 0; i < count; i++) {
    const at = base + 2 + i * 12;
    if (at + 12 > view.byteLength) break; // truncated tail: keep what parsed

    const tag = view.getUint16(at, little);
    const type = view.getUint16(at + 2, little);
    const valueCount = view.getUint32(at + 4, little);
    const size = TYPE_SIZES[type];
    if (!size) continue; // unknown type: skip rather than abort the whole IFD

    const byteLength = size * valueCount;
    // Up to four bytes live inline in the offset field itself; anything larger
    // is stored elsewhere and the field holds a pointer.
    const valueOffset = byteLength <= 4 ? at + 8 : tiffStart + view.getUint32(at + 8, little);

    if (valueOffset < 0 || valueOffset + byteLength > view.byteLength) continue;
    entries.push({ tag, type, count: valueCount, valueOffset, byteLength });
  }

  const nextAt = base + 2 + count * 12;
  const nextIfd = nextAt + 4 <= view.byteLength ? view.getUint32(nextAt, little) : 0;

  return { entries, nextIfd };
}

export function readAscii(view: DataView, entry: IfdEntry): string {
  let out = '';
  for (let i = 0; i < entry.byteLength; i++) {
    const code = view.getUint8(entry.valueOffset + i);
    if (code === 0) break; // NUL-terminated, and the padding after is noise
    out += String.fromCharCode(code);
  }
  return out.trim();
}

/** Reads one numeric value, honouring the byte order. */
export function readNumberAt(view: DataView, entry: IfdEntry, little: boolean, index = 0): number | null {
  const size = TYPE_SIZES[entry.type];
  if (!size || index >= entry.count) return null;
  const at = entry.valueOffset + index * size;

  switch (entry.type) {
    case 1: case 7: return view.getUint8(at);
    case 6: return view.getInt8(at);
    case 3: return view.getUint16(at, little);
    case 8: return view.getInt16(at, little);
    case 4: return view.getUint32(at, little);
    case 9: return view.getInt32(at, little);
    case 5: {
      const denom = view.getUint32(at + 4, little);
      return denom === 0 ? 0 : view.getUint32(at, little) / denom;
    }
    case 10: {
      const denom = view.getInt32(at + 4, little);
      return denom === 0 ? 0 : view.getInt32(at, little) / denom;
    }
    case 11: return view.getFloat32(at, little);
    case 12: return view.getFloat64(at, little);
    default: return null;
  }
}

export function readNumbers(view: DataView, entry: IfdEntry, little: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < entry.count; i++) {
    const value = readNumberAt(view, entry, little, i);
    if (value === null) break;
    out.push(value);
  }
  return out;
}

/**
 * Degrees/minutes/seconds to a signed decimal. The sign comes from the *Ref
 * tag, and getting it wrong is the classic bug in these parsers — a photo in
 * São Paulo lands in Siberia.
 */
export function gpsToDecimal(ref: string, dms: readonly number[]): number | null {
  if (dms.length < 3) return null;
  const [deg, min, sec] = dms;
  const magnitude = deg + min / 60 + sec / 3600;
  const negative = ref === 'S' || ref === 'W';
  return negative ? -magnitude : magnitude;
}
