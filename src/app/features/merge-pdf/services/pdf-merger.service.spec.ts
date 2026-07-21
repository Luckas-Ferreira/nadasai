import { TestBed } from '@angular/core/testing';
import { PdfMergerService, type MergeSource } from './pdf-merger.service';

/**
 * Builds a real PDF whose pages have distinct widths, so a page can be
 * identified by its size after the merge. Asserting on a page COUNT would pass
 * even if the order were reversed, which is the whole thing this tool sells.
 */
async function makePdf(name: string, widths: number[], rotation = 0): Promise<File> {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const doc = await PDFDocument.create();

  for (const width of widths) {
    const page = doc.addPage([width, 100]);
    if (rotation) page.setRotation(degrees(rotation));
  }

  return new File([await doc.save() as BlobPart], name, { type: 'application/pdf' });
}

async function readPages(blob: Blob): Promise<{ width: number; rotation: number }[]> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(await blob.arrayBuffer());

  return doc.getPages().map((page) => ({
    // A rotated page reports its box unrotated, so width still identifies it.
    width: Math.round(page.getSize().width),
    rotation: page.getRotation().angle,
  }));
}

describe('PdfMergerService', () => {
  let merger: PdfMergerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    merger = TestBed.inject(PdfMergerService);
  });

  it('emits pages in the arranged order, not the order the files arrived in', async () => {
    const a = await makePdf('a.pdf', [210, 220]);
    const b = await makePdf('b.pdf', [310, 320]);

    // Deliberately interleaved and out of document order.
    const sources: MergeSource[] = [
      { file: b, pageIndex: 1, rotation: 0 },
      { file: a, pageIndex: 0, rotation: 0 },
      { file: b, pageIndex: 0, rotation: 0 },
      { file: a, pageIndex: 1, rotation: 0 },
    ];

    const pages = await readPages(await merger.merge(sources));

    expect(pages.map((p) => p.width)).toEqual([320, 210, 310, 220]);
  });

  it('drops the pages the user removed', async () => {
    const a = await makePdf('a.pdf', [210, 220, 230]);

    const pages = await readPages(
      await merger.merge([
        { file: a, pageIndex: 0, rotation: 0 },
        { file: a, pageIndex: 2, rotation: 0 },
      ]),
    );

    expect(pages.map((p) => p.width)).toEqual([210, 230]);
  });

  it('ADDS the requested rotation to the one the page already carried', async () => {
    // A scan that arrives sideways and is turned once more must land at 180.
    // Overwriting instead of composing would silently undo the source's own
    // orientation and leave it at 90.
    const sideways = await makePdf('scan.pdf', [210], 90);

    const [page] = await readPages(await merger.merge([{ file: sideways, pageIndex: 0, rotation: 90 }]));

    expect(page.rotation).toBe(180);
  });

  it('wraps rotation back around instead of producing 360', async () => {
    const sideways = await makePdf('scan.pdf', [210], 270);

    const [page] = await readPages(await merger.merge([{ file: sideways, pageIndex: 0, rotation: 90 }]));

    expect(page.rotation).toBe(0);
  });

  it('reports progress once per source FILE, not once per page', async () => {
    const a = await makePdf('a.pdf', [210, 220, 230]);
    const b = await makePdf('b.pdf', [310]);

    const seen: [number, number][] = [];
    await merger.merge(
      [
        { file: a, pageIndex: 0, rotation: 0 },
        { file: a, pageIndex: 1, rotation: 0 },
        { file: a, pageIndex: 2, rotation: 0 },
        { file: b, pageIndex: 0, rotation: 0 },
      ],
      (done, total) => seen.push([done, total]),
    );

    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('refuses an empty page list rather than emitting a zero-page PDF', async () => {
    await expectAsync(merger.merge([])).toBeRejected();
  });
});
