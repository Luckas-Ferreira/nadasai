import { TestBed } from '@angular/core/testing';
import { AppError } from '../../../../core/errors';
import { crc32 } from '../../../../core/exif/png-chunks';
import { MetadataStripperService } from './metadata-stripper.service';

/**
 * The lossless-strip proof lives in core/exif/strip.spec.ts. This layer is where
 * the FILE identity is decided — name, extension and type — and that is what got
 * it wrong before: the canvas path it replaced re-encoded PNG and WebP as JPEG
 * while keeping the original extension.
 */

function textChunk(keyword: string, value: string): Uint8Array {
  const payload = new TextEncoder().encode(`${keyword}\0${value}`);
  const body = new Uint8Array(4 + payload.length);
  body.set(new TextEncoder().encode('tEXt'), 0);
  body.set(payload, 4);

  const out = new Uint8Array(12 + payload.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, payload.length);
  out.set(body, 4);
  view.setUint32(8 + payload.length, crc32(body));
  return out;
}

/** A real PNG from the canvas, with a tEXt chunk spliced in after the IHDR. */
async function makePngWithText(name = 'foto.png'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 24;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3366aa';
  ctx.fillRect(0, 0, 32, 24);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  const bytes = new Uint8Array(await blob!.arrayBuffer());

  // Signature(8) + IHDR(25) — the only fixed-size prefix a PNG is guaranteed.
  const at = 8 + 25;
  const chunk = textChunk('Author', 'Fulano de Tal');
  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(bytes.subarray(at), at + chunk.length);

  return new File([out], name, { type: 'image/png' });
}

describe('MetadataStripperService', () => {
  let service: MetadataStripperService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MetadataStripperService);
  });

  it('reports what is there, then reports nothing left', async () => {
    const file = await makePngWithText();

    const { report, fileBytes } = await service.inspect(file);
    expect(report.format).toBe('png');
    expect(report.textChunks.map((c) => c.keyword)).toContain('Author');
    expect(fileBytes).toBe(file.size);

    const outcome = await service.strip(file);

    // `after` is read back off the OUTPUT, so "nothing left" is observed rather
    // than asserted by the code that did the removing.
    expect(outcome.after.textChunks).toEqual([]);
    expect(outcome.after.totalMetadataBytes).toBe(0);
    expect(outcome.removedBytes).toBeGreaterThan(0);
    expect(outcome.blob.size).toBe(file.size - outcome.removedBytes);
  });

  it('keeps the format and the extension, because nothing is transcoded', async () => {
    const outcome = await service.strip(await makePngWithText('minha foto.png'));

    expect(outcome.filename).toBe('minha foto-noexif.png');
    expect(outcome.blob.type).toBe('image/png');

    const head = new Uint8Array(await outcome.blob.slice(0, 8).arrayBuffer());
    expect(Array.from(head)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('refuses a format it cannot strip losslessly', async () => {
    const notAnImage = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'notas.tiff', { type: 'image/tiff' });

    await expectAsync(service.inspect(notAnImage)).toBeRejectedWith(
      jasmine.objectContaining({ code: 'exif_unsupported' } as Partial<AppError>),
    );
  });

  it('is a no-op on a file that carries nothing, rather than a rewrite', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    const clean = new File([blob!], 'limpa.png', { type: 'image/png' });

    const outcome = await service.strip(clean);
    expect(outcome.removedBytes).toBe(0);
    expect(new Uint8Array(await outcome.blob.arrayBuffer())).toEqual(new Uint8Array(await clean.arrayBuffer()));
  });
});
