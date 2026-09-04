import { Injectable } from '@angular/core';
import { AppError } from '../errors';
import { canvasToBlob, loadImage } from '../image/image-file.util';
import { tryNativeMatte, warmNativeMatte } from '../image/native-matte';

/**
 * Background removal, run entirely on this machine.
 *
 * This used to be `@imgly/background-removal`, and replacing it fixed three
 * things that were each, on their own, disqualifying:
 *
 * 1. LICENCE. That library is AGPL-3.0. The app conveys it to every visitor's
 *    browser, which is distribution, so the copyleft reaches the combined work —
 *    incompatible with selling B2B subscriptions and on-premise corporate
 *    licences. The model was never the problem: IS-Net is Apache-2.0, from the
 *    DIS paper (Qin et al., ECCV 2022). Only the wrapper was AGPL. So the wrapper
 *    is gone and the model stayed.
 *
 * 2. IT PHONED HOME. It fetched ~91 MB of weights from staticimgly.com, in 4 MB
 *    chunks, at runtime. The user's image never left — that part of the claim
 *    always held — but the CDN still learned their IP and that they were removing
 *    a background from something. For a product sold to lawyers on LGPD grounds,
 *    that is a finding, not a footnote.
 *
 * 3. IT DID NOT WORK. Under load that CDN rate-limits and answers 504
 *    mid-download; the tool then died with "check your connection" while the
 *    connection was fine. Measured, not theorised.
 *
 * Now: onnxruntime-web (MIT) and a 42 MB int8 IS-Net (Apache-2.0), both served
 * from our own origin and cached by the service worker on first use. So the
 * download happens once, ever, and the tool works with the cable pulled — which
 * is the one thing this whole product claims.
 *
 * `onnxruntime-web` is imported dynamically, and must stay that way: it is
 * megabytes of glue, and a static import puts it in the initial bundle for every
 * visitor, including the ones who only came to crop a photo.
 *
 * Stateless on purpose. This used to be a root singleton holding
 * isProcessing/progress/processedImageUrl signals, which meant: (a) the previous
 * image's result was still in the signal when you re-entered the tool, and (b)
 * nothing guarded re-entrancy, so leaving mid-run and coming back kicked off a
 * SECOND concurrent model run that fought the first one for the same signals —
 * the progress bar could even go backwards.
 *
 * State now lives in the component, which Angular destroys on navigation. The
 * caches below keep that from costing anything.
 */

/** IS-Net was trained at 1024², with mean 0.5 and unit variance. Deviate and the mask degrades. */
const SIZE = 1024;
const MEAN = 0.5;
const STD = 1.0;

/** Where the alpha ramp starts and ends. See smoothstep() for why it is not a plain threshold. */
const LOW = 0.35;
const HIGH = 0.75;

type OrtModule = typeof import('onnxruntime-web/wasm');
type OrtSession = Awaited<ReturnType<OrtModule['InferenceSession']['create']>>;

@Injectable({ providedIn: 'root' })
export class BackgroundRemovalService {
  private readonly cache = new WeakMap<File, Blob>();

  /** The session owns the 42 MB of weights. Build it once; never per image. */
  private session?: Promise<{ ort: OrtModule; session: OrtSession }>;

  /**
   * Warm the session ahead of any image, so the first run is inference-only.
   *
   * Shares the same memoised promise as removeBackground(), which is the whole
   * point: a prefetch already in flight is what the first real run awaits, and a
   * finished one makes it instant. Calling this twice costs nothing.
   *
   * Errors are swallowed on purpose — a prefetch is opportunistic, and a failed
   * one must not surface as an error the user did not ask for. The real run
   * retries and reports through the normal path.
   *
   * No app empacotado o aquecimento é OUTRO: `warmNativeMatte()` monta a sessão
   * nativa e, quando ela sobe, a do WASM não é montada NENHUMA vez. Isso não é
   * economia de tempo, é de memória: um `InferenceSession` do onnxruntime-web
   * segura os 44 MB de pesos pelo resto do processo, e deixá-lo de pé ao lado do
   * nativo colocaria duas cópias do mesmo modelo na mesma aba, uma delas para
   * nunca rodar — pressão de memória durante a única conta pesada do produto.
   */
  prefetch(onDownload?: (fraction: number) => void): Promise<void> {
    return warmNativeMatte().then((warm) => (warm ? undefined : this.loadWasm(onDownload)));
  }

  private loadWasm(onDownload?: (fraction: number) => void): Promise<void> {
    return this.load(onDownload).then(
      () => undefined,
      () => {
        // A failed prefetch must not poison the memo: leave nothing behind, so
        // the next real run starts clean instead of rethrowing this same error.
        this.session = undefined;
      },
    );
  }

  async removeBackground(file: File, onProgress?: (percent: number) => void): Promise<Blob> {
    const cached = this.cache.get(file);
    if (cached) {
      onProgress?.(100);
      return cached;
    }

    try {
      onProgress?.(5);
      const image = await loadImage(file);

      // Two inputs, two right tools. A photo needs the AI, which reads soft edges
      // like hair. A flat graphic on a solid/simple background — a logo, an icon,
      // a product render, a fake-transparency checkerboard — is the AI's worst
      // case: it is out of distribution and the mask comes back as salt-and-pepper
      // speckle. But that same input has a well-defined background colour, so it
      // is keyed out cleanly instead. The input is measured first and routed to
      // whichever tool actually fits it.
      const blob = isFlatGraphic(image)
        ? await removeFlatBackground(image, onProgress)
        : await this.removeWithModel(image, onProgress);

      this.cache.set(file, blob);
      onProgress?.(100);
      return blob;
    } catch (err) {
      console.error('Background removal failed:', err);
      throw new AppError('model_failed', err);
    }
  }

  private async removeWithModel(image: HTMLImageElement, onProgress?: (percent: number) => void): Promise<Blob> {
    onProgress?.(5);

    // O quadrado é desenhado UMA vez e serve aos dois caminhos: o nativo o
    // recebe como PNG, o WASM o lê como tensor. Desenhá-lo antes de escolher é o
    // que garante que os dois vejam exatamente os mesmos pixels de entrada.
    const square = rasterise(image, SIZE, SIZE);

    // O ATALHO NATIVO, e ele é a razão de existir do `native-matte.ts`: dentro do
    // app o WebView não tem SharedArrayBuffer, então o WASM abaixo rodaria numa
    // thread só. Devolve `null` em qualquer dúvida, e aí o caminho de sempre
    // assume inteiro. Na web é constante de build e o esbuild apaga a chamada.
    const native = await tryNativeMatte(square.canvas, SIZE, onProgress);
    if (native) {
      onProgress?.(92);
      return applyMask(image, native);
    }

    // The 42 MB model download is the longest wait on the first run, and the only
    // opaque phase we can actually measure — so it gets real, byte-accurate
    // progress (5→60). On every later run the model is cached and this jumps
    // straight through. The inference that follows is a single unsplittable WASM
    // call; the component trickles the bar across it so it never looks frozen.
    const { ort, session } = await this.load((fraction) => onProgress?.(5 + Math.round(fraction * 55)));

    onProgress?.(65);
    const input = toTensor(ort, square.imageData);

    onProgress?.(70);
    const output = await session.run({ [session.inputNames[0]]: input });
    const mask = output[session.outputNames[0]].data as Float32Array;

    onProgress?.(92);
    return applyMask(image, mask);
  }

  private load(onDownload?: (fraction: number) => void): Promise<{ ort: OrtModule; session: OrtSession }> {
    this.session ??= (async () => {
      const ort = await import('onnxruntime-web/wasm');

      // Our own origin, so this survives the network being cut.
      ort.env.wasm.wasmPaths = new URL('ort/', document.baseURI).href;

      // Run inference in a Web Worker, not on the main thread. Without this, the
      // single run() call blocks the whole tab for the duration — the UI freezes,
      // and no timer can animate, which is exactly why the progress bar stuck. Off
      // the main thread, the page stays responsive and the bar keeps moving.
      ort.env.wasm.proxy = true;

      // WASM threads need SharedArrayBuffer, which needs the COOP/COEP headers the
      // server now sends (crossOriginIsolated). With them, inference spreads across
      // cores — measured ~2x faster than single-threaded (and ~6x vs the original).
      // Without them (a host that omits the headers), it falls back to one thread.
      //
      // WebGPU was tried here and deliberately NOT kept: on real hardware (AMD
      // RDNA2) it ran ~2x SLOWER than this, because onnxruntime-web's WebGPU
      // backend does not cover all of IS-Net's operators, so the graph bounces
      // between GPU and CPU and the transfers cost more than the GPU saves. CPU +
      // threads is the faster and simpler path for this model.
      ort.env.wasm.numThreads = crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

      // Fetch the weights ourselves so the download has a real progress bar;
      // handing the bytes to create() avoids a second fetch. int8, 42 MB —
      // indistinguishable from the 168 MB fp32 on real portraits. The model
      // ships as ~22 MiB parts (Cloudflare Pages caps single files at 25 MiB);
      // fetchModel reassembles them into the original bytes.
      const model = await fetchModel(onDownload);
      const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });

      return { ort, session };
    })();

    return this.session;
  }
}

interface ModelManifest {
  bytes: number;
  parts: string[];
}

/**
 * Fetches the model and reassembles it, reporting download progress as a 0..1
 * fraction across the WHOLE download.
 *
 * The weights ship as ~22 MiB parts (Cloudflare Pages rejects any single file
 * over 25 MiB) listed in a manifest, so this reads the manifest, then streams
 * each part straight into one preallocated buffer sized from `manifest.bytes`.
 * Concatenation is byte-exact — the parts were sliced with no re-encoding — so
 * the result is identical to the original .onnx. Progress tracks bytes against
 * the manifest total, not part boundaries, so a two-part model still fills the
 * bar smoothly. A cache hit (no readable body) just advances one part at a time.
 */
async function fetchModel(onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  const base = document.baseURI;

  const manifestResponse = await fetch(new URL('model/isnet-q8.manifest.json', base).href);
  if (!manifestResponse.ok) throw new Error(`model ${manifestResponse.status}`);
  const manifest = (await manifestResponse.json()) as ModelManifest;

  const bytes = new Uint8Array(manifest.bytes);
  let offset = 0;

  for (const part of manifest.parts) {
    const response = await fetch(new URL(`model/${part}`, base).href);
    if (!response.ok) throw new Error(`model ${response.status}`);

    if (!response.body) {
      const buf = new Uint8Array(await response.arrayBuffer());
      bytes.set(buf, offset);
      offset += buf.length;
      onProgress?.(Math.min(1, offset / manifest.bytes));
      continue;
    }

    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes.set(value, offset);
      offset += value.length;
      onProgress?.(Math.min(1, offset / manifest.bytes));
    }
  }

  return bytes;
}

/**
 * Normalised NCHW out of the square the caller already rasterised — what IS-Net
 * expects.
 *
 * It takes the ImageData rather than the image because the SQUARE is now shared:
 * the native path sends that same canvas across the bridge, and the two paths
 * having their own `drawImage` would be two chances to feed the model different
 * pixels for the same file.
 */
function toTensor(ort: OrtModule, square: ImageData): InstanceType<OrtModule['Tensor']> {
  const { data } = square;

  const pixels = SIZE * SIZE;
  const chw = new Float32Array(3 * pixels);

  // RGBA interleaved -> planar RGB. The channel stride is why this is not a map().
  for (let i = 0; i < pixels; i++) {
    chw[i] = (data[i * 4] / 255 - MEAN) / STD;
    chw[pixels + i] = (data[i * 4 + 1] / 255 - MEAN) / STD;
    chw[2 * pixels + i] = (data[i * 4 + 2] / 255 - MEAN) / STD;
  }

  return new ort.Tensor('float32', chw, [1, 3, SIZE, SIZE]);
}

/**
 * The model's output is unbounded, not a probability — the reference
 * implementation min-max normalises it before use, and skipping that step gives
 * a mask that is either fully opaque or fully transparent.
 */
async function applyMask(image: HTMLImageElement, mask: Float32Array): Promise<Blob> {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of mask) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;

  // Paint the mask at model resolution, then let the browser scale it back with
  // the same bilinear filter it used going in. Nearest-neighbour here is what
  // gives cut-outs their jagged, obviously-machine-made edge.
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = SIZE;
  maskCanvas.height = SIZE;

  const maskCtx = maskCanvas.getContext('2d');
  if (!maskCtx) throw new Error('2D context unavailable');

  const maskData = maskCtx.createImageData(SIZE, SIZE);
  for (let i = 0; i < mask.length; i++) {
    const alpha = smoothstep((mask[i] - lo) / span) * 255;
    maskData.data[i * 4] = 255;
    maskData.data[i * 4 + 1] = 255;
    maskData.data[i * 4 + 2] = 255;
    maskData.data[i * 4 + 3] = alpha;
  }
  maskCtx.putImageData(maskData, 0, 0);

  const out = document.createElement('canvas');
  out.width = image.naturalWidth;
  out.height = image.naturalHeight;

  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');

  ctx.drawImage(image, 0, 0);

  // Keep the source pixels only where the mask is opaque. This is the cut.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskCanvas, 0, 0, out.width, out.height);

  // PNG, always: the whole point of the output is an alpha channel, and JPEG has none.
  return canvasToBlob(out, 'image/png');
}

/**
 * Hardens the mask's shoulders while keeping its edge soft.
 *
 * Straight min-max normalisation leaves a wide band of low-but-nonzero alpha
 * around the subject, and against a saturated backdrop that band reads as a halo
 * of the *original background colour* — a yellow fringe around the hair, which is
 * the single most recognisable tell of a bad cut-out.
 *
 * Clamping the tails to 0 and 1 and easing only the middle kills the fringe
 * without turning hair into a jagged stencil, which is what a hard threshold does.
 */
function smoothstep(v: number): number {
  const t = Math.min(1, Math.max(0, (v - LOW) / (HIGH - LOW)));
  return t * t * (3 - 2 * t);
}

// ---- flat-graphic path: colour flood-fill, not AI ------------------------------

/** Quantise to 4 bits per channel — enough to cluster a flat palette, coarse enough to fold anti-aliasing in. */
function quantise(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

/**
 * True when the image is a flat graphic on a simple background — a logo, an icon,
 * a product render, a painted fake-transparency checkerboard — rather than a
 * photo. Two conditions, and both are needed:
 *
 * - The image is dominated by a few flat colours. A graphic is mostly large flat
 *   fills, so its top few colours cover almost all of it; a photo spreads across
 *   thousands, so they cover only a fraction. This is measured as the share of
 *   the image held by the eight most common colours, and it is what tells a
 *   *colourful* logo apart from a photo — counting distinct colours does not,
 *   because a rich logo can carry as many as a plain photo.
 * - A border dominated by a handful of colours: the background is flat and
 *   removable from the edge inwards.
 *
 * Requiring both is deliberate. A portrait on a plain white studio wall has a
 * concentrated border, but the person fills it with skin and hair gradients, so
 * the top colours cover far less than a graphic's — it belongs to the AI, which
 * handles the soft hair edge a colour key would chew away or fringe. Measured on
 * real assets, the top-8 share separates cleanly: line-art 99.8%, mono logo
 * 97.9%, colourful logo 94.4% — versus a photo at 49.5%.
 */
const FLAT_DOMINANCE = 0.8;
const FLAT_BORDER_SHARE = 0.9;

function isFlatGraphic(image: HTMLImageElement): boolean {
  const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));

  // Nearest-neighbour on the way down: smoothing would blend the flat palette into
  // hundreds of interpolated colours and make every graphic look like a photo.
  const { data } = rasterise(image, w, h, false).imageData;

  const all = new Map<number, number>();
  const border = new Map<number, number>();
  let pixels = 0;
  let borderCount = 0;

  const note = (map: Map<number, number>, i: number): void => {
    const k = quantise(data[i], data[i + 1], data[i + 2]);
    map.set(k, (map.get(k) ?? 0) + 1);
  };

  for (let i = 0; i < data.length; i += 4) {
    note(all, i);
    pixels++;
  }
  for (let x = 0; x < w; x++) {
    note(border, x * 4);
    note(border, ((h - 1) * w + x) * 4);
    borderCount += 2;
  }
  for (let y = 0; y < h; y++) {
    note(border, y * w * 4);
    note(border, (y * w + w - 1) * 4);
    borderCount += 2;
  }

  const share = (map: Map<number, number>, n: number, total: number): number =>
    [...map.values()].sort((a, b) => b - a).slice(0, n).reduce((a, b) => a + b, 0) / total;

  return share(all, 8, pixels) >= FLAT_DOMINANCE && share(border, 4, borderCount) >= FLAT_BORDER_SHARE;
}

/**
 * A pixel this close to a background colour (Chebyshev on RGB) is fully removed;
 * one this far is fully kept; in between, alpha ramps. The ramp is what
 * anti-aliases the cut — a hard threshold would leave a stair-stepped edge.
 */
const KEY_IN = 45;
const KEY_OUT = 100;

/**
 * Removes a flat background by keying out its colour wherever it appears — a
 * chroma key, exactly like the magic wand in an image editor.
 *
 * This deliberately does NOT try to be clever about *which* background-coloured
 * pixels to keep. An earlier version flood-filled from the border and then tried
 * to guess, pocket by pocket, whether an enclosed patch of background colour was
 * a letter's counter (remove) or an intentional white cut-out inside a coloured
 * shape (keep), using the saturation of what surrounded it. That guess is
 * unwinnable: the two are the same pixels, and every rule that saved one case
 * broke another — the heuristic that preserved the white arrows inside one logo
 * is the one that left white blobs inside the letters of the next.
 *
 * So the rule is now single and predictable: the background colour is removed
 * everywhere, including inside letters. The honest cost is that a foreground
 * detail painted in the background's own colour — white lettering on a white
 * ground, a white icon on a white card — goes too. That is inherent to keying by
 * colour, it is what every chroma key does, and it is predictable in a way the
 * guessing never was.
 *
 * The palette (not a single colour) is sampled from the border, so a two-tone
 * background like a fake-transparency checkerboard keys out as cleanly as a solid
 * one.
 */
async function removeFlatBackground(image: HTMLImageElement, onProgress?: (percent: number) => void): Promise<Blob> {
  onProgress?.(40);

  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const { canvas, ctx, imageData } = rasterise(image, w, h);
  const data = imageData.data;

  const palette = borderPalette(data, w, h);

  onProgress?.(65);

  for (let i = 0; i < data.length; i += 4) {
    let nearest = Infinity;
    for (const c of palette) {
      const d = Math.max(Math.abs(data[i] - c[0]), Math.abs(data[i + 1] - c[1]), Math.abs(data[i + 2] - c[2]));
      if (d < nearest) nearest = d;
    }

    if (nearest <= KEY_IN) {
      data[i + 3] = 0;
    } else if (nearest < KEY_OUT) {
      data[i + 3] = Math.round((data[i + 3] * (nearest - KEY_IN)) / (KEY_OUT - KEY_IN));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  onProgress?.(85);

  return canvasToBlob(canvas, 'image/png');
}

/**
 * The background's own colours, sampled from the border and returned as RGB
 * references. Buckets the frame by coarse-quantised colour, then returns the
 * average RGB of the buckets that together cover most of the border — a
 * two-colour checkerboard yields two references, a solid background yields one.
 */
function borderPalette(data: Uint8ClampedArray, w: number, h: number): ReadonlyArray<readonly [number, number, number]> {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  let total = 0;

  const add = (i: number): void => {
    const key = quantise(data[i], data[i + 1], data[i + 2]);
    const acc = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    acc.r += data[i];
    acc.g += data[i + 1];
    acc.b += data[i + 2];
    acc.n++;
    buckets.set(key, acc);
    total++;
  };

  for (let x = 0; x < w; x++) {
    add((x) * 4);
    add(((h - 1) * w + x) * 4);
  }
  for (let y = 0; y < h; y++) {
    add((y * w) * 4);
    add((y * w + w - 1) * 4);
  }

  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n);
  const palette: Array<readonly [number, number, number]> = [];
  let covered = 0;

  for (const acc of ranked) {
    palette.push([acc.r / acc.n, acc.g / acc.n, acc.b / acc.n]);
    covered += acc.n;
    // Stop once the frame is explained; the long tail is anti-aliasing, not background.
    if (covered / total >= 0.98) break;
  }

  return palette;
}

/** Draw an image to a fresh canvas and hand back everything a pixel pass needs. */
function rasterise(
  image: HTMLImageElement,
  w: number,
  h: number,
  smooth = true,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; imageData: ImageData } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D context unavailable');

  ctx.imageSmoothingEnabled = smooth;
  ctx.drawImage(image, 0, 0, w, h);
  return { canvas, ctx, imageData: ctx.getImageData(0, 0, w, h) };
}
