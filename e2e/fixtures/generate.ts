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
/** Portrait, and a different name — the images-to-PDF spec needs two distinguishable pages. */
export const PHOTO_TALL = join(DIR, 'photo-tall.png');
/**
 * The same picture carrying tEXt and tIME chunks.
 *
 * remove-exif has nothing to show for a clean file, and "no metadata found" is
 * the one outcome that would pass whether the parser works or not. The named
 * chunks are what the findings list is asserted against.
 */
export const PHOTO_META = join(DIR, 'photo-meta.png');
export const NOT_AN_IMAGE = join(DIR, 'notes.txt');

/** Two text PDFs, two pages each — the merge spec needs distinguishable sources. */
export const DOC_A = join(DIR, 'doc-a.pdf');
export const DOC_B = join(DIR, 'doc-b.pdf');
/**
 * Seis páginas numeradas, para as ferramentas cujo comportamento só aparece com
 * mais de duas: dividir em blocos de tamanho fixo, reordenar e apagar página no
 * organizar, e a exportação em zip do PDF para imagens. Com um documento de duas
 * páginas, "dividir a cada 2" e "dividir tudo" produzem o mesmo arquivo, e o
 * teste passaria sem distinguir os dois modos.
 */
export const DOC_LONG = join(DIR, 'doc-long.pdf');
/** Same reason as PHOTO_META: clean-pdf-metadata needs a document that has some. */
export const DOC_META = join(DIR, 'doc-meta.pdf');
/** One page of full-bleed photographic raster: the case compression actually helps. */
export const SCAN = join(DIR, 'scan.pdf');
/** Four seconds of real stereo PCM for the audio cutter. */
export const CLIP = join(DIR, 'clip.wav');
/** A second, shorter and mono — the merge spec needs two distinguishable tracks,
 *  and mono-next-to-stereo is the case the merger has to widen. */
export const CLIP_B = join(DIR, 'clip-b.wav');

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
function makePng(width: number, height: number, metadata = false): Buffer {
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

  // tEXt is `keyword \0 text`, latin1, with no terminator — the parser splits on
  // the first NUL and shows the keyword as the field label.
  const text = (keyword: string, value: string) =>
    chunk('tEXt', Buffer.from(`${keyword}\0${value}`, 'latin1'));

  const tIME = Buffer.alloc(7);
  tIME.writeUInt16BE(2019, 0);
  tIME.set([3, 14, 9, 26, 53], 2); // month, day, hour, minute, second

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...(metadata
      ? [
          text('Author', 'Fulano de Tal'),
          text('Software', 'Camera Fixture 1.0'),
          chunk('tIME', tIME),
        ]
      : []),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Minimal PDF writer — the same bargain as the PNG encoder above: a few dozen
 * lines beats committing binaries or taking on a fixture dependency.
 *
 * Objects are laid out in order and the xref table is built from the byte offset
 * each one landed at. That table is the part a reader actually validates, so the
 * offsets have to be real; everything is written latin1 so one character is one
 * byte and `length` can be used as an offset.
 */
interface PdfPageSpec {
  width: number;
  height: number;
  text: string;
  /** Full-bleed image, as raw RGB. Deflated into a DCT-free image XObject. */
  image?: { width: number; height: number; rgb: Buffer };
}

interface PdfMetaSpec {
  readonly title: string;
  readonly author: string;
  readonly producer: string;
}

function makePdf(pages: PdfPageSpec[], meta?: PdfMetaSpec): Buffer {
  const objects: (string | Buffer)[] = [];
  let nextId = 4; // 1 catalog, 2 page tree, 3 font

  const entries: { pageId: number }[] = [];

  for (const page of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    const imageId = page.image ? nextId++ : 0;

    const draw = page.image ? `q ${page.width} 0 0 ${page.height} 0 0 cm /Im0 Do Q\n` : '';
    const stream = `${draw}BT /F1 24 Tf 40 ${page.height - 60} Td (${page.text}) Tj ET`;

    const xobject = page.image ? `/XObject << /Im0 ${imageId} 0 R >> ` : '';
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] ` +
      `/Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> ${xobject}>> >>`;

    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

    if (page.image) {
      const data = deflateSync(page.image.rgb, { level: 6 });
      objects[imageId] = Buffer.concat([
        Buffer.from(
          `<< /Type /XObject /Subtype /Image /Width ${page.image.width} ` +
            `/Height ${page.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
            `/Filter /FlateDecode /Length ${data.length} >>\nstream\n`,
          'latin1',
        ),
        data,
        Buffer.from('\nendstream', 'latin1'),
      ]);
    }

    entries.push({ pageId });
  }

  // The Info dictionary and the XMP packet are separate objects reached from
  // separate places — the trailer and the catalog — which is exactly why
  // clean-pdf-metadata has to delete both. A fixture carrying only one of them
  // would let a half-done clean pass.
  let infoId = 0;
  let xmpId = 0;

  if (meta) {
    infoId = nextId++;
    xmpId = nextId++;

    objects[infoId] =
      `<< /Title (${meta.title}) /Author (${meta.author}) /Producer (${meta.producer}) ` +
      `/Creator (${meta.producer}) /CreationDate (D:20190314092653Z) /ModDate (D:20190314092653Z) >>`;

    const xmp =
      `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
      `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ` +
      `xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
      `<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">` +
      `<dc:creator><rdf:Seq><rdf:li>${meta.author}</rdf:li></rdf:Seq></dc:creator>` +
      `</rdf:Description></rdf:RDF></x:xmpmeta>\n<?xpacket end="w"?>`;

    objects[xmpId] =
      `<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream`;
  }

  objects[1] = meta
    ? `<< /Type /Catalog /Pages 2 0 R /Metadata ${xmpId} 0 R >>`
    : '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] =
    `<< /Type /Pages /Kids [${entries.map((e) => `${e.pageId} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [];
  let offset = chunks[0].length;

  for (let id = 1; id < nextId; id++) {
    const body = objects[id];
    const buf = Buffer.concat([
      Buffer.from(`${id} 0 obj\n`, 'latin1'),
      typeof body === 'string' ? Buffer.from(body, 'latin1') : body,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);

    offsets[id] = offset;
    offset += buf.length;
    chunks.push(buf);
  }

  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  const trailer = meta ? `<< /Size ${nextId} /Root 1 0 R /Info ${infoId} 0 R >>` : `<< /Size ${nextId} /Root 1 0 R >>`;
  xref += `trailer\n${trailer}\nstartxref\n${offset}\n%%EOF\n`;

  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

/**
 * Raw RGB with a smooth base and fine grain.
 *
 * The grain is load-bearing for the same reason it is in the PNG above, only
 * inverted: it is what stops Flate from crushing the page, so the source PDF is
 * genuinely heavy and re-encoding it as JPEG is genuinely a win. A flat or
 * gradient-only page deflates to almost nothing, the compressor would correctly
 * report that it cannot improve on it, and the spec would be testing the
 * fixture rather than the tool.
 */
function makeRgb(width: number, height: number): Buffer {
  const rgb = Buffer.alloc(width * height * 3);

  let seed = 987;
  const noise = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return ((seed >>> 9) % 27) - 13;
  };

  const clamp = (v: number) => Math.min(255, Math.max(0, v));

  let p = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const grain = noise();
      rgb[p++] = clamp(120 + (x / width) * 110 + grain);
      rgb[p++] = clamp(90 + (y / height) * 130 + grain);
      rgb[p++] = clamp(200 - ((x + y) / (width + height)) * 120 + grain);
    }
  }

  return rgb;
}

/**
 * A real WAV, because `decodeAudioData` is the gate the cut-audio tool opens on
 * and it rejects anything malformed outright.
 *
 * WAV rather than MP3 for the same reason the images above are hand-encoded:
 * there is no encoder to depend on and no binary to commit. It is deliberately
 * NOT a constant tone — the level steps between blocks and drops to silence in
 * the middle, so the waveform has a shape a human watching the headed run can
 * check the selection against.
 */
function makeWav(seconds: number, sampleRate = 44100, channels = 2): Buffer {
  const frames = Math.round(seconds * sampleRate);
  const bytesPerFrame = channels * 2;
  const buf = Buffer.alloc(44 + frames * bytesPerFrame);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + frames * bytesPerFrame, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerFrame, 28);
  buf.writeUInt16LE(bytesPerFrame, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(frames * bytesPerFrame, 40);

  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    const level = t < 1 ? 0.9 : t < 1.8 ? 0.25 : t < 2.2 ? 0 : t < 3.2 ? 0.7 : 0.4;
    const hz = t < 2.2 ? 440 : 660;
    const sample = Math.sin(2 * Math.PI * hz * t) * level;

    for (let ch = 0; ch < channels; ch++) {
      const value = sample * (ch === 0 ? 1 : 0.8);
      buf.writeInt16LE(Math.round(value < 0 ? value * 0x8000 : value * 0x7fff), 44 + i * bytesPerFrame + ch * 2);
    }
  }

  return buf;
}

export default function globalSetup(): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(PHOTO, makePng(800, 600));
  writeFileSync(PHOTO_TALL, makePng(400, 700));
  writeFileSync(PHOTO_META, makePng(600, 450, true));
  writeFileSync(NOT_AN_IMAGE, 'definitely not a PNG\n');
  writeFileSync(CLIP, makeWav(4));
  writeFileSync(CLIP_B, makeWav(3, 44100, 1));

  writeFileSync(
    DOC_A,
    makePdf([
      { width: 420, height: 595, text: 'Documento A - pagina 1' },
      { width: 420, height: 595, text: 'Documento A - pagina 2' },
    ]),
  );

  writeFileSync(
    DOC_B,
    makePdf([
      { width: 420, height: 595, text: 'Documento B - pagina 1' },
      { width: 420, height: 595, text: 'Documento B - pagina 2' },
    ]),
  );

  writeFileSync(
    DOC_LONG,
    makePdf(
      Array.from({ length: 6 }, (_, i) => ({
        width: 420,
        height: 595,
        text: `Pagina ${i + 1} de 6`,
      })),
    ),
  );

  writeFileSync(
    DOC_META,
    makePdf(
      [{ width: 420, height: 595, text: 'Documento com metadados' }],
      { title: 'Contrato Confidencial', author: 'Fulano de Tal', producer: 'Fixture Writer 1.0' },
    ),
  );

  // A small page carrying a much larger raster, which is the real shape of a
  // phone photo on a document page: rasterizing at 150 DPI DOWNSAMPLES it, and
  // that is where the saving comes from. An image smaller than the render target
  // would be upsampled and the "compressed" file would legitimately be bigger.
  writeFileSync(
    SCAN,
    makePdf([
      {
        width: 300,
        height: 420,
        text: 'Digitalizacao',
        image: { width: 1000, height: 1400, rgb: makeRgb(1000, 1400) },
      },
    ]),
  );
}
