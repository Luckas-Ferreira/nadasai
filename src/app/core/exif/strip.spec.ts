import { AppError } from '../errors';
import { parseExifPayload, readMetadata } from './exif-parser';
import { buildOrientationApp1, isJpeg, walkJpegSegments } from './jpeg-segments';
import { crc32, isPng, walkPngChunks } from './png-chunks';
import { stripMetadata } from './strip';

/**
 * Fixtures are synthesised, never committed — the same rule as the e2e PNG
 * encoder. A real JPEG comes from canvas.toBlob, and a known APP1 is spliced in
 * afterwards, so the test knows exactly what it put there.
 */

const enc = new TextEncoder();

async function makeJpeg(width = 40, height = 30): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  // Grain, so the encoder produces varied scan data rather than one flat run.
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      ctx.fillStyle = `rgb(${(x * 7) % 256},${(y * 11) % 256},${(x * y) % 256})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  return new Uint8Array(await blob!.arrayBuffer());
}

async function makePng(width = 24, height = 18): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3366aa';
  ctx.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  return new Uint8Array(await blob!.arrayBuffer());
}

/**
 * A little-endian TIFF block with IFD0 (Make, Model, Orientation, GPS pointer)
 * and a GPS IFD carrying a known position.
 */
function buildExifPayload(opts: { make: string; model: string; orientation: number }): Uint8Array {
  const make = enc.encode(opts.make + '\0');
  const model = enc.encode(opts.model + '\0');

  // Layout: header(8) IFD0(2 + 4*12 + 4) then heap.
  const ifd0Count = 4;
  const ifd0Size = 2 + ifd0Count * 12 + 4;
  const heapStart = 8 + ifd0Size;

  const gpsCount = 4;
  const gpsSize = 2 + gpsCount * 12 + 4;

  const makeAt = heapStart;
  const modelAt = makeAt + make.length;
  const gpsIfdAt = modelAt + model.length;
  const gpsHeapAt = gpsIfdAt + gpsSize;
  // Latitude and longitude are 3 RATIONALs each = 24 bytes each.
  const total = gpsHeapAt + 48;

  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);

  buf[0] = 0x49; buf[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  let at = 8;
  view.setUint16(at, ifd0Count, true);
  at += 2;

  const entry = (tag: number, type: number, count: number, valueOrOffset: number, inlineShort = false): void => {
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    if (inlineShort) view.setUint16(at + 8, valueOrOffset, true);
    else view.setUint32(at + 8, valueOrOffset, true);
    at += 12;
  };

  /**
   * TIFF stores a value of four bytes or fewer INSIDE the entry, where the
   * offset would otherwise go. Writing an offset there instead produces an
   * entry that a correct reader decodes as garbage characters — which is
   * exactly what this fixture did at first.
   */
  const asciiEntry = (tag: number, bytes: Uint8Array, heapAt: number): void => {
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, 2, true);
    view.setUint32(at + 4, bytes.length, true);
    if (bytes.length <= 4) buf.set(bytes, at + 8);
    else view.setUint32(at + 8, heapAt, true);
    at += 12;
  };

  asciiEntry(0x010f, make, makeAt);               // Make
  asciiEntry(0x0110, model, modelAt);             // Model
  entry(0x0112, 3, 1, opts.orientation, true);    // Orientation (inline)
  entry(0x8825, 4, 1, gpsIfdAt);                  // GPS IFD pointer
  view.setUint32(at, 0, true);                    // no IFD1

  buf.set(make, makeAt);
  buf.set(model, modelAt);

  at = gpsIfdAt;
  view.setUint16(at, gpsCount, true);
  at += 2;
  entry(0x0001, 2, 2, 0x0053, true);              // GPSLatitudeRef "S"
  entry(0x0002, 5, 3, gpsHeapAt);                 // GPSLatitude
  entry(0x0003, 2, 2, 0x0057, true);              // GPSLongitudeRef "W"
  entry(0x0004, 5, 3, gpsHeapAt + 24);            // GPSLongitude
  view.setUint32(at, 0, true);

  // 23° 33' 0"  S,  46° 38' 0" W — São Paulo.
  const rational = (offset: number, num: number, den: number): void => {
    view.setUint32(offset, num, true);
    view.setUint32(offset + 4, den, true);
  };
  rational(gpsHeapAt, 23, 1);
  rational(gpsHeapAt + 8, 33, 1);
  rational(gpsHeapAt + 16, 0, 1);
  rational(gpsHeapAt + 24, 46, 1);
  rational(gpsHeapAt + 32, 38, 1);
  rational(gpsHeapAt + 40, 0, 1);

  const payload = new Uint8Array(6 + buf.length);
  payload.set(enc.encode('Exif'), 0);
  payload.set(buf, 6);
  return payload;
}

function spliceApp1(jpeg: Uint8Array, payload: Uint8Array): Uint8Array {
  const segment = new Uint8Array(4 + payload.length);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment[2] = ((payload.length + 2) >> 8) & 0xff;
  segment[3] = (payload.length + 2) & 0xff;
  segment.set(payload, 4);

  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2), 0);        // SOI
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}

function scanTail(jpeg: Uint8Array): Uint8Array {
  const { scanStart } = walkJpegSegments(jpeg);
  return jpeg.subarray(scanStart);
}

async function decodeToPixels(bytes: Uint8Array, mime: string): Promise<Uint8ClampedArray> {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

describe('EXIF parsing', () => {
  it('recovers make, model and orientation from a known APP1', () => {
    const payload = buildExifPayload({ make: 'NadaSai', model: 'TestCam 1', orientation: 6 });
    const data = parseExifPayload(payload)!;
    expect(data.make).toBe('NadaSai');
    expect(data.model).toBe('TestCam 1');
    expect(data.orientation).toBe(6);
  });

  it('converts GPS to signed decimal with the hemisphere applied', () => {
    // The S/W sign flip is where these parsers are usually wrong: get it
    // backwards and a photo taken in São Paulo lands in Siberia.
    const payload = buildExifPayload({ make: 'X', model: 'Y', orientation: 1 });
    const gps = parseExifPayload(payload)!.gps!;
    expect(gps.latitude).toBeCloseTo(-23.55, 2);
    expect(gps.longitude).toBeCloseTo(-46.633, 2);
  });

  it('reports a JPEG carrying metadata, and one that is clean', async () => {
    const plain = await makeJpeg();
    const withExif = spliceApp1(plain, buildExifPayload({ make: 'A', model: 'B', orientation: 1 }));

    expect(readMetadata(withExif).exif?.make).toBe('A');
    expect(readMetadata(withExif).totalMetadataBytes).toBeGreaterThan(0);
    expect(readMetadata(plain).exif).toBeNull();
  });
});

describe('stripMetadata — JPEG', () => {
  it('removes the EXIF and reports how many bytes went', async () => {
    const withExif = spliceApp1(await makeJpeg(), buildExifPayload({ make: 'A', model: 'B', orientation: 1 }));
    const result = stripMetadata(withExif);

    expect(readMetadata(result.bytes).exif).toBeNull();
    expect(result.removedBytes).toBeGreaterThan(0);
    expect(isJpeg(result.bytes)).toBe(true);
  });

  it('IS LOSSLESS: the compressed scan is byte-identical', async () => {
    // Assertion 1 of 2. This is the one that a re-encode cannot fake.
    const plain = await makeJpeg();
    const withExif = spliceApp1(plain, buildExifPayload({ make: 'A', model: 'B', orientation: 1 }));
    const stripped = stripMetadata(withExif).bytes;

    expect(Array.from(scanTail(stripped))).toEqual(Array.from(scanTail(plain)));
  });

  it('IS LOSSLESS: the decoded pixels are identical', async () => {
    // Assertion 2 of 2. On its own this would pass for a re-encode at quality
    // 100, which is why both are required.
    const plain = await makeJpeg();
    const withExif = spliceApp1(plain, buildExifPayload({ make: 'A', model: 'B', orientation: 1 }));
    const stripped = stripMetadata(withExif).bytes;

    const before = await decodeToPixels(plain, 'image/jpeg');
    const after = await decodeToPixels(stripped, 'image/jpeg');
    expect(after.length).toBe(before.length);
    expect(Array.from(after)).toEqual(Array.from(before));
  });

  it('keeps a minimal Orientation tag so a portrait photo stays upright', async () => {
    const withExif = spliceApp1(await makeJpeg(), buildExifPayload({ make: 'A', model: 'B', orientation: 6 }));
    const stripped = stripMetadata(withExif, { keepIcc: true, keepOrientation: true }).bytes;

    const data = readMetadata(stripped).exif!;
    expect(data.orientation).toBe(6);
    // …and nothing else survived.
    expect(data.make).toBeUndefined();
    expect(data.model).toBeUndefined();
    expect(data.gps).toBeUndefined();
  });

  it('drops orientation entirely when asked to', async () => {
    const withExif = spliceApp1(await makeJpeg(), buildExifPayload({ make: 'A', model: 'B', orientation: 6 }));
    const stripped = stripMetadata(withExif, { keepIcc: true, keepOrientation: false }).bytes;
    expect(readMetadata(stripped).exif).toBeNull();
  });

  it('does not write an orientation segment for an upright photo', async () => {
    const withExif = spliceApp1(await makeJpeg(), buildExifPayload({ make: 'A', model: 'B', orientation: 1 }));
    const stripped = stripMetadata(withExif).bytes;
    expect(readMetadata(stripped).exif).toBeNull();
  });

  it('round-trips a JPEG that has no metadata at all', async () => {
    const plain = await makeJpeg();
    const result = stripMetadata(plain);
    expect(result.removedBytes).toBe(0);
    expect(Array.from(result.bytes)).toEqual(Array.from(plain));
  });

  it('builds a 32-byte orientation APP1', () => {
    const segment = buildOrientationApp1(6);
    expect(segment.length).toBe(36);
    expect(segment[0]).toBe(0xff);
    expect(segment[1]).toBe(0xe1);
  });
});

describe('stripMetadata — PNG', () => {
  function appendChunk(png: Uint8Array, type: string, data: Uint8Array): Uint8Array {
    const typeBytes = enc.encode(type);
    const body = new Uint8Array(typeBytes.length + data.length);
    body.set(typeBytes, 0);
    body.set(data, typeBytes.length);

    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length, false);
    chunk.set(body, 4);
    view.setUint32(8 + data.length, crc32(body), false);

    // Insert before IEND, which must stay last.
    const chunks = walkPngChunks(png);
    const iend = chunks[chunks.length - 1];
    const out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, iend.start), 0);
    out.set(chunk, iend.start);
    out.set(png.subarray(iend.start), iend.start + chunk.length);
    return out;
  }

  it('removes tEXt while leaving IHDR, IDAT and IEND byte-identical', async () => {
    const plain = await makePng();
    const tagged = appendChunk(plain, 'tEXt', enc.encode('Author\0Somebody Real'));

    expect(readMetadata(tagged).textChunks.length).toBe(1);

    const stripped = stripMetadata(tagged).bytes;
    expect(readMetadata(stripped).textChunks.length).toBe(0);
    expect(isPng(stripped)).toBe(true);
    // PNG's CRC is per chunk, so removing whole chunks needs no recomputation
    // and the image data is copied verbatim.
    expect(Array.from(stripped)).toEqual(Array.from(plain));
  });

  it('computes a CRC that the walker accepts', async () => {
    const tagged = appendChunk(await makePng(), 'tEXt', enc.encode('K\0V'));
    expect(() => walkPngChunks(tagged)).not.toThrow();
  });

  it('leaves a clean PNG untouched', async () => {
    const plain = await makePng();
    const result = stripMetadata(plain);
    expect(Array.from(result.bytes)).toEqual(Array.from(plain));
    expect(result.removedBytes).toBe(0);
  });
});

describe('stripMetadata — refusals', () => {
  it('refuses TIFF instead of silently transcoding it', () => {
    // The old tool advertised TIFF, could not decode it, and showed nothing at
    // all when it failed.
    const tiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0, 0, 0]);
    expect(() => stripMetadata(tiff)).toThrowMatching(
      (e: unknown) => e instanceof AppError && e.code === 'exif_unsupported',
    );
  });

  it('refuses something that is not an image', () => {
    expect(() => stripMetadata(enc.encode('hello world'))).toThrowMatching(
      (e: unknown) => e instanceof AppError && e.code === 'exif_unsupported',
    );
  });

  it('reports a malformed JPEG rather than throwing a RangeError', () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]);
    expect(() => stripMetadata(broken)).toThrowMatching((e: unknown) => e instanceof AppError);
  });
});
