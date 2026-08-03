import { TestBed } from '@angular/core/testing';
import { makeRegion } from '../../../../core/geometry/region';
import { ImageRedactorService } from './image-redactor.service';

/**
 * burnRegions is unit-tested against a canvas in core/image/redact.spec.ts. What
 * this layer adds is the encode: the guarantee only holds if the black pixels
 * survive into the FILE, at the image's natural resolution, in a format that can
 * carry them.
 */

async function makeImage(type = 'image/png', width = 120, height = 80): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Anything but black, so "the bar is there" cannot pass by accident.
  ctx.fillStyle = '#ff4488';
  ctx.fillRect(0, 0, width, height);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.95));
  const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
  return new File([blob!], `documento.${ext}`, { type });
}

async function pixelAt(blob: Blob, x: number, y: number): Promise<[number, number, number]> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  bitmap.close();
  return [r, g, b];
}

describe('ImageRedactorService', () => {
  let service: ImageRedactorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ImageRedactorService);
  });

  it('writes black pixels into the output, not a black box over it', async () => {
    const file = await makeImage();
    const result = await service.redact({
      file,
      regions: [makeRegion({ xPct: 10, yPct: 10, wPct: 40, hPct: 40 }, 'black', 1)],
    });

    // Inside the bar: gone. Outside it: untouched. The second half is what
    // separates a redaction from a re-encode of the whole picture.
    expect(await pixelAt(result.blob, 30, 25)).toEqual([0, 0, 0]);
    expect(await pixelAt(result.blob, 110, 70)).toEqual([255, 68, 136]);
  });

  it('keeps the natural resolution', async () => {
    const result = await service.redact({
      file: await makeImage('image/png', 200, 140),
      regions: [makeRegion({ xPct: 5, yPct: 5, wPct: 20, hPct: 20 }, 'black', 1)],
    });

    const bitmap = await createImageBitmap(result.blob);
    expect([bitmap.width, bitmap.height]).toEqual([200, 140]);
    bitmap.close();
  });

  it('pixelates without flattening the region to one colour', async () => {
    // A mosaic still carries the average of what was there — which is exactly
    // why it is not a guarantee, and why the panel says so.
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 120, 80);
    ctx.fillStyle = '#000000';
    for (let x = 0; x < 120; x += 4) ctx.fillRect(x, 0, 2, 80);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    const file = new File([blob!], 'listras.png', { type: 'image/png' });

    const result = await service.redact({
      file,
      regions: [makeRegion({ xPct: 0, yPct: 0, wPct: 100, hPct: 100 }, 'pixelate', 1)],
    });

    const [r, g, b] = await pixelAt(result.blob, 60, 40);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(255);
  });

  it('names the output after the input and keeps a carryable format', async () => {
    const png = await service.redact({
      file: await makeImage('image/png'),
      regions: [makeRegion({ xPct: 5, yPct: 5, wPct: 10, hPct: 10 }, 'black', 1)],
    });
    expect(png.filename).toBe('documento-redacted.png');
    expect(png.blob.type).toBe('image/png');

    const jpeg = await service.redact({
      file: await makeImage('image/jpeg'),
      regions: [makeRegion({ xPct: 5, yPct: 5, wPct: 10, hPct: 10 }, 'black', 1)],
    });
    expect(jpeg.filename).toBe('documento-redacted.jpg');
  });

  it('refuses when nothing was marked', async () => {
    await expectAsync(service.redact({ file: await makeImage(), regions: [] })).toBeRejected();
  });
});
