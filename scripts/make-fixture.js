/**
 * Generates cypress/fixtures/sample.png — a 1200x800 RGBA image with a gradient,
 * some shapes and a transparent corner, so the checkerboard, the JPEG/PDF
 * flatten paths and the compare slider all get exercised by something realistic.
 *
 * Hand-rolled PNG encoder: no image libraries in this project.
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const W = 1200;
const H = 800;

const raw = Buffer.alloc(H * (1 + W * 4));

for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4);
  raw[rowStart] = 0; // filter type: none

  for (let x = 0; x < W; x++) {
    const i = rowStart + 1 + x * 4;

    // Diagonal gradient.
    const t = (x / W) * 0.6 + (y / H) * 0.4;
    let r = Math.round(30 + t * 200);
    let g = Math.round(90 + Math.sin(t * Math.PI) * 120);
    let b = Math.round(220 - t * 140);
    let a = 255;

    // A bright circle, so there is a clear subject.
    const dx = x - W * 0.38;
    const dy = y - H * 0.5;
    if (dx * dx + dy * dy < 210 * 210) {
      r = 250;
      g = 210;
      b = 70;
    }

    // A dark bar, to make crop/resize changes obvious.
    if (y > H * 0.78 && y < H * 0.88) {
      r = 20;
      g = 24;
      b = 32;
    }

    // Transparent top-right corner.
    if (x > W * 0.78 && y < H * 0.22) {
      a = 0;
    }

    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
    raw[i + 3] = a;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);

  return Buffer.concat([len, body, crc]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c;
    }
  }

  let c = 0xffffffff;
  for (const byte of buf) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'cypress', 'fixtures', 'sample.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);

console.log(`wrote ${out} (${(png.length / 1024).toFixed(0)} KB, ${W}x${H})`);
