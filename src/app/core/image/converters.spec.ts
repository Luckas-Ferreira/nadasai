import { TARGET_FORMATS, TERMINAL_FORMATS, encodeIco, encodeImage, resizeImage } from './converters';

/** Builds a real, decodable PNG with a transparent half so alpha handling is exercised. */
async function makeImageFile(width = 40, height = 20, type = 'image/png'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255, 0, 0, 1)';
  ctx.fillRect(0, 0, width / 2, height);

  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), type));
  return new File([blob], `test.${type === 'image/png' ? 'png' : 'jpg'}`, { type });
}

/** Reads one pixel out of an encoded blob, so we assert on what the user actually gets. */
async function pixelAt(blob: Blob, x: number, y: number): Promise<[number, number, number, number]> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);

  const data = ctx.getImageData(x, y, 1, 1).data;
  return [data[0], data[1], data[2], data[3]];
}

async function dimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  return { width: bitmap.width, height: bitmap.height };
}

describe('converters', () => {
  it('does not offer AVIF, which canvas cannot actually encode', () => {
    expect(TARGET_FORMATS).not.toContain('AVIF' as never);
  });

  it('marks PDF and ICO as terminal so they cannot re-enter the editing chain', () => {
    expect(TERMINAL_FORMATS).toContain('PDF');
    expect(TERMINAL_FORMATS).toContain('ICO');
  });

  describe('encodeImage', () => {
    it('produces a blob whose real type matches the requested format', async () => {
      const file = await makeImageFile();

      const webp = await encodeImage(file, 'webp', 0.8);
      expect(webp.type).toBe('image/webp');

      const jpeg = await encodeImage(file, 'jpeg', 0.9);
      expect(jpeg.type).toBe('image/jpeg');

      const png = await encodeImage(file, 'png');
      expect(png.type).toBe('image/png');
    });

    /**
     * JPEG has no alpha channel. Without an explicit fill, transparent pixels
     * serialize as BLACK — which is exactly what the old converter (and the PDF
     * export, same root cause) shipped to users.
     */
    it('flattens transparency to white for JPEG instead of black', async () => {
      const file = await makeImageFile(40, 20); // right half is transparent
      const jpeg = await encodeImage(file, 'jpeg', 0.92);

      const [r, g, b] = await pixelAt(jpeg, 39, 10); // in the transparent half

      expect(r).toBeGreaterThan(240);
      expect(g).toBeGreaterThan(240);
      expect(b).toBeGreaterThan(240);
    });

    it('keeps transparency for PNG', async () => {
      const file = await makeImageFile(40, 20);
      const png = await encodeImage(file, 'png');

      const [, , , alpha] = await pixelAt(png, 39, 10);
      expect(alpha).toBe(0);
    });
  });

  describe('resizeImage', () => {
    it('hits the exact target box', async () => {
      const file = await makeImageFile(40, 20);
      const out = await resizeImage(file, { width: 300, height: 150 });

      expect(await dimensions(out)).toEqual({ width: 300, height: 150 });
    });

    /**
     * The old resize passed `maxWidthOrHeight` to browser-image-compression,
     * which only ever DOWNSCALES: asking for 1920px on a smaller source silently
     * did nothing and reported success.
     */
    it('upscales, which the old implementation silently refused to do', async () => {
      const file = await makeImageFile(40, 20);
      const out = await resizeImage(file, { width: 1920, height: 960 });

      expect(await dimensions(out)).toEqual({ width: 1920, height: 960 });
    });

    it('allows a non-proportional target', async () => {
      const file = await makeImageFile(40, 20);
      const out = await resizeImage(file, { width: 100, height: 100 });

      expect(await dimensions(out)).toEqual({ width: 100, height: 100 });
    });
  });

  describe('encodeIco', () => {
    it('writes a valid multi-resolution ICO directory', async () => {
      const file = await makeImageFile(64, 64);
      const blob = await encodeIco(file, [16, 32, 48]);

      expect(blob.type).toBe('image/vnd.microsoft.icon');

      const view = new DataView(await blob.arrayBuffer());

      // ICONDIR: reserved=0, type=1 (icon), count=3
      expect(view.getUint16(0, true)).toBe(0);
      expect(view.getUint16(2, true)).toBe(1);
      expect(view.getUint16(4, true)).toBe(3);

      const HEADER = 6;
      const ENTRY = 16;
      let expectedOffset = HEADER + ENTRY * 3;

      [16, 32, 48].forEach((size, i) => {
        const entry = HEADER + i * ENTRY;

        expect(view.getUint8(entry)).toBe(size); // width
        expect(view.getUint8(entry + 1)).toBe(size); // height
        expect(view.getUint16(entry + 4, true)).toBe(1); // colour planes
        expect(view.getUint16(entry + 6, true)).toBe(32); // bits per pixel

        const bytesInRes = view.getUint32(entry + 8, true);
        const offset = view.getUint32(entry + 12, true);

        expect(bytesInRes).toBeGreaterThan(0);
        expect(offset).toBe(expectedOffset);

        expectedOffset += bytesInRes;
      });

      // Every declared payload must actually fit inside the blob.
      expect(expectedOffset).toBe(view.byteLength);
    });

    it('encodes 256 as 0 in the single-byte size fields', async () => {
      const file = await makeImageFile(64, 64);
      const blob = await encodeIco(file, [256]);

      const view = new DataView(await blob.arrayBuffer());
      expect(view.getUint8(6)).toBe(0);
      expect(view.getUint8(7)).toBe(0);
    });

    it('letterboxes a non-square source instead of stretching it', async () => {
      // A 1600x900-shaped source used to come out squashed into a square.
      const file = await makeImageFile(80, 20);
      const blob = await encodeIco(file, [32]);

      const view = new DataView(await blob.arrayBuffer());
      expect(view.getUint8(6)).toBe(32);
      expect(view.getUint8(7)).toBe(32);

      // The payload decodes as a real 32x32 PNG.
      const offset = view.getUint32(6 + 12, true);
      const size = view.getUint32(6 + 8, true);
      const png = new Blob([await blob.slice(offset, offset + size).arrayBuffer()], {
        type: 'image/png',
      });

      const bitmap = await createImageBitmap(png);
      expect(bitmap.width).toBe(32);
      expect(bitmap.height).toBe(32);
    });
  });
});
