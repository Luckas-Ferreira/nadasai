import {
  type JpegSegment,
  isExifSegment,
  isIccSegment,
  isJpeg,
  isXmpSegment,
  walkJpegSegments,
  APP13,
  COM,
} from './jpeg-segments';
import { isPng, walkPngChunks } from './png-chunks';
import { isWebp, walkWebpChunks } from './webp-chunks';
import { gpsToDecimal, readAscii, readIfd, readNumberAt, readNumbers, readTiffHeader } from './tiff-ifd';

/**
 * Reads the metadata a photo is carrying, so the tool can SHOW it before
 * removing it. That is the whole difference between "click and trust us" and
 * proof — the same instinct as the network probe on the home page.
 *
 * Scope is deliberately ~30 tags, not the 1,200 a full EXIF library carries.
 * MakerNote is the notable omission: vendor blocks are proprietary and
 * undocumented, and that is exactly where a body serial number often hides. We
 * do not decode it, but we DO report its presence and size, and we strip it
 * regardless because it lives inside APP1. Reporting is the privacy-relevant
 * fact; decoding is not.
 */

const TAG = {
  IMAGE_DESCRIPTION: 0x010e,
  MAKE: 0x010f,
  MODEL: 0x0110,
  ORIENTATION: 0x0112,
  SOFTWARE: 0x0131,
  DATE_TIME: 0x0132,
  ARTIST: 0x013b,
  COPYRIGHT: 0x8298,
  EXIF_IFD: 0x8769,
  GPS_IFD: 0x8825,

  EXPOSURE_TIME: 0x829a,
  F_NUMBER: 0x829d,
  ISO: 0x8827,
  DATE_TIME_ORIGINAL: 0x9003,
  DATE_TIME_DIGITIZED: 0x9004,
  OFFSET_TIME: 0x9010,
  FOCAL_LENGTH: 0x920a,
  MAKER_NOTE: 0x927c,
  USER_COMMENT: 0x9286,
  CAMERA_OWNER: 0xa430,
  BODY_SERIAL: 0xa431,
  LENS_MODEL: 0xa434,
  LENS_SERIAL: 0xa435,

  GPS_LAT_REF: 0x0001,
  GPS_LAT: 0x0002,
  GPS_LON_REF: 0x0003,
  GPS_LON: 0x0004,
  GPS_ALT_REF: 0x0005,
  GPS_ALT: 0x0006,
  GPS_DATE: 0x001d,

  THUMB_OFFSET: 0x0201,
  THUMB_LENGTH: 0x0202,
} as const;

export interface GpsFix {
  readonly latitude: number;
  readonly longitude: number;
  readonly altitudeM?: number;
  readonly dateStamp?: string;
}

export interface ExifData {
  make?: string;
  model?: string;
  lensModel?: string;
  bodySerial?: string;
  lensSerial?: string;
  ownerName?: string;
  artist?: string;
  copyright?: string;
  software?: string;
  imageDescription?: string;
  userComment?: string;
  dateTimeOriginal?: string;
  dateTimeDigitized?: string;
  dateTime?: string;
  offsetTime?: string;
  orientation?: number;
  fNumber?: number;
  exposureTimeS?: number;
  iso?: number;
  focalLengthMm?: number;
  gps?: GpsFix;
  hasMakerNote: boolean;
  makerNoteBytes: number;
  /**
   * IFD1 holds an embedded JPEG thumbnail — a SECOND COPY of the image. Many
   * editors update the pixels and not the thumbnail, so a photo you cropped or
   * redacted can still be carrying the original inside it. This is the single
   * most persuasive thing this tool can show, and it costs one IFD walk.
   */
  thumbnailBytes: number;
}

export interface MetadataReport {
  readonly format: 'jpeg' | 'png' | 'webp' | 'unknown';
  readonly totalMetadataBytes: number;
  readonly exif: ExifData | null;
  readonly xmpPackets: number;
  readonly xmpBytes: number;
  readonly iptcBytes: number;
  readonly iccBytes: number;
  readonly comments: string[];
  readonly textChunks: { keyword: string; value: string }[];
}

function emptyReport(format: MetadataReport['format']): MetadataReport {
  return {
    format,
    totalMetadataBytes: 0,
    exif: null,
    xmpPackets: 0,
    xmpBytes: 0,
    iptcBytes: 0,
    iccBytes: 0,
    comments: [],
    textChunks: [],
  };
}

/** Parses the TIFF block inside an Exif APP1 payload (which starts "Exif\0\0"). */
export function parseExifPayload(payload: Uint8Array): ExifData | null {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const tiffStart = 6; // past "Exif\0\0"

  let header;
  try {
    header = readTiffHeader(view, tiffStart);
  } catch {
    return null;
  }

  const { little } = header;
  const data: ExifData = { hasMakerNote: false, makerNoteBytes: 0, thumbnailBytes: 0 };

  const ifd0 = readIfd(view, tiffStart, header.firstIfd, little);
  let exifIfdOffset = 0;
  let gpsIfdOffset = 0;

  for (const entry of ifd0.entries) {
    switch (entry.tag) {
      case TAG.MAKE: data.make = readAscii(view, entry); break;
      case TAG.MODEL: data.model = readAscii(view, entry); break;
      case TAG.SOFTWARE: data.software = readAscii(view, entry); break;
      case TAG.ARTIST: data.artist = readAscii(view, entry); break;
      case TAG.COPYRIGHT: data.copyright = readAscii(view, entry); break;
      case TAG.IMAGE_DESCRIPTION: data.imageDescription = readAscii(view, entry); break;
      case TAG.DATE_TIME: data.dateTime = readAscii(view, entry); break;
      case TAG.ORIENTATION: data.orientation = readNumberAt(view, entry, little) ?? undefined; break;
      case TAG.EXIF_IFD: exifIfdOffset = readNumberAt(view, entry, little) ?? 0; break;
      case TAG.GPS_IFD: gpsIfdOffset = readNumberAt(view, entry, little) ?? 0; break;
      default: break;
    }
  }

  if (exifIfdOffset > 0) {
    const exifIfd = readIfd(view, tiffStart, exifIfdOffset, little);
    for (const entry of exifIfd.entries) {
      switch (entry.tag) {
        case TAG.DATE_TIME_ORIGINAL: data.dateTimeOriginal = readAscii(view, entry); break;
        case TAG.DATE_TIME_DIGITIZED: data.dateTimeDigitized = readAscii(view, entry); break;
        case TAG.OFFSET_TIME: data.offsetTime = readAscii(view, entry); break;
        case TAG.LENS_MODEL: data.lensModel = readAscii(view, entry); break;
        case TAG.BODY_SERIAL: data.bodySerial = readAscii(view, entry); break;
        case TAG.LENS_SERIAL: data.lensSerial = readAscii(view, entry); break;
        case TAG.CAMERA_OWNER: data.ownerName = readAscii(view, entry); break;
        case TAG.USER_COMMENT: data.userComment = readAscii(view, entry); break;
        case TAG.F_NUMBER: data.fNumber = readNumberAt(view, entry, little) ?? undefined; break;
        case TAG.EXPOSURE_TIME: data.exposureTimeS = readNumberAt(view, entry, little) ?? undefined; break;
        case TAG.ISO: data.iso = readNumberAt(view, entry, little) ?? undefined; break;
        case TAG.FOCAL_LENGTH: data.focalLengthMm = readNumberAt(view, entry, little) ?? undefined; break;
        case TAG.MAKER_NOTE:
          data.hasMakerNote = true;
          data.makerNoteBytes = entry.byteLength;
          break;
        default: break;
      }
    }
  }

  if (gpsIfdOffset > 0) {
    const gpsIfd = readIfd(view, tiffStart, gpsIfdOffset, little);
    let latRef = '';
    let lonRef = '';
    let lat: number[] = [];
    let lon: number[] = [];
    let altitude: number | undefined;
    let altRef = 0;
    let dateStamp: string | undefined;

    for (const entry of gpsIfd.entries) {
      switch (entry.tag) {
        case TAG.GPS_LAT_REF: latRef = readAscii(view, entry); break;
        case TAG.GPS_LON_REF: lonRef = readAscii(view, entry); break;
        case TAG.GPS_LAT: lat = readNumbers(view, entry, little); break;
        case TAG.GPS_LON: lon = readNumbers(view, entry, little); break;
        case TAG.GPS_ALT: altitude = readNumberAt(view, entry, little) ?? undefined; break;
        case TAG.GPS_ALT_REF: altRef = readNumberAt(view, entry, little) ?? 0; break;
        case TAG.GPS_DATE: dateStamp = readAscii(view, entry); break;
        default: break;
      }
    }

    const latitude = gpsToDecimal(latRef, lat);
    const longitude = gpsToDecimal(lonRef, lon);
    if (latitude !== null && longitude !== null) {
      data.gps = {
        latitude,
        longitude,
        // altRef 1 means below sea level.
        altitudeM: altitude === undefined ? undefined : altRef === 1 ? -altitude : altitude,
        dateStamp,
      };
    }
  }

  if (ifd0.nextIfd > 0) {
    const ifd1 = readIfd(view, tiffStart, ifd0.nextIfd, little);
    for (const entry of ifd1.entries) {
      if (entry.tag === TAG.THUMB_LENGTH) {
        data.thumbnailBytes = readNumberAt(view, entry, little) ?? 0;
      }
    }
  }

  return data;
}

function readJpegMetadata(bytes: Uint8Array): MetadataReport {
  let segments: JpegSegment[];
  try {
    ({ segments } = walkJpegSegments(bytes));
  } catch {
    return emptyReport('jpeg');
  }

  let exif: ExifData | null = null;
  let xmpPackets = 0;
  let xmpBytes = 0;
  let iptcBytes = 0;
  let iccBytes = 0;
  let total = 0;
  const comments: string[] = [];

  for (const segment of segments) {
    if (isExifSegment(segment)) {
      total += segment.end - segment.start;
      exif = parseExifPayload(segment.payload);
    } else if (isXmpSegment(segment)) {
      total += segment.end - segment.start;
      xmpPackets++;
      xmpBytes += segment.payload.length;
    } else if (isIccSegment(segment)) {
      iccBytes += segment.payload.length;
    } else if (segment.marker === APP13) {
      total += segment.end - segment.start;
      iptcBytes += segment.payload.length;
    } else if (segment.marker === COM) {
      total += segment.end - segment.start;
      comments.push(String.fromCharCode(...segment.payload).trim());
    }
  }

  return {
    format: 'jpeg',
    totalMetadataBytes: total,
    exif,
    xmpPackets,
    xmpBytes,
    iptcBytes,
    iccBytes,
    comments,
    textChunks: [],
  };
}

function readPngMetadata(bytes: Uint8Array): MetadataReport {
  let chunks;
  try {
    chunks = walkPngChunks(bytes);
  } catch {
    return emptyReport('png');
  }

  let total = 0;
  let iccBytes = 0;
  let exif: ExifData | null = null;
  const textChunks: { keyword: string; value: string }[] = [];

  for (const chunk of chunks) {
    if (chunk.type === 'iCCP') {
      iccBytes += chunk.data.length;
      continue;
    }
    if (chunk.type === 'eXIf') {
      total += chunk.end - chunk.start;
      // A PNG eXIf chunk holds the raw TIFF block with no "Exif\0\0" prefix,
      // so it is padded here to reuse the same reader.
      const padded = new Uint8Array(6 + chunk.data.length);
      padded.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
      padded.set(chunk.data, 6);
      exif = parseExifPayload(padded);
      continue;
    }
    if (chunk.type === 'tEXt' || chunk.type === 'iTXt' || chunk.type === 'zTXt' || chunk.type === 'tIME') {
      total += chunk.end - chunk.start;
      if (chunk.type === 'tEXt') {
        const nul = chunk.data.indexOf(0);
        if (nul > 0) {
          textChunks.push({
            keyword: String.fromCharCode(...chunk.data.subarray(0, nul)),
            value: String.fromCharCode(...chunk.data.subarray(nul + 1)).slice(0, 200),
          });
        }
      }
    }
  }

  return {
    format: 'png',
    totalMetadataBytes: total,
    exif,
    xmpPackets: 0,
    xmpBytes: 0,
    iptcBytes: 0,
    iccBytes,
    comments: [],
    textChunks,
  };
}

function readWebpMetadata(bytes: Uint8Array): MetadataReport {
  let chunks;
  try {
    chunks = walkWebpChunks(bytes);
  } catch {
    return emptyReport('webp');
  }

  let total = 0;
  let iccBytes = 0;
  let xmpPackets = 0;
  let xmpBytes = 0;
  let exif: ExifData | null = null;

  for (const chunk of chunks) {
    if (chunk.type === 'ICCP') {
      iccBytes += chunk.data.length;
    } else if (chunk.type === 'EXIF') {
      total += chunk.end - chunk.start;
      const padded = new Uint8Array(6 + chunk.data.length);
      padded.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
      padded.set(chunk.data, 6);
      exif = parseExifPayload(padded);
    } else if (chunk.type === 'XMP ') {
      total += chunk.end - chunk.start;
      xmpPackets++;
      xmpBytes += chunk.data.length;
    }
  }

  return {
    format: 'webp',
    totalMetadataBytes: total,
    exif,
    xmpPackets,
    xmpBytes,
    iptcBytes: 0,
    iccBytes,
    comments: [],
    textChunks: [],
  };
}

export function readMetadata(bytes: Uint8Array): MetadataReport {
  if (isJpeg(bytes)) return readJpegMetadata(bytes);
  if (isPng(bytes)) return readPngMetadata(bytes);
  if (isWebp(bytes)) return readWebpMetadata(bytes);
  return emptyReport('unknown');
}

/** Human-readable coordinates, in the form people paste into a map. */
export function formatGps(fix: GpsFix): string {
  return `${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}`;
}

export function hasAnyMetadata(report: MetadataReport): boolean {
  return (
    report.totalMetadataBytes > 0 ||
    report.exif !== null ||
    report.xmpPackets > 0 ||
    report.iptcBytes > 0 ||
    report.comments.length > 0 ||
    report.textChunks.length > 0
  );
}
