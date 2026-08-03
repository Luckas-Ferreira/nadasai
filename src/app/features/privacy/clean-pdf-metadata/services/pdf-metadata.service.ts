import { Injectable } from '@angular/core';
import { AppError } from '../../../../core/errors';
import { MAX_PDF_BYTES } from '../../../../core/pdf/pdfjs';

export interface PdfInfoFields {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
  /** Non-standard Info keys — where document systems stash usernames and ids. */
  custom: Record<string, string>;
}

export interface PdfMetadataReport {
  readonly info: PdfInfoFields;
  readonly infoKeyCount: number;
  readonly hasXmp: boolean;
  readonly xmpBytes: number;
  readonly xmpSample?: string;
  readonly pagesWithMetadata: number[];
  readonly attachments: string[];
  readonly pageCount: number;
}

export interface CleanPdfOptions {
  readonly file: File;
  readonly removeInfo: boolean;
  readonly removeXmp: boolean;
  readonly removePageMetadata: boolean;
  readonly removeAttachments: boolean;
}

export interface CleanPdfOutcome {
  readonly blob: Blob;
  readonly filename: string;
  readonly removed: string[];
}

/**
 * pdf-lib reaches used here that are public but outside the documented surface:
 * `doc.context`, `doc.catalog`, `PDFContext.delete`, `PDFDict.delete` and
 * `context.trailerInfo`. Verified against 1.17.1. The spec that greps the raw
 * output bytes for the original author string is what fails loudly if a future
 * version moves them.
 */
@Injectable({ providedIn: 'root' })
export class PdfMetadataService {
  private async load(file: File) {
    if (file.type && file.type !== 'application/pdf') throw new AppError('pdf_unsupported');
    if (file.size > MAX_PDF_BYTES) throw new AppError('pdf_too_large');

    const lib = await import('pdf-lib');
    const bytes = new Uint8Array(await file.arrayBuffer());

    let doc;
    try {
      doc = await lib.PDFDocument.load(bytes, {
        ignoreEncryption: true,
        // MANDATORY. It defaults to true, and load() then calls updateInfoDict(),
        // which writes Producer = "pdf-lib (…)" and ModDate = now. A metadata
        // cleaner that stamps its own fingerprint on the way in is the one bug
        // nobody would forgive here.
        updateMetadata: false,
      });
    } catch (err) {
      throw new AppError('pdf_unsupported', err);
    }

    return { lib, doc };
  }

  async read(file: File): Promise<PdfMetadataReport> {
    const { lib, doc } = await this.load(file);
    const { PDFDict, PDFName, PDFRawStream, PDFHexString, PDFString } = lib;

    const info: PdfInfoFields = { custom: {} };
    let infoKeyCount = 0;

    const infoRef = doc.context.trailerInfo.Info;
    const infoDict = infoRef ? doc.context.lookup(infoRef, PDFDict) : undefined;

    if (infoDict) {
      type TextField = Exclude<keyof PdfInfoFields, 'custom'>;
      const standard: Record<string, TextField> = {
        Title: 'title', Author: 'author', Subject: 'subject', Keywords: 'keywords',
        Creator: 'creator', Producer: 'producer', CreationDate: 'creationDate', ModDate: 'modDate',
      };

      for (const key of infoDict.keys()) {
        infoKeyCount++;
        const name = key.asString().replace(/^\//, '');
        const raw = infoDict.get(key);
        const value =
          raw instanceof PDFHexString || raw instanceof PDFString ? raw.decodeText() : String(raw ?? '');
        if (!value) continue;

        const mapped = standard[name];
        if (mapped) info[mapped] = value;
        else info.custom[name] = value;
      }
    }

    let hasXmp = false;
    let xmpBytes = 0;
    let xmpSample: string | undefined;

    const xmpRef = doc.catalog.get(PDFName.of('Metadata'));
    const xmp = xmpRef ? doc.context.lookup(xmpRef) : undefined;
    if (xmp instanceof PDFRawStream) {
      hasXmp = true;
      xmpBytes = xmp.contents.length;
      xmpSample = new TextDecoder().decode(xmp.contents.subarray(0, 600));
    }

    const pagesWithMetadata: number[] = [];
    doc.getPages().forEach((page, index) => {
      if (page.node.get(PDFName.of('Metadata')) || page.node.get(PDFName.of('PieceInfo'))) {
        pagesWithMetadata.push(index + 1);
      }
    });

    const attachments: string[] = [];
    try {
      const names = doc.catalog.get(PDFName.of('Names'));
      const namesDict = names ? doc.context.lookup(names, PDFDict) : undefined;
      if (namesDict?.get(PDFName.of('EmbeddedFiles'))) attachments.push('EmbeddedFiles');
    } catch {
      // An unusual Names tree is not worth failing the whole read over.
    }

    return {
      info,
      infoKeyCount,
      hasXmp,
      xmpBytes,
      xmpSample,
      pagesWithMetadata,
      attachments,
      pageCount: doc.getPageCount(),
    };
  }

  async clean(options: CleanPdfOptions): Promise<CleanPdfOutcome> {
    const { file } = options;
    const { lib, doc } = await this.load(file);
    const { PDFDict, PDFName, PDFRef } = lib;
    const removed: string[] = [];

    if (options.removeInfo) {
      const infoRef = doc.context.trailerInfo.Info;
      const infoDict = infoRef ? doc.context.lookup(infoRef, PDFDict) : undefined;
      if (infoDict) {
        for (const key of [...infoDict.keys()]) infoDict.delete(key);
        removed.push('Info');
      }
      doc.context.trailerInfo.Info = undefined;
      // Clearing the trailer reference is not enough: the writer emits EVERY
      // registered object, so the orphaned Info dictionary would still be in
      // the file and the author's name findable with `strings`.
      if (infoRef instanceof PDFRef) doc.context.delete(infoRef);
    }

    if (options.removeXmp) {
      const xmpRef = doc.catalog.get(PDFName.of('Metadata'));
      if (xmpRef) {
        doc.catalog.delete(PDFName.of('Metadata'));
        if (xmpRef instanceof PDFRef) doc.context.delete(xmpRef);
        removed.push('XMP');
      }
    }

    if (options.removePageMetadata) {
      let touched = 0;
      for (const page of doc.getPages()) {
        for (const key of ['Metadata', 'PieceInfo'] as const) {
          const ref = page.node.get(PDFName.of(key));
          if (!ref) continue;
          page.node.delete(PDFName.of(key));
          if (ref instanceof PDFRef) doc.context.delete(ref);
          touched++;
        }
      }
      if (touched > 0) removed.push('PageMetadata');
    }

    if (options.removeAttachments) {
      const names = doc.catalog.get(PDFName.of('Names'));
      const namesDict = names ? doc.context.lookup(names, PDFDict) : undefined;
      if (namesDict?.get(PDFName.of('EmbeddedFiles'))) {
        namesDict.delete(PDFName.of('EmbeddedFiles'));
        removed.push('EmbeddedFiles');
      }
    }

    let bytes: Uint8Array;
    try {
      bytes = await doc.save({ useObjectStreams: true });
    } catch (err) {
      throw new AppError('pdf_export_failed', err);
    }

    return {
      blob: new Blob([bytes], { type: 'application/pdf' }),
      filename: file.name.replace(/\.pdf$/i, '') + '-clean.pdf',
      removed,
    };
  }
}
