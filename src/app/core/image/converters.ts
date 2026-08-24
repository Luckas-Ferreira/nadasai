// Type-only, so it is erased at build time and does NOT undo the lazy
// import() inside encodePdfFromImages.
import type { jsPDF as JsPdfDoc } from 'jspdf';
import { AppError } from '../errors';
import { canvasToBlob, drawToCanvas, loadImage } from './image-file.util';

/** Formats we can actually produce. AVIF is absent on purpose — see encodeImage. */
export type ImageFormat = 'webp' | 'jpeg' | 'png';
export type TargetFormat = 'WEBP' | 'JPEG' | 'PNG' | 'PDF';

export const TARGET_FORMATS: readonly TargetFormat[] = ['WEBP', 'JPEG', 'PNG', 'PDF'];

/**
 * Formats that cannot be fed back into the editing chain.
 *
 * ICO saiu daqui junto com a opção que o conversor oferecia. Ela era
 * `encodeIco(file)` sem argumento nenhum — os seis tamanhos padrão, fixos, e
 * nada na tela dizendo o que ia sair. A ferramenta `favicon` chama o MESMO
 * encoder com os tamanhos escolhidos, então a opção daqui era a mesma coisa com
 * controle pior. `encodeIco` e `ICO_SIZES` continuam neste arquivo: quem os usa
 * agora é só ela.
 *
 * O PDF fica, e não é o mesmo caso: o `img-to-pdf` é multipágina e limita o
 * raster por `maxLongSide`, enquanto aqui a imagem entra em resolução plena —
 * são comportamentos diferentes, não duas portas para a mesma coisa.
 */
export const TERMINAL_FORMATS: readonly TargetFormat[] = ['PDF'];

export const MIME_FOR_TARGET: Record<TargetFormat, string> = {
  WEBP: 'image/webp',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  PDF: 'application/pdf',
};

/**
 * NOTE ON AVIF: `canvas.toBlob('image/avif')` is not supported by any major
 * browser, and per the HTML spec an unsupported type silently falls back to
 * PNG — it does not throw and does not return null. The old code trusted it and
 * shipped PNG bytes inside a file named `.avif` with a forged `image/avif` MIME.
 * Encoding AVIF for real needs a multi-hundred-kB WASM encoder, so AVIF is
 * accepted as INPUT (browsers decode it fine) but is not offered as output.
 */
export async function encodeImage(
  file: File,
  format: ImageFormat,
  quality = 0.9,
): Promise<Blob> {
  const img = await loadImage(file);

  // JPEG has no alpha channel: without an explicit fill, transparent pixels
  // serialize as black. This is the same root cause as the black-PDF bug.
  const background = format === 'jpeg' ? '#ffffff' : undefined;

  const canvas = drawToCanvas(img, {
    width: img.naturalWidth,
    height: img.naturalHeight,
    background,
  });

  // PNG is lossless; passing a quality argument to it is meaningless.
  return canvasToBlob(canvas, `image/${format}`, format === 'png' ? undefined : quality);
}

export interface ResizeOptions {
  width: number;
  height: number;
  /** Defaults to the source type, so a PNG stays a lossless PNG. */
  mime?: string;
  quality?: number;
}

/**
 * Resizes to the EXACT target box.
 *
 * The old implementation delegated to browser-image-compression's
 * `maxWidthOrHeight`, which only ever downscales — asking for 1920px on a
 * 1200px image silently did nothing — and re-encoded at 85% quality, so a
 * "resize" also degraded the image.
 */
export async function resizeImage(file: File, opts: ResizeOptions): Promise<Blob> {
  const img = await loadImage(file);

  const mime = opts.mime ?? (file.type === 'image/gif' ? 'image/png' : file.type);
  const background = mime === 'image/jpeg' ? '#ffffff' : undefined;

  const canvas = drawToCanvas(img, {
    width: opts.width,
    height: opts.height,
    background,
  });

  return canvasToBlob(canvas, mime, mime === 'image/png' ? undefined : (opts.quality ?? 0.92));
}

/**
 * How each image becomes a page.
 *
 * - `fit`: the page IS the image — one page per image, sized to its pixels.
 * - `a4`: every page is A4, the image letterboxed inside a margin. What you want
 *   when the PDF is going to be printed or stapled to a form.
 */
export type PdfPageMode = 'a4' | 'fit';

/** A4 in points, portrait. Spelled out so the letterbox maths can use it. */
const A4_PT = { width: 595.28, height: 841.89 } as const;

/**
 * Whitespace around the image on an A4 page. 24pt ≈ 8.5mm, which clears the
 * unprintable margin of a consumer printer instead of letting it clip the photo.
 */
const A4_MARGIN_PT = 24;

const PDF_JPEG_QUALITY = 0.92;

/**
 * Long-side cap for a multi-image PDF, in pixels. ~200 DPI across an A4 page.
 *
 * Without it a batch of phone photos is unusable: a 12 MP frame lands at 2-3 MB
 * of JPEG *per page*, so twenty of them build a 50 MB PDF and the tab spends the
 * whole encode near its memory ceiling. Single-image `encodePdf` passes no cap,
 * because there the user asked for exactly one image and its full resolution.
 */
export const PDF_MAX_LONG_SIDE = 2400;

export interface ImagesToPdfOptions {
  /** Defaults to `fit`, which is what single-image conversion has always done. */
  pageMode?: PdfPageMode;
  /** Painted behind transparency AND, in `a4`, across the whole page. */
  background?: string;
  /** Downscales any image whose long side exceeds this. Omit for full resolution. */
  maxLongSide?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Builds one PDF out of N images, in the order given.
 *
 * jsPDF is imported lazily: it pulls in html2canvas and adds ~350 kB, which
 * used to sit in the convert chunk even for users who only ever export WebP.
 *
 * The loop is SEQUENTIAL on purpose. Mapping it through Promise.all decodes
 * every image and holds every canvas at once — thirty 12 MP photos is several
 * gigabytes of RGBA and the tab dies. Done one at a time, the peak is one canvas.
 */
export async function encodePdfFromImages(
  files: readonly File[],
  opts: ImagesToPdfOptions = {},
): Promise<Blob> {
  if (!files.length) throw new AppError('encode_failed');

  const { pageMode = 'fit', background = '#ffffff', maxLongSide, onProgress } = opts;

  const { jsPDF } = await import('jspdf');
  let doc: JsPdfDoc | null = null;
  let done = 0;

  for (const file of files) {
    const img = await loadImage(file);
    const { width, height } = rasterSize(img, maxLongSide);

    // Flattening first is what fixes the black background: jsPDF rasterizes onto
    // a transparent canvas and JPEG cannot carry alpha, so transparency became black.
    const canvas = drawToCanvas(img, { width, height, background });
    const dataUrl = canvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY);

    const landscape = width >= height;
    const orientation = landscape ? 'landscape' : 'portrait';
    const format = pageMode === 'a4' ? 'a4' : [width, height];
    const unit = pageMode === 'a4' ? 'pt' : 'px';

    if (doc) doc.addPage(format, orientation);
    else doc = new jsPDF({ orientation, unit, format, compress: true });

    if (pageMode === 'a4') {
      const pageW = landscape ? A4_PT.height : A4_PT.width;
      const pageH = landscape ? A4_PT.width : A4_PT.height;

      // The page, not just the image, carries the backdrop: a black-flattened
      // photo sitting in white margins reads as a mistake.
      doc.setFillColor(background);
      doc.rect(0, 0, pageW, pageH, 'F');

      const box = containBox(width, height, pageW - 2 * A4_MARGIN_PT, pageH - 2 * A4_MARGIN_PT);
      doc.addImage(dataUrl, 'JPEG', (pageW - box.width) / 2, (pageH - box.height) / 2, box.width, box.height);
    } else {
      doc.addImage(dataUrl, 'JPEG', 0, 0, width, height);
    }

    onProgress?.(++done, files.length);
  }

  // Non-null: `files` is known non-empty, so the loop ran at least once.
  return doc!.output('blob');
}

/** Single image, page sized to it. The shape the convert tool has always used. */
export function encodePdf(file: File, background = '#ffffff'): Promise<Blob> {
  return encodePdfFromImages([file], { pageMode: 'fit', background });
}

function rasterSize(img: HTMLImageElement, maxLongSide?: number) {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const longSide = Math.max(width, height);

  if (!maxLongSide || longSide <= maxLongSide) return { width, height };

  const scale = maxLongSide / longSide;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Largest box with the source aspect ratio that fits inside width x height. */
function containBox(sourceW: number, sourceH: number, width: number, height: number) {
  const scale = Math.min(width / sourceW, height / sourceH);
  return { width: sourceW * scale, height: sourceH * scale };
}

export const ICO_SIZES = [16, 32, 48, 64, 128, 256] as const;

/**
 * Fora de `MIME_FOR_TARGET` porque ICO deixou de ser destino do conversor: ele
 * é o formato de UMA ferramenta (`favicon`), não uma das saídas da conversão.
 */
const ICO_MIME = 'image/vnd.microsoft.icon';

/**
 * Builds a real multi-resolution ICO with PNG-compressed entries.
 *
 * The old version stretched any aspect ratio into a single square (a 1600x900
 * photo came out as a squashed 256x256), and never awaited its toBlob callback,
 * so the caller cleared its spinner before the file existed.
 */
export async function encodeIco(
  file: File,
  sizes: readonly number[] = ICO_SIZES,
): Promise<Blob> {
  const img = await loadImage(file);

  const pngs = await Promise.all(
    sizes.map(async (size) => {
      // `contain` letterboxes into the square instead of distorting.
      const canvas = drawToCanvas(img, { width: size, height: size, contain: true });
      const blob = await canvasToBlob(canvas, 'image/png');
      return { size, buffer: await blob.arrayBuffer() };
    }),
  );

  if (!pngs.length) throw new AppError('encode_failed');

  const HEADER = 6;
  const ENTRY = 16;
  const directorySize = HEADER + ENTRY * pngs.length;
  const total = directorySize + pngs.reduce((sum, p) => sum + p.buffer.byteLength, 0);

  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  // ICONDIR
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: 1 = icon
  view.setUint16(4, pngs.length, true); // image count

  let offset = directorySize;
  pngs.forEach((png, i) => {
    const entry = HEADER + i * ENTRY;
    // 256 is encoded as 0 in a single byte.
    view.setUint8(entry, png.size === 256 ? 0 : png.size);
    view.setUint8(entry + 1, png.size === 256 ? 0 : png.size);
    view.setUint8(entry + 2, 0); // palette size
    view.setUint8(entry + 3, 0); // reserved
    view.setUint16(entry + 4, 1, true); // colour planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, png.buffer.byteLength, true);
    view.setUint32(entry + 12, offset, true);

    bytes.set(new Uint8Array(png.buffer), offset);
    offset += png.buffer.byteLength;
  });

  return new Blob([out], { type: ICO_MIME });
}

/**
 * What compression can produce for a given input MIME.
 *
 * Anything absent is decodable but not encodable by a browser (GIF, BMP, AVIF —
 * see ACCEPTED_INPUT_MIME), so those cannot be compressed in place at all.
 */
const COMPRESS_FORMAT: Record<string, ImageFormat> = {
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg', // some scanners and old exporters still write this
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * The format a compression run will produce for `file`.
 *
 * Compression must not change what the file IS — that is the convert tool's
 * job. This used to force WebP on everything, so someone who dropped a JPEG in
 * to make it smaller got back a `.webp` their destination might refuse, and the
 * chain then carried a different format than the one they started with.
 *
 * WebP is only a FALLBACK, for inputs the browser can decode but not write.
 * There is no way to keep those, and it must not be left to `canvas.toBlob`,
 * which silently writes PNG for a type it does not support (see encodeImage).
 */
export function compressFormatFor(file: File): ImageFormat {
  return COMPRESS_FORMAT[file.type.toLowerCase()] ?? 'webp';
}

/** False only for GIF/BMP/AVIF, where the output has to change format. */
export function compressKeepsFormat(file: File): boolean {
  return COMPRESS_FORMAT[file.type.toLowerCase()] !== undefined;
}

export interface CompressResult {
  blob: Blob;
  /** What was actually written — the caller names the file from this. */
  format: ImageFormat;
  /** True when re-encoding grew the file and the input bytes were handed back. */
  keptOriginal: boolean;
}

/**
 * Recompresses at the requested quality, in the input's own format. Dimensions
 * are left untouched.
 *
 * `keptOriginal` is the same call `PdfCompressorService` makes: a compressor
 * that returns a BIGGER file is the one failure nobody forgives, and it stopped
 * being an edge case once the format is preserved — PNG has no lossy mode, so
 * its re-encode is a lossless rewrite that routinely lands above the original.
 * Only when the format survived, though: a GIF that came back as WebP has to
 * stay WebP even if it grew, or the download would carry the wrong extension
 * for its bytes.
 */
export async function compressImage(file: File, quality: number): Promise<CompressResult> {
  const format = compressFormatFor(file);
  const blob = await encodeImage(file, format, quality);

  if (compressKeepsFormat(file) && blob.size >= file.size) {
    return { blob: file.slice(0, file.size, file.type), format, keptOriginal: true };
  }

  return { blob, format, keptOriginal: false };
}
