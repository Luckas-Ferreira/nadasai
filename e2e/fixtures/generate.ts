import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The tools need a real decodable image and a real non-image to exercise the
 * rejection path. Generating them keeps binaries out of the repo — a hand-rolled
 * PNG encoder is cheaper than a fixture dependency.
 */

const DIR = join(__dirname, 'assets');
export const PHOTO = join(DIR, 'photo.png');
export const NOT_AN_IMAGE = join(DIR, 'notes.txt');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * RGBA PNG: a warm subject blob on a blue field, plus grain.
 *
 * The grain is load-bearing. A flat synthetic image compresses better as
 * lossless PNG than as lossy WebP, so `compressImage` legitimately produces a
 * BIGGER file and the savings badge never renders — the fixture, not the app,
 * would be failing the test. Photographic noise is what the tool is tuned for.
 */
function makePng(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let p = 0;

  // Deterministic LCG: the same fixture every run, no Math.random flake.
  let seed = 12345;
  const noise = (spread: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return ((seed >>> 8) % (spread * 2 + 1)) - spread;
  };

  const clamp = (v: number) => Math.min(255, Math.max(0, v));

  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const inSubject = (dx * dx) / (width * 0.16) ** 2 + (dy * dy) / (height * 0.3) ** 2 < 1;

      if (inSubject) {
        raw[p++] = clamp(226 + noise(20));
        raw[p++] = clamp(142 + ((y * 3) % 40) + noise(20));
        raw[p++] = clamp(96 + noise(20));
      } else {
        raw[p++] = clamp(40 + ((x * 5) % 30) + noise(24));
        raw[p++] = clamp(90 + noise(24));
        raw[p++] = clamp(170 + ((y * 4) % 50) + noise(24));
      }
      raw[p++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export default function globalSetup(): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(PHOTO, makePng(800, 600));
  writeFileSync(NOT_AN_IMAGE, 'definitely not a PNG\n');
}
