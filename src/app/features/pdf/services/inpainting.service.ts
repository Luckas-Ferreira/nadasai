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

    try {
      const pixels = ctx.getImageData(px, py, pw, ph).data;
      const colorBins = new Map<string, { sumR: number, sumG: number, sumB: number, count: number }>();
      
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i+3] < 128) continue; // ignore transparent
        
        const r = pixels[i];
        const g = pixels[i+1];
        const b = pixels[i+2];
        
        // Quantize colors heavily to group shades
        const qR = Math.round(r / 32) * 32;
        const qG = Math.round(g / 32) * 32;
        const qB = Math.round(b / 32) * 32;
        const key = `${qR},${qG},${qB}`;
        
        const bin = colorBins.get(key) || { sumR: 0, sumG: 0, sumB: 0, count: 0 };
        bin.sumR += r;
        bin.sumG += g;
        bin.sumB += b;
        bin.count++;
        colorBins.set(key, bin);
      }
      
      if (colorBins.size === 0) {
        return { bgColor: 'rgb(255, 255, 255)', luminance: 255 };
      }
      
      let maxCount = 0;
      let bestBin = { sumR: 0, sumG: 0, sumB: 0, count: 1 };
      
      for (const bin of colorBins.values()) {
        if (bin.count > maxCount) {
          maxCount = bin.count;
          bestBin = bin;
        }
      }
      
      const rAvg = Math.round(bestBin.sumR / bestBin.count);
      const gAvg = Math.round(bestBin.sumG / bestBin.count);
      const bAvg = Math.round(bestBin.sumB / bestBin.count);
      const luminance = 0.299 * rAvg + 0.587 * gAvg + 0.114 * bAvg;

      return {
        bgColor: `rgb(${rAvg}, ${gAvg}, ${bAvg})`,
        luminance,
      };
    } catch (err) {
      return { bgColor: 'rgb(255, 255, 255)', luminance: 255 };
    }
  }

  /**
   * Samples the text color by analyzing the center pixels of the block
   * and ignoring the background color.
   */
  sampleTextColor(
    canvas: HTMLCanvasElement,
    relX: number,
    relY: number,
    relW: number,
    relH: number,
    bgColorStr: string
  ): string {
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#000000';

    const cw = canvas.width;
    const ch = canvas.height;
    
    // Exact bounding box, no padding
    const px = Math.floor(relX * cw);
    const py = Math.floor(relY * ch);
    const pw = Math.floor(relW * cw);
    const ph = Math.floor(relH * ch);
    
    if (pw <= 0 || ph <= 0) return '#000000';
    
    const match = bgColorStr.match(/\d+/g);
    const bgR = match ? parseInt(match[0]) : 255;
    const bgG = match ? parseInt(match[1]) : 255;
    const bgB = match ? parseInt(match[2]) : 255;

    const rgbToHex = (r: number, g: number, b: number) => 
      '#' + [r, g, b].map(x => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0')).join('');
      
    const dist = (r: number, g: number, b: number) =>
      Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);

    try {
      const pixels = ctx.getImageData(px, py, pw, ph).data;
      
      // Map to group similar colors (quantization) and accumulate original values
      const colorBins = new Map<string, { sumR: number, sumG: number, sumB: number, count: number }>();
      
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i+3] < 128) continue; // ignore transparent
        
        const r = pixels[i];
        const g = pixels[i+1];
        const b = pixels[i+2];
        
        // Ignore pixels that are too close to the background color (dist < 80)
        if (dist(r, g, b) < 80) continue;
        
        // Quantize colors heavily to group anti-aliased shades together (bins of 32)
        const qR = Math.round(r / 32) * 32;
        const qG = Math.round(g / 32) * 32;
        const qB = Math.round(b / 32) * 32;
        const key = `${qR},${qG},${qB}`;
        
        const bin = colorBins.get(key) || { sumR: 0, sumG: 0, sumB: 0, count: 0 };
        bin.sumR += r;
        bin.sumG += g;
        bin.sumB += b;
        bin.count++;
        colorBins.set(key, bin);
      }
      
      if (colorBins.size === 0) return '#000000';
      
      // Find the most frequent color bin
      let maxCount = 0;
      let bestBin = { sumR: 0, sumG: 0, sumB: 0, count: 1 };
      
      for (const bin of colorBins.values()) {
        if (bin.count > maxCount) {
          maxCount = bin.count;
          bestBin = bin;
        }
      }
      
      // Return the exact average of that bin's original pixels
      return rgbToHex(
        Math.round(bestBin.sumR / bestBin.count),
        Math.round(bestBin.sumG / bestBin.count),
        Math.round(bestBin.sumB / bestBin.count)
      );
    } catch (e) {
      return '#000000';
    }
  }
}
