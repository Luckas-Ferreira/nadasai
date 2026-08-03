import { TestBed } from '@angular/core/testing';
import { PdfMetadataService } from './pdf-metadata.service';

/**
 * The decisive assertion in here is the one that greps the RAW OUTPUT BYTES for
 * the original author's name. Checking that the getters return undefined passes
 * happily while the data is still sitting in the file as an orphaned object —
 * which is exactly what happens if you delete the catalog entry and forget
 * `context.delete(ref)`.
 */

const AUTHOR = 'Fulano De Tal Sobrenome';
const TITLE = 'Contrato Confidencial 2026';

async function makePdf(): Promise<File> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  page.drawText('hello', { x: 20, y: 100 });

  doc.setAuthor(AUTHOR);
  doc.setTitle(TITLE);
  doc.setSubject('Assunto sensível');
  doc.setKeywords(['confidencial']);
  doc.setProducer('SomeProducer 9');
  doc.setCreator('SomeCreator 9');

  // Written WITHOUT object streams so the strings are visible as raw bytes —
  // otherwise the "is it still in the file?" check cannot tell deletion apart
  // from Flate compression.
  const bytes = await doc.save({ useObjectStreams: false });
  return new File([bytes], 'doc.pdf', { type: 'application/pdf' });
}

/**
 * Re-saves without object streams, so anything still registered in the object
 * graph shows up as plain bytes. Without this, a surviving orphan would simply
 * be compressed and the grep would pass while the data was still there.
 */
async function decompressed(blob: Blob): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.load(new Uint8Array(await blob.arrayBuffer()), {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  return doc.save({ useObjectStreams: false });
}

/**
 * pdf-lib stores Info strings as PDFHexString: UTF-16BE with a BOM, written out
 * as hex digits. Searching for the plain text finds nothing even when the name
 * is very much still in the file, so the check has to look for both forms.
 */
function asPdfHex(text: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < text.length; i++) {
    hex += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  }
  return hex;
}

function bytesContain(bytes: Uint8Array, needle: string): boolean {
  const haystack = new TextDecoder('latin1').decode(bytes);
  return haystack.includes(needle) || haystack.includes(asPdfHex(needle));
}

describe('PdfMetadataService', () => {
  let service: PdfMetadataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfMetadataService);
  });

  it('reads the Info dictionary', async () => {
    const report = await service.read(await makePdf());
    expect(report.info.author).toBe(AUTHOR);
    expect(report.info.title).toBe(TITLE);
    expect(report.info.producer).toBe('SomeProducer 9');
    expect(report.infoKeyCount).toBeGreaterThan(0);
    expect(report.pageCount).toBe(1);
  });

  it('removes every Info field', async () => {
    const outcome = await service.clean({
      file: await makePdf(),
      removeInfo: true,
      removeXmp: true,
      removePageMetadata: true,
      removeAttachments: true,
    });

    const cleaned = new File([outcome.blob], 'clean.pdf', { type: 'application/pdf' });
    const report = await service.read(cleaned);

    expect(report.info.author).toBeUndefined();
    expect(report.info.title).toBeUndefined();
    expect(report.info.subject).toBeUndefined();
    expect(report.info.producer).toBeUndefined();
    expect(report.infoKeyCount).toBe(0);
  });

  it('leaves no trace of the author in the raw bytes', async () => {
    const before = await makePdf();
    expect(bytesContain(new Uint8Array(await before.arrayBuffer()), AUTHOR)).toBe(true);

    const outcome = await service.clean({
      file: before,
      removeInfo: true,
      removeXmp: true,
      removePageMetadata: true,
      removeAttachments: true,
    });

    const after = await decompressed(outcome.blob);
    expect(bytesContain(after, AUTHOR)).toBe(false);
    expect(bytesContain(after, TITLE)).toBe(false);
  });

  it('does NOT stamp pdf-lib as the producer', async () => {
    // load() defaults to updateMetadata: true, which would rewrite Producer and
    // ModDate on the way in. A metadata cleaner that fingerprints its own
    // output is worse than useless.
    const outcome = await service.clean({
      file: await makePdf(),
      removeInfo: true,
      removeXmp: true,
      removePageMetadata: false,
      removeAttachments: false,
    });

    const after = await decompressed(outcome.blob);
    expect(bytesContain(after, 'pdf-lib')).toBe(false);

    const report = await service.read(new File([outcome.blob], 'c.pdf', { type: 'application/pdf' }));
    expect(report.info.producer).toBeUndefined();
    expect(report.info.modDate).toBeUndefined();
  });

  it('keeps the pages intact', async () => {
    const outcome = await service.clean({
      file: await makePdf(),
      removeInfo: true,
      removeXmp: true,
      removePageMetadata: true,
      removeAttachments: true,
    });

    const report = await service.read(new File([outcome.blob], 'c.pdf', { type: 'application/pdf' }));
    expect(report.pageCount).toBe(1);
  });

  it('names the file after the original', async () => {
    const outcome = await service.clean({
      file: await makePdf(),
      removeInfo: true,
      removeXmp: false,
      removePageMetadata: false,
      removeAttachments: false,
    });
    expect(outcome.filename).toBe('doc-clean.pdf');
    expect(outcome.removed).toContain('Info');
  });

  it('rejects a non-PDF', async () => {
    const notPdf = new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' });
    await expectAsync(service.read(notPdf)).toBeRejected();
  });
});
