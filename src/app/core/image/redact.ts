import { type Region, toPixels } from '../geometry/region';

/**
 * Burns redaction regions into a canvas, destructively.
 *
 * WHAT THE TWO MODES ACTUALLY GUARANTEE, because the difference reaches the UI
 * copy and it should reach anyone editing this file too:
 *
 * - `black` fills opaque black. The pixels underneath are gone. This is the
 *   only mode that is a guarantee, and it is the default for that reason.
 * - `pixelate` downsamples the region and scales it back up with smoothing off.
 *   It is NOT a blur, and neither pixelation nor blur is irreversible: both
 *   have published recovery attacks against low-entropy content, which a CPF, a
 *   card number or a date of birth all are (Hill et al., "On the
 *   (In)effectiveness of Mosaicing and Blurring"). It is offered for faces,
 *   where obscuring is the point and recovery is not a practical threat.
 *
 * In a product called "Nada Sai", shipping a redaction that can be undone would
 * be the worst possible bug. Do not promote `pixelate` to the default and do not
 * describe it as secure.
 */

/** Cells across the shorter edge of a pixelated region. Lower is coarser. */
export const PIXELATE_CELL_DIVISOR = 12;

export function burnRegions(canvas: HTMLCanvasElement, regions: readonly Region[]): void {
  if (regions.length === 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  for (const region of regions) {
    const { x, y, w, h } = toPixels(region, canvas.width, canvas.height);
    if (w <= 0 || h <= 0) continue;

    if (region.mode === 'black') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, w, h);
      continue;
    }

    const cellW = Math.max(1, Math.floor(w / PIXELATE_CELL_DIVISOR));
    const cellH = Math.max(1, Math.floor(h / PIXELATE_CELL_DIVISOR));

    // Downsample into a tiny offscreen, then blow it back up with smoothing
    // off. Drawing the region onto itself at a smaller size would read pixels
    // it is concurrently writing.
    const small = document.createElement('canvas');
    small.width = cellW;
    small.height = cellH;
    const smallCtx = small.getContext('2d');
    if (!smallCtx) continue;

    smallCtx.drawImage(canvas, x, y, w, h, 0, 0, cellW, cellH);

    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, cellW, cellH, x, y, w, h);
    ctx.imageSmoothingEnabled = smoothing;

    small.width = 0;
    small.height = 0;
  }
}
