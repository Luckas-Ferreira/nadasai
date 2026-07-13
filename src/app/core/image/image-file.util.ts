import { AppError } from '../errors';

/** AVIF is decodable by the browser, so it is accepted as input even though we cannot encode it. */
export const ACCEPTED_INPUT_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
] as const;

export const ACCEPT_ATTR = ACCEPTED_INPUT_MIME.join(',');

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Browsers refuse to allocate canvases beyond roughly this size. */
export const MAX_CANVAS_PIXELS = 40_000_000;

export function isSupportedImage(file: File): boolean {
  return (ACCEPTED_INPUT_MIME as readonly string[]).includes(file.type);
}

/** Throws AppError('unsupported_file' | 'too_large'). */
export function assertUsableImage(file: File): void {
  if (!isSupportedImage(file)) throw new AppError('unsupported_file');
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError('too_large');
}

export function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'image/vnd.microsoft.icon': 'ico',
};

export function extForMime(mime: string): string {
  return MIME_EXT[mime] ?? 'bin';
}

/**
 * Builds the output filename from the ORIGINAL name plus the real output
 * extension — so a PNG produced from photo.jpg is `photo-nobg.png`, never
 * `nobg-photo.jpg` (which is what the app used to hand people).
 */
export function suffixedName(originalName: string, suffix: string, ext: string): string {
  return `${baseName(originalName)}-${suffix}.${ext}`;
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

/**
 * Decodes a Blob or URL into an <img>.
 *
 * The `onerror` reject is load-bearing: the previous implementation only wired
 * `onload`, so a corrupt file left the promise pending forever and the calling
 * spinner never cleared.
 */
export function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const revoke = typeof source === 'string' ? () => {} : () => URL.revokeObjectURL(url);
    const img = new Image();

    img.onload = () => {
      revoke();
      resolve(img);
    };
    img.onerror = () => {
      revoke();
      reject(new AppError('decode_failed'));
    };
    img.src = url;
  });
}

/** Promisified canvas.toBlob. Rejects instead of handing back null. */
export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new AppError('encode_failed'))),
      type,
      quality,
    );
  });
}

export interface DrawOptions {
  width: number;
  height: number;
  /** Fill painted before the image. Required for formats without alpha (JPEG, PDF). */
  background?: string;
  /** Letterbox the source inside the target box instead of stretching it. */
  contain?: boolean;
}

export function drawToCanvas(img: HTMLImageElement, opts: DrawOptions): HTMLCanvasElement {
  const width = Math.max(1, Math.round(opts.width));
  const height = Math.max(1, Math.round(opts.height));

  if (width * height > MAX_CANVAS_PIXELS) throw new AppError('too_many_pixels');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AppError('encode_failed');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, width, height);
  }

  if (opts.contain) {
    const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  } else {
    ctx.drawImage(img, 0, 0, width, height);
  }

  return canvas;
}

/** Composites the image over a solid colour. Used for backdrops, JPEG and PDF. */
export function flatten(img: HTMLImageElement, background: string): HTMLCanvasElement {
  return drawToCanvas(img, {
    width: img.naturalWidth,
    height: img.naturalHeight,
    background,
  });
}
