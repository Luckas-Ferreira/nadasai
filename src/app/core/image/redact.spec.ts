import { makeRegion } from '../geometry/region';
import { burnRegions } from './redact';

/** A canvas painted a flat colour, so any change is unambiguous. */
function paintedCanvas(width: number, height: number, fill: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function pixelAt(canvas: HTMLCanvasElement, x: number, y: number): [number, number, number, number] {
  const d = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

describe('burnRegions', () => {
  it('fills a black region with opaque black and leaves the rest untouched', () => {
    const canvas = paintedCanvas(200, 100, '#ff0000');
    burnRegions(canvas, [makeRegion({ xPct: 0, yPct: 0, wPct: 50, hPct: 100 }, 'black')]);

    expect(pixelAt(canvas, 50, 50)).toEqual([0, 0, 0, 255]);
    // Outside the region the original pixels survive — a redaction that ate the
    // whole image would "pass" a naive test.
    expect(pixelAt(canvas, 150, 50)).toEqual([255, 0, 0, 255]);
  });

  it('destroys the covered content rather than drawing over it', () => {
    // The canvas IS the exported artefact, so overwriting the pixels is the
    // guarantee. Anything recoverable here would defeat the tool.
    const canvas = paintedCanvas(100, 100, '#ffffff');
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#123456';
    ctx.fillRect(10, 10, 20, 20);

    burnRegions(canvas, [makeRegion({ xPct: 5, yPct: 5, wPct: 30, hPct: 30 }, 'black')]);
    expect(pixelAt(canvas, 20, 20)).toEqual([0, 0, 0, 255]);
  });

  it('applies several regions, including on different areas', () => {
    const canvas = paintedCanvas(200, 200, '#ffffff');
    burnRegions(canvas, [
      makeRegion({ xPct: 0, yPct: 0, wPct: 20, hPct: 20 }, 'black'),
      makeRegion({ xPct: 60, yPct: 60, wPct: 20, hPct: 20 }, 'black'),
    ]);

    expect(pixelAt(canvas, 10, 10)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(canvas, 130, 130)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(canvas, 100, 100)).toEqual([255, 255, 255, 255]);
  });

  it('flattens detail inside a pixelated region', () => {
    // Not a security assertion — pixelation is not a guarantee, and the module
    // comment says so. This only checks the effect is applied.
    const canvas = paintedCanvas(120, 120, '#ffffff');
    const ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 120; i += 2) {
      ctx.fillStyle = i % 4 === 0 ? '#000000' : '#ffffff';
      ctx.fillRect(i, 0, 2, 120);
    }
    const before = pixelAt(canvas, 1, 60);

    burnRegions(canvas, [makeRegion({ xPct: 0, yPct: 0, wPct: 100, hPct: 100 }, 'pixelate')]);

    const after = pixelAt(canvas, 1, 60);
    expect(after).not.toEqual(before);
  });

  it('does nothing when there are no regions', () => {
    const canvas = paintedCanvas(50, 50, '#00ff00');
    burnRegions(canvas, []);
    expect(pixelAt(canvas, 25, 25)).toEqual([0, 255, 0, 255]);
  });

  it('ignores a region that clamps to zero size', () => {
    const canvas = paintedCanvas(50, 50, '#00ff00');
    burnRegions(canvas, [{ ...makeRegion({ xPct: 100, yPct: 100, wPct: 0, hPct: 0 }, 'black') }]);
    expect(pixelAt(canvas, 25, 25)).toEqual([0, 255, 0, 255]);
  });
});
