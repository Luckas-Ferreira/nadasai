/**
 * Downloads the background-removal model into public/model/, split into chunks.
 *
 * The weights are not committed: 42 MB has no business in git history, and it
 * would be re-downloaded on every clone anyway. This runs on postinstall and is
 * a no-op once the files are on disk, so `npm ci && npm run build` on a fresh CI
 * box or a static host produces a complete deploy.
 *
 * WHY SPLIT: Cloudflare Pages rejects any single asset over 25 MiB, and the
 * model is 42 MB. So the download is sliced into ~22 MiB parts alongside a
 * manifest (isnet-q8.manifest.json). The app fetches the manifest, then each
 * part, and concatenates them back into the original bytes before handing them
 * to onnxruntime — same-origin, offline-cacheable, no third-party at runtime.
 * Reassembly is exact: byte-for-byte concatenation, no re-encoding.
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
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const URL_ =
  'https://huggingface.co/SacredNoir/isnet-general-use-onnx/resolve/main/isnet-general-use-q8.onnx?download=true';

const OUT_DIR = resolve('public/model');
const MANIFEST = join(OUT_DIR, 'isnet-q8.manifest.json');
const PART_PREFIX = 'isnet-q8.onnx.part';
// 22 MiB keeps every part safely under Cloudflare Pages' 25 MiB per-file cap.
const CHUNK = 22 * 1024 * 1024;
const MIN_BYTES = 40_000_000; // a truncated download is worse than none: fail loud.

/** Sum of the parts named in a manifest, or -1 if any is missing. */
function presentBytes(parts) {
  let total = 0;
  for (const name of parts) {
    const p = join(OUT_DIR, name);
    if (!existsSync(p)) return -1;
    total += statSync(p).size;
  }
  return total;
}

if (existsSync(MANIFEST)) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const total = presentBytes(manifest.parts);
  if (total > MIN_BYTES) {
    console.log(`model: already present (${(total / 1048576).toFixed(1)} MB, ${manifest.parts.length} parts)`);
    process.exit(0);
  }
}

mkdirSync(OUT_DIR, { recursive: true });
console.log('model: downloading isnet-general-use-q8.onnx (~42 MB, once)…');

const response = await fetch(URL_);
if (!response.ok || !response.body) {
  console.error(`model: download failed — HTTP ${response.status}`);
  process.exit(1);
}

const bytes = new Uint8Array(await response.arrayBuffer());
if (bytes.byteLength < MIN_BYTES) {
  console.error(`model: download truncated (${bytes.byteLength} bytes)`);
  process.exit(1);
}

// Clear any previous split (or a stale single-file model) before writing a fresh one.
for (const name of readdirSync(OUT_DIR)) {
  if (name.startsWith('isnet-q8.onnx') || name === 'isnet-q8.manifest.json') rmSync(join(OUT_DIR, name));
}

const parts = [];
for (let offset = 0, i = 0; offset < bytes.byteLength; offset += CHUNK, i++) {
  const name = `${PART_PREFIX}${i}`;
  writeFileSync(join(OUT_DIR, name), bytes.subarray(offset, offset + CHUNK));
  parts.push(name);
}

writeFileSync(MANIFEST, JSON.stringify({ bytes: bytes.byteLength, parts }, null, 2));
console.log(
  `model: ready (${(bytes.byteLength / 1048576).toFixed(1)} MB → ${parts.length} parts, each ≤ ${CHUNK / 1048576} MiB) → public/model/`,
);
