import { TestBed } from '@angular/core/testing';
import { closePdf, openPdf } from '../../../../core/pdf/pdfjs';
import { makeRegion } from '../../../../core/geometry/region';
import { PdfRedactorService } from './pdf-redactor.service';

/**
 * The first test here is the one that proves the product claim. Everything else
 * is scaffolding around it.
 */

const SECRET = 'CPF 123.456.789-00';

async function makePdf(pages = 1): Promise<File> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([400, 300]);
    page.drawText(`${SECRET} page ${i + 1}`, { x: 40, y: 200, size: 14, font });
  }

  return new File([await doc.save()], 'doc.pdf', { type: 'application/pdf' });
}

async function extractAllText(blob: Blob): Promise<string> {
  const file = new File([blob], 'out.pdf', { type: 'application/pdf' });
  const doc = await openPdf(file);
  try {
    let all = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      all += content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    }
    return all;
  } finally {
    await closePdf(doc);
  }
}

describe('PdfRedactorService', () => {
  let service: PdfRedactorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfRedactorService);
  });

  it('DESTROYS the text: nothing is extractable from the output', async () => {
    const file = await makePdf();
    expect(await extractAllText(file)).toContain('CPF');

    const result = await service.redact({
      file,
      regions: [makeRegion({ xPct: 5, yPct: 25, wPct: 70, hPct: 15 }, 'black', 1)],
    });

    // Not "the box covers it" — the text objects are gone from the file, so a
    // copy-paste, a text extractor and `strings` all come back empty.
    const text = await extractAllText(result.blob);
    expect(text).not.toContain('CPF');
    expect(text.trim()).toBe('');
  }, 30000);

  it('preserves the page count and the page size in points', async () => {
    const result = await service.redact({
      file: await makePdf(3),
      regions: [makeRegion({ xPct: 10, yPct: 10, wPct: 20, hPct: 10 }, 'black', 2)],
    });

    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(new Uint8Array(await result.blob.arrayBuffer()));
    expect(doc.getPageCount()).toBe(3);

    const size = doc.getPage(0).getSize();
    expect(Math.round(size.width)).toBe(400);
    expect(Math.round(size.height)).toBe(300);
    expect(result.pagesRasterized).toBe(3);
  }, 30000);

  it('rasterizes every page, so text on unredacted pages goes too', async () => {
    // A consequence worth pinning rather than discovering later: redaction costs
    // the WHOLE document its text layer, which is why the panel says so.
    const result = await service.redact({
      file: await makePdf(2),
      regions: [makeRegion({ xPct: 10, yPct: 10, wPct: 20, hPct: 10 }, 'black', 1)],
    });
    expect((await extractAllText(result.blob)).trim()).toBe('');
  }, 30000);

  it('refuses when nothing was marked', async () => {
    await expectAsync(service.redact({ file: await makePdf(), regions: [] })).toBeRejected();
  });

  it('names the output after the input', async () => {
    const result = await service.redact({
      file: await makePdf(),
      regions: [makeRegion({ xPct: 5, yPct: 5, wPct: 30, hPct: 20 }, 'black', 1)],
    });
    expect(result.filename).toBe('doc-redacted.pdf');
  }, 30000);
});
