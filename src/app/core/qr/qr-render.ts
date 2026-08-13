import { QrCode } from './qr-encode';

export interface QrRenderOptions {
  /** Foreground module color (hex or CSS color string, e.g. '#000000'). Default '#000000'. */
  readonly foregroundColor?: string;
  /** Background color (hex, CSS color, or 'transparent'). Default '#ffffff'. */
  readonly backgroundColor?: string;
  /** Quiet zone margin in number of modules (0..8). Default 4. */
  readonly margin?: number;
  /** Target canvas width/height in pixels. Default 512. */
  readonly size?: number;
  /** Optional center logo HTMLImageElement or ImageBitmap. */
  readonly logoImage?: HTMLImageElement | ImageBitmap | null;
  /** Ratio of logo size relative to total QR code width (0.1 to 0.3). Default 0.22. */
  readonly logoSizeRatio?: number;
}

/**
 * Generates an SVG string representation of the QR Code.
 */
export function renderQrToSvg(qr: QrCode, options: QrRenderOptions = {}): string {
  const fg = options.foregroundColor || '#000000';
  const bg = options.backgroundColor ?? '#ffffff';
  const margin = Math.max(0, options.margin ?? 4);
  const totalModules = qr.size + margin * 2;
  const targetSize = options.size || 512;

  // Build SVG path commands for dark modules
  let path = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        const mx = x + margin;
        const my = y + margin;
        path += `M${mx},${my}h1v1h-1z `;
      }
    }
  }

  const bgRect =
    bg && bg !== 'transparent'
      ? `<rect width="${totalModules}" height="${totalModules}" fill="${bg}"/>`
      : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${totalModules} ${totalModules}" ` +
    `width="${targetSize}" height="${targetSize}" shape-rendering="crispEdges">` +
    `${bgRect}` +
    `<path d="${path.trim()}" fill="${fg}"/>` +
    `</svg>`
  );
}

/**
 * Renders the QR code onto a canvas element.
 */
export function renderQrToCanvas(
  qr: QrCode,
  canvas: HTMLCanvasElement,
  options: QrRenderOptions = {},
): void {
  const fg = options.foregroundColor || '#000000';
  const bg = options.backgroundColor ?? '#ffffff';
  const margin = Math.max(0, options.margin ?? 4);
  const targetSize = Math.max(64, Math.min(4096, options.size || 512));

  const totalModules = qr.size + margin * 2;
  canvas.width = targetSize;
  canvas.height = targetSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;

  // Background
  if (!bg || bg === 'transparent') {
    ctx.clearRect(0, 0, targetSize, targetSize);
  } else {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, targetSize, targetSize);
  }

  // Draw modules
  ctx.fillStyle = fg;
  const modulePixelSize = targetSize / totalModules;

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        const px = Math.round((x + margin) * modulePixelSize);
        const py = Math.round((y + margin) * modulePixelSize);
        const pNextX = Math.round((x + margin + 1) * modulePixelSize);
        const pNextY = Math.round((y + margin + 1) * modulePixelSize);
        ctx.fillRect(px, py, pNextX - px, pNextY - py);
      }
    }
  }

  // Logo overlay if present
  if (options.logoImage) {
    const logoRatio = Math.max(0.1, Math.min(0.28, options.logoSizeRatio ?? 0.22));
    const logoSize = Math.round(targetSize * logoRatio);
    const logoPos = Math.round((targetSize - logoSize) / 2);
    const pad = Math.round(logoSize * 0.08);

    // Draw white / bg badge behind logo for high contrast
    ctx.fillStyle = bg && bg !== 'transparent' ? bg : '#ffffff';
    ctx.beginPath();
    ctx.roundRect(logoPos - pad, logoPos - pad, logoSize + pad * 2, logoSize + pad * 2, pad * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(logoPos, logoPos, logoSize, logoSize, pad);
    ctx.clip();
    ctx.drawImage(options.logoImage, logoPos, logoPos, logoSize, logoSize);
    ctx.restore();
  }
}

/**
 * Exports the canvas as a Blob (PNG or JPEG).
 */
export async function exportCanvasBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg' = 'image/png',
  quality = 0.95,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to export canvas blob'));
      },
      type,
      quality,
    );
  });
}
