import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';

/** One page of some source PDF, in the order the user arranged it. */
export interface MergeSource {
  readonly file: File;
  /** 0-based index into `file`'s own pages. */
  readonly pageIndex: number;
  /** Extra clockwise rotation the user asked for: 0, 90, 180 or 270. */
  readonly rotation: number;
}

/**
 * Builds one PDF out of pages taken from several source PDFs.
 *
 * pdf-lib is imported dynamically. The PDF editor already does this and it is
 * the same reasoning as jspdf in `core/image/converters.ts`: it is a large
 * dependency and nobody who came to crop an image should pay for it.
 */
@Injectable({ providedIn: 'root' })
export class PdfMergerService {
  async merge(
    sources: readonly MergeSource[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Blob> {
    if (!sources.length) throw new AppError('pdf_export_failed');

    const { PDFDocument, degrees } = await import('pdf-lib');
    const out = await PDFDocument.create();

    /**
     * Copy per SOURCE FILE, not per page.
     *
     * `copyPages` walks the page's resource tree and clones what it references.
     * Called once per page, a 40-page document copies its shared fonts and
     * colour profiles forty times over, and the merged file comes out larger
     * than the sum of its inputs. Called once with every index that file
     * contributes, pdf-lib dedupes those resources for us.
     */
    const byFile = new Map<File, number[]>();
    for (const source of sources) {
      const indices = byFile.get(source.file);
      if (indices) indices.push(source.pageIndex);
      else byFile.set(source.file, [source.pageIndex]);
    }

    /**
     * Copies stay in the order that file's indices were collected, and are then
     * consumed in that same order below — NOT looked up by page index. Keying by
     * index would collapse a page used twice into one object, and adding the
     * same page object to a document twice produces a corrupt file.
     */
    const queues = new Map<File, { pages: Awaited<ReturnType<typeof out.copyPages>>; next: number }>();
    let read = 0;

    for (const [file, indices] of byFile) {
      const src = await PDFDocument.load(await file.arrayBuffer());
      queues.set(file, { pages: await out.copyPages(src, indices), next: 0 });

      // Reading and copying is the slow half; adding pages below is instant.
      onProgress?.(++read, byFile.size);
    }

    for (const source of sources) {
      const queue = queues.get(source.file);
      const page = queue?.pages[queue.next++];
      if (!page) continue;

      if (source.rotation) {
        // COMPOSE with what the page already carried. A scan that arrives
        // rotated 90° and is turned once more must end up at 180, not at 90 —
        // overwriting would silently undo the document's own orientation.
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + source.rotation) % 360));
      }

      out.addPage(page);
    }

    const bytes = await out.save({ useObjectStreams: true });
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
  }
}
