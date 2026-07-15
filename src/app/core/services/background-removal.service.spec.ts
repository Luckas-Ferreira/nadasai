import { BackgroundRemovalService } from './background-removal.service';

/**
 * These cover the flat-graphic path only — a logo/icon on a solid or
 * fake-transparency background, cut by colour flood-fill rather than the AI.
 *
 * That path is what makes these testable at all: it never loads onnxruntime, so
 * the specs run in Karma's real Chrome in milliseconds. The AI path (photos) is
 * exercised end-to-end in e2e/06-remove-bg, where the model actually runs.
 */
describe('BackgroundRemovalService — flat-graphic path', () => {
  let service: BackgroundRemovalService;

  beforeEach(() => {
    service = new BackgroundRemovalService();
  });

  /** Paints a scene and hands back a PNG File, the same shape a real upload has. */
  async function graphic(paint: (ctx: CanvasRenderingContext2D, size: number) => void, size = 240): Promise<File> {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    paint(ctx, size);
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
    return new File([blob], 'graphic.png', { type: 'image/png' });
  }

  /** Reads back the alpha at a point of the produced cut-out. */
  async function alphaAt(blob: Blob, fx: number, fy: number): Promise<number> {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const x = Math.round(fx * img.naturalWidth);
      const y = Math.round(fy * img.naturalHeight);
      return ctx.getImageData(x, y, 1, 1).data[3];
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function paintChecker(ctx: CanvasRenderingContext2D, size: number): void {
    const cell = 15;
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) & 1) === 0 ? '#ffffff' : '#d9d9d9';
        ctx.fillRect(x, y, cell, cell);
      }
    }
  }

  it('removes a checkerboard background and keeps the saturated subject', async () => {
    const file = await graphic((ctx, size) => {
      paintChecker(ctx, size);
      ctx.fillStyle = '#0e7490'; // saturated teal blob, centred
      ctx.fillRect(size * 0.3, size * 0.3, size * 0.4, size * 0.4);
    });

    const out = await service.removeBackground(file);

    expect(await alphaAt(out, 0.02, 0.02)).toBe(0); // corner: background gone
    expect(await alphaAt(out, 0.5, 0.5)).toBe(255); // centre: subject kept
  });

  it('routes a colourful logo on white by dominance, not colour count', async () => {
    // The real-world regression: a logo with many colours (orange, green, blue,
    // gradients) still cuts by flood-fill, because it is dominated by a few flat
    // fills on a flat border — not because it has "few colours". A photo would
    // spread across far more and fall to the AI instead.
    const file = await graphic((ctx, size) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      const fills = ['#e8821e', '#2f8f2f', '#12307a', '#c0392b', '#8e44ad', '#16a085'];
      fills.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(size * 0.2 + (i % 3) * size * 0.2, size * 0.3 + Math.floor(i / 3) * size * 0.2, size * 0.16, size * 0.16);
      });
    });

    const out = await service.removeBackground(file);

    expect(await alphaAt(out, 0.02, 0.02)).toBe(0); // white background gone, no speckle
    expect(await alphaAt(out, 0.28, 0.38)).toBe(255); // a coloured fill kept
  });

  it('clears the counter inside a coloured letter, and keeps the letter (the CUPONS case)', async () => {
    // A blue ring standing in for a letter like "O": its counter is the white
    // background showing through, and it must come out transparent — not stay a
    // white blob — even though the ring around it is saturated. This is the exact
    // regression that killed the earlier saturation heuristic.
    const file = await graphic((ctx, size) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#12307a';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
    });

    const out = await service.removeBackground(file);

    expect(await alphaAt(out, 0.5, 0.5)).toBe(0); // the counter: background colour removed
    expect(await alphaAt(out, 0.5, 0.24)).toBe(255); // the blue ring itself: kept
    expect(await alphaAt(out, 0.02, 0.5)).toBe(0); // outer background gone
  });

  it('keys out the background colour everywhere, including a matching foreground detail', async () => {
    // The honest trade-off of chroma-key, pinned so nobody "fixes" it back into a
    // guess: a white detail on a coloured shape shares the background's colour and
    // is removed with it. Predictable beats clever.
    const file = await graphic((ctx, size) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#0e7490';
      ctx.fillRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6);
      ctx.fillStyle = '#ffffff'; // a white mark inside the teal
      ctx.fillRect(size * 0.44, size * 0.44, size * 0.12, size * 0.12);
    });

    const out = await service.removeBackground(file);

    expect(await alphaAt(out, 0.5, 0.5)).toBe(0); // white detail keyed out too
    expect(await alphaAt(out, 0.25, 0.25)).toBe(255); // teal body kept
    expect(await alphaAt(out, 0.02, 0.5)).toBe(0); // background gone
  });
});
