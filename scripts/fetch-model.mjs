/**
 * Downloads the background-removal model into public/model/.
 *
 * The weights are not committed: 42 MB has no business in git history, and it
 * would be re-downloaded on every clone anyway. This runs on postinstall and is
 * a no-op once the file is on disk, so `npm ci && npm run build` on a fresh CI
 * box or a static host produces a complete deploy.
 *
 * Provenance matters here more than usual, so it is written down:
 *
 *   IS-Net, from "Highly Accurate Dichotomous Image Segmentation" (Qin et al.,
 *   ECCV 2022) — github.com/xuebinqin/DIS — Apache-2.0. This is an int8
 *   quantisation of the official isnet-general-use weights, 42 MB instead of
 *   168 MB, mirrored on Hugging Face under the same licence.
 *
 * That licence is the whole point. The previous engine, @imgly/background-removal,
 * wrapped this same family of model in AGPL-3.0 code — copyleft that reaches the
 * app that ships it, which is incompatible with selling B2B and on-premise
 * licences. The model was never the problem. The wrapper was.
 *
 * Do NOT swap this for an RMBG checkpoint (BRIA). Those are the easiest to find
 * ready-made and they are licensed for non-commercial use only.
 */
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const URL_ =
  'https://huggingface.co/SacredNoir/isnet-general-use-onnx/resolve/main/isnet-general-use-q8.onnx?download=true';

const OUT = resolve('public/model/isnet-q8.onnx');
const MIN_BYTES = 40_000_000; // a truncated download is worse than none: fail loud.

if (existsSync(OUT) && statSync(OUT).size > MIN_BYTES) {
  console.log(`model: already present (${(statSync(OUT).size / 1048576).toFixed(1)} MB)`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
console.log('model: downloading isnet-general-use-q8.onnx (~42 MB, once)…');

const response = await fetch(URL_);
if (!response.ok || !response.body) {
  console.error(`model: download failed — HTTP ${response.status}`);
  process.exit(1);
}

await pipeline(Readable.fromWeb(response.body), createWriteStream(OUT));

const size = statSync(OUT).size;
if (size < MIN_BYTES) {
  unlinkSync(OUT); // never leave a half-written model behind for the app to trip over
  console.error(`model: download truncated (${size} bytes) — removed`);
  process.exit(1);
}

console.log(`model: ready (${(size / 1048576).toFixed(1)} MB) → public/model/isnet-q8.onnx`);
