import { Injectable } from '@angular/core';

export interface InpaintResult {
  /** CSS color string to use as background (e.g. "rgb(255,255,255)") */
  bgColor: string;
  /** Average luminance 0-255. Dark backgrounds need light text. */
  luminance: number;
}

/**
 * Samples the background color of a PDF canvas region
 * by reading pixels along the border of the block (where there's no text).
 * This allows edit boxes to blend in with the actual page color.
 */
@Injectable({ providedIn: 'root' })
export class InpaintingService {

  /**
   * Samples the background color at the given block position on the canvas.
   * @param canvas The rendered PDF page canvas (full resolution).
   * @param relX Block left edge, 0–1 relative to page width.
   * @param relY Block top edge, 0–1 relative to page height.
   * @param relW Block width, 0–1 relative to page width.
   * @param relH Block height, 0–1 relative to page height.
   * @returns InpaintResult with bgColor and luminance.
   */
  sampleBackground(
    canvas: HTMLCanvasElement,
    relX: number,
    relY: number,
    relW: number,
    relH: number,
  ): InpaintResult {
    const ctx = canvas.getContext('2d');
    if (!ctx) return { bgColor: 'rgb(255,255,255)', luminance: 255 };

    const cw = canvas.width;
    const ch = canvas.height;

    // Convert relative coords to absolute pixel coords on the canvas.
    const px = Math.floor(relX * cw);
    const py = Math.floor(relY * ch);
    const pw = Math.floor(relW * cw);
    const ph = Math.floor(relH * ch);

    // Sample pixels from the border ring of the block (avoids the text itself).
    // We take the top row, bottom row, left col, right col.
    const borderSize = Math.max(2, Math.round(ph * 0.15));

    const samples: [number, number, number][] = [];

    const addSamples = (sx: number, sy: number, sw: number, sh: number) => {
      if (sw <= 0 || sh <= 0) return;
      const clampedX = Math.max(0, sx);
      const clampedY = Math.max(0, sy);
      const clampedW = Math.min(sw, cw - clampedX);
      const clampedH = Math.min(sh, ch - clampedY);
      if (clampedW <= 0 || clampedH <= 0) return;
      try {
        const pixels = ctx.getImageData(clampedX, clampedY, clampedW, clampedH);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const a = pixels.data[i + 3];
          if (a < 128) continue; // skip transparent pixels
          samples.push([pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]]);
        }
      } catch {
        // Canvas tainted (cross-origin) — fall back to white.
      }
    };

    // Top strip
    addSamples(px, py, pw, borderSize);
    // Bottom strip
    addSamples(px, py + ph - borderSize, pw, borderSize);
    // Left strip (excluding corners already captured)
    addSamples(px, py + borderSize, borderSize, ph - borderSize * 2);
    // Right strip
    addSamples(px + pw - borderSize, py + borderSize, borderSize, ph - borderSize * 2);

    if (samples.length === 0) {
      return { bgColor: 'rgb(255,255,255)', luminance: 255 };
    }

    // Compute median channel values (more robust than mean against text pixels).
    const rs = samples.map(s => s[0]).sort((a, b) => a - b);
    const gs = samples.map(s => s[1]).sort((a, b) => a - b);
    const bs = samples.map(s => s[2]).sort((a, b) => a - b);

    const mid = Math.floor(samples.length / 2);
    const r = rs[mid];
    const g = gs[mid];
    const b = bs[mid];

    // Perceptual luminance formula.
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    return {
      bgColor: `rgb(${r},${g},${b})`,
      luminance,
    };
  }
}
