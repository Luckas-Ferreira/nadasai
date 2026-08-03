/**
 * Rectangular regions in PERCENT of the surface, never pixels.
 *
 * This is what lets one interaction serve both a photo at its natural
 * resolution and a PDF page rendered at a display scale that differs from the
 * export scale: the box a user drew at 40% zoom still covers the same content
 * when the page is rasterised at 150 DPI. sign-pdf already stores its placed
 * signatures this way; redact-image stored pixels and had to re-derive them.
 */

export type RedactMode = 'black' | 'pixelate';

export interface Region {
  readonly id: string;
  readonly xPct: number;
  readonly yPct: number;
  readonly wPct: number;
  readonly hPct: number;
  readonly mode: RedactMode;
  /** 1-based; always 1 for a single image. */
  readonly page: number;
}

/**
 * Below this a drag is a click that wobbled. The old check was `w > 5 && h > 5`
 * in pixels, which meant the minimum size depended on the zoom level.
 */
export const MIN_REGION_PCT = 0.5;

export interface Rect {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

/** Two drag corners, in any order, to a positive-sized rect. */
export function normalizeDrag(ax: number, ay: number, bx: number, by: number): Rect {
  return {
    xPct: Math.min(ax, bx),
    yPct: Math.min(ay, by),
    wPct: Math.abs(bx - ax),
    hPct: Math.abs(by - ay),
  };
}

/** Keeps a rect inside the surface, trimming rather than sliding it. */
export function clampToUnit(r: Rect): Rect {
  const x = Math.min(Math.max(r.xPct, 0), 100);
  const y = Math.min(Math.max(r.yPct, 0), 100);
  return {
    xPct: x,
    yPct: y,
    wPct: Math.min(r.wPct, 100 - x),
    hPct: Math.min(r.hPct, 100 - y),
  };
}

export function isDegenerate(r: Rect): boolean {
  return r.wPct < MIN_REGION_PCT || r.hPct < MIN_REGION_PCT;
}

export function toPixels(r: Rect, width: number, height: number): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.round((r.xPct / 100) * width),
    y: Math.round((r.yPct / 100) * height),
    w: Math.round((r.wPct / 100) * width),
    h: Math.round((r.hPct / 100) * height),
  };
}

// A counter, not Math.random or Date.now: both are unavailable during prerender
// and neither is needed — these ids only have to be unique within one session.
let nextId = 0;

export function makeRegion(rect: Rect, mode: RedactMode, page = 1): Region {
  return { id: `r${++nextId}`, ...clampToUnit(rect), mode, page };
}

export function regionsOnPage(regions: readonly Region[], page: number): Region[] {
  return regions.filter((r) => r.page === page);
}
