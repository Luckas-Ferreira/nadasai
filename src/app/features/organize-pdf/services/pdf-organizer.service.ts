import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';

export interface OrganizeSource {
  readonly file: File;
  /** 0-based index into file's pages */
  readonly pageIndex: number;
  /** Clockwise rotation offset: 0, 90, 180, 270 */
  readonly rotation: number;
  readonly password?: string;
}

@Injectable({ providedIn: 'root' })
export class PdfOrganizerService {
  async organize(
    sources: readonly OrganizeSource[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Blob> {
    if (!sources.length) throw new AppError('pdf_export_failed');

    const { PDFDocument, degrees } = await import('pdf-lib');
    const out = await PDFDocument.create();

    const byFile = new Map<File, { indices: number[]; password?: string }>();
    for (const source of sources) {
      const entry = byFile.get(source.file);
      if (entry) entry.indices.push(source.pageIndex);
      else byFile.set(source.file, { indices: [source.pageIndex], password: source.password });
    }

    const queues = new Map<File, { pages: Awaited<ReturnType<typeof out.copyPages>>; next: number }>();
    let read = 0;

    for (const [file, entry] of byFile) {
      const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      queues.set(file, { pages: await out.copyPages(src, entry.indices), next: 0 });
      onProgress?.(++read, byFile.size);
    }

    for (const source of sources) {
      const queue = queues.get(source.file);
      const page = queue?.pages[queue.next++];
      if (!page) continue;

      if (source.rotation) {
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + source.rotation) % 360));
      }

      out.addPage(page);
    }

    const bytes = await out.save({ useObjectStreams: true });
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
  }
}
