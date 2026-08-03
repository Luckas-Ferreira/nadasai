import { MIN_REGION_PCT, clampToUnit, isDegenerate, makeRegion, normalizeDrag, regionsOnPage, toPixels } from './region';

describe('normalizeDrag', () => {
  it('produces the same rect whichever way the drag went', () => {
    const expected = { xPct: 10, yPct: 20, wPct: 30, hPct: 40 };
    expect(normalizeDrag(10, 20, 40, 60)).toEqual(expected);
    expect(normalizeDrag(40, 60, 10, 20)).toEqual(expected);
    expect(normalizeDrag(40, 20, 10, 60)).toEqual(expected);
    expect(normalizeDrag(10, 60, 40, 20)).toEqual(expected);
  });

  it('gives a zero-sized rect for a click', () => {
    expect(normalizeDrag(5, 5, 5, 5)).toEqual({ xPct: 5, yPct: 5, wPct: 0, hPct: 0 });
  });
});

describe('clampToUnit', () => {
  it('trims a rect that runs off the right or bottom edge', () => {
    expect(clampToUnit({ xPct: 90, yPct: 90, wPct: 50, hPct: 50 }))
      .toEqual({ xPct: 90, yPct: 90, wPct: 10, hPct: 10 });
  });

  it('pulls a negative origin back to zero', () => {
    expect(clampToUnit({ xPct: -10, yPct: -5, wPct: 20, hPct: 20 }))
      .toEqual({ xPct: 0, yPct: 0, wPct: 20, hPct: 20 });
  });

  it('leaves a rect that already fits alone', () => {
    const r = { xPct: 10, yPct: 10, wPct: 30, hPct: 30 };
    expect(clampToUnit(r)).toEqual(r);
  });
});

describe('isDegenerate', () => {
  it('rejects a drag that was really a click', () => {
    expect(isDegenerate({ xPct: 0, yPct: 0, wPct: 0, hPct: 0 })).toBe(true);
    expect(isDegenerate({ xPct: 0, yPct: 0, wPct: MIN_REGION_PCT / 2, hPct: 50 })).toBe(true);
    expect(isDegenerate({ xPct: 0, yPct: 0, wPct: 50, hPct: MIN_REGION_PCT / 2 })).toBe(true);
  });

  it('accepts a real region', () => {
    expect(isDegenerate({ xPct: 0, yPct: 0, wPct: 10, hPct: 10 })).toBe(false);
  });
});

describe('toPixels', () => {
  it('maps percent onto a surface of any size', () => {
    const r = { xPct: 25, yPct: 50, wPct: 50, hPct: 25 };
    expect(toPixels(r, 400, 200)).toEqual({ x: 100, y: 100, w: 200, h: 50 });
    // The same region on a raster four times larger — the whole reason for
    // storing percentages.
    expect(toPixels(r, 1600, 800)).toEqual({ x: 400, y: 400, w: 800, h: 200 });
  });
});

describe('makeRegion', () => {
  it('clamps and assigns a unique id', () => {
    const a = makeRegion({ xPct: 95, yPct: 0, wPct: 20, hPct: 10 }, 'black');
    const b = makeRegion({ xPct: 0, yPct: 0, wPct: 10, hPct: 10 }, 'black');
    expect(a.wPct).toBe(5);
    expect(a.id).not.toBe(b.id);
    expect(a.page).toBe(1);
  });
});

describe('regionsOnPage', () => {
  it('selects by page', () => {
    const regions = [
      makeRegion({ xPct: 0, yPct: 0, wPct: 10, hPct: 10 }, 'black', 1),
      makeRegion({ xPct: 0, yPct: 0, wPct: 10, hPct: 10 }, 'black', 2),
      makeRegion({ xPct: 0, yPct: 0, wPct: 10, hPct: 10 }, 'black', 2),
    ];
    expect(regionsOnPage(regions, 1).length).toBe(1);
    expect(regionsOnPage(regions, 2).length).toBe(2);
    expect(regionsOnPage(regions, 3).length).toBe(0);
  });
});
