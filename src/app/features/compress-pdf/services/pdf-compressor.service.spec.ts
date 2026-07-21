import { TestBed } from '@angular/core/testing';
import { PdfCompressorService } from './pdf-compressor.service';

/**
 * A page of vector text. Tiny already, and the worst possible candidate for
 * rasterization — which is exactly why it is the fixture for the guard below.
 */
async function makeTextPdf(pages = 1): Promise<File> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Página ${i + 1} — teste`, { x: 40, y: 340, size: 14, font });
  }

  return new File([await doc.save() as BlobPart], 'texto.pdf', { type: 'application/pdf' });
}

/**
 * A page carrying a big raster: the case compression actually helps.
 *
 * Three properties make this behave like the real thing, and all three matter:
 *
 * - A SMOOTH base. Uniform random noise across the whole page is maximum-entropy
 *   content that no photograph contains, and JPEG cannot compress it either —
 *   the result comes out as large as the source and the test measures nothing.
 * - FINE GRAIN on top of it. Per-pixel jitter is what stops PNG from crushing
 *   the gradient into a few kB, and it is exactly what JPEG's quantiser throws
 *   away. That asymmetry IS the compression this service sells.
 * - Far more pixels than the page has points. This is the case people actually
 *   bring: a phone photo dropped onto an A4. Rasterizing at 150 DPI downsamples
 *   it, which is where most of the saving comes from. A fixture smaller than the
 *   render target would be upsampled instead, and the JPEG would legitimately
 *   come out bigger.
 */
async function makePhotoPdf(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 1800;
  canvas.height = 2400;

  const ctx = canvas.getContext('2d')!;

  // Seeded LCG, so the fixture is byte-identical on every run — a random one
  // would make a size assertion flaky by construction.
  let seed = 1;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const grain = (next() - 0.5) * 26;

      image.data[i] = 120 + (x / canvas.width) * 110 + grain;
      image.data[i + 1] = 90 + (y / canvas.height) * 130 + grain;
      image.data[i + 2] = 200 - ((x + y) / (canvas.width + canvas.height)) * 120 + grain;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const png = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));

  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const embedded = await doc.embedPng(await png.arrayBuffer());
  const page = doc.addPage([600, 800]);
  page.drawImage(embedded, { x: 0, y: 0, width: 600, height: 800 });

  return new File([await doc.save() as BlobPart], 'foto.pdf', { type: 'application/pdf' });
}

async function pageCount(blob: Blob): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  return (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();
}

describe('PdfCompressorService', () => {
  let compressor: PdfCompressorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    compressor = TestBed.inject(PdfCompressorService);
  });

  it('keeps the ORIGINAL when compressing would make the file bigger', async () => {
    // A page of vector text becomes a photograph of itself. Handing that back as
    // a "compressed" file is the one failure nobody forgives, so the service
    // must notice and refuse.
    const file = await makeTextPdf();

    const result = await compressor.compress(file, 'strong');

    expect(result.keptOriginal).toBeTrue();
    expect(result.blob.size).toBe(file.size);
  });

  it('actually shrinks a raster-heavy PDF', async () => {
    const file = await makePhotoPdf();

    const result = await compressor.compress(file, 'balanced');

    expect(result.keptOriginal).toBeFalse();
    expect(result.blob.size).toBeLessThan(file.size);
  }, 30_000);

  it('preserves the page count when it rasterizes', async () => {
    const file = await makePhotoPdf();

    const result = await compressor.compress(file, 'strong');

    expect(await pageCount(result.blob)).toBe(1);
  }, 30_000);

  it('gets smaller as the level gets stronger', async () => {
    const file = await makePhotoPdf();

    const light = await compressor.compress(file, 'light');
    const strong = await compressor.compress(file, 'strong');

    expect(strong.blob.size).toBeLessThan(light.blob.size);
  }, 45_000);

  it('lossless returns a readable PDF with every page intact', async () => {
    const file = await makeTextPdf(3);

    const result = await compressor.compress(file, 'lossless');

    // It may or may not beat the original — pdf-lib already writes tight files,
    // and when it does not, the guard hands the original back. Either way the
    // user must end up with all three pages.
    expect(await pageCount(result.blob)).toBe(3);
  });

  it('reports progress once per page', async () => {
    const file = await makeTextPdf(2);

    const seen: [number, number][] = [];
    await compressor.compress(file, 'strong', (done, total) => seen.push([done, total]));

    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
  }, 30_000);

  it('rejects a file that is not a PDF', async () => {
    const notPdf = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    await expectAsync(compressor.compress(notPdf, 'balanced')).toBeRejected();
  });
});
