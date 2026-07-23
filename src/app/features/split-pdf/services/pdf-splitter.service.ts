import { Injectable } from '@angular/core';
import { zipSync } from 'fflate';

export interface SplitRange {
  from: number; // 1-based
  to: number;   // 1-based
}

export type SplitMainMode = 'range' | 'pages';
export type SplitRangeMode = 'custom' | 'fixed';
export type SplitPagesMode = 'all' | 'select';

export interface SplitPdfOptions {
  file: File;
  password?: string;
  mode: SplitMainMode;
  rangeSubMode: SplitRangeMode;
  pagesSubMode: SplitPagesMode;
  customRanges: SplitRange[];
  fixedChunkSize: number;
  selectedPages: number[]; // 1-based
  mergeOutput: boolean;
  onProgress?: (percent: number) => void;
}

export interface SplitResult {
  blob: Blob;
  filename: string;
  isZip: boolean;
  pdfCount: number;
}

@Injectable({ providedIn: 'root' })
export class PdfSplitterService {
  async split(options: SplitPdfOptions): Promise<SplitResult> {
    const { PDFDocument } = await import('pdf-lib');
    const {
      file,
      password,
      mode,
      rangeSubMode,
      pagesSubMode,
      customRanges,
      fixedChunkSize,
      selectedPages,
      mergeOutput,
      onProgress,
    } = options;

    const arrayBuffer = await file.arrayBuffer();
    const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const totalPages = srcDoc.getPageCount();

    if (totalPages === 0) {
      throw new Error('pdf_empty');
    }

    // Compute sets of 0-indexed page numbers for each output document
    let pageSets: number[][] = [];

    if (mode === 'range') {
      if (rangeSubMode === 'custom') {
        for (const range of customRanges) {
          const from = Math.max(1, Math.min(range.from, range.to));
          const to = Math.min(totalPages, Math.max(range.from, range.to));
          const set: number[] = [];
          for (let i = from; i <= to; i++) {
            set.push(i - 1);
          }
          if (set.length > 0) pageSets.push(set);
        }
      } else {
        // fixed chunks
        const chunkSize = Math.max(1, fixedChunkSize);
        for (let start = 0; start < totalPages; start += chunkSize) {
          const set: number[] = [];
          for (let i = start; i < Math.min(totalPages, start + chunkSize); i++) {
            set.push(i);
          }
          pageSets.push(set);
        }
      }
    } else {
      // mode === 'pages'
      if (pagesSubMode === 'all') {
        for (let i = 0; i < totalPages; i++) {
          pageSets.push([i]);
        }
      } else {
        // select
        const validSelected = selectedPages
          .filter((p) => p >= 1 && p <= totalPages)
          .sort((a, b) => a - b);

        for (const p of validSelected) {
          pageSets.push([p - 1]);
        }
      }
    }

    if (pageSets.length === 0) {
      throw new Error('no_pages_selected');
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '');

    // If mergeOutput is true, combine all page sets into a single PDF
    if (mergeOutput) {
      const mergedDoc = await PDFDocument.create();
      const allIndices = pageSets.flat();
      const copiedPages = await mergedDoc.copyPages(srcDoc, allIndices);
      for (const p of copiedPages) {
        mergedDoc.addPage(p);
      }
      const bytes = await mergedDoc.save({ useObjectStreams: true });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      return {
        blob,
        filename: `${baseName}_split.pdf`,
        isZip: false,
        pdfCount: 1,
      };
    }

    // If only 1 sub-PDF produced, return directly as single PDF file
    if (pageSets.length === 1) {
      const singleDoc = await PDFDocument.create();
      const copiedPages = await singleDoc.copyPages(srcDoc, pageSets[0]);
      for (const p of copiedPages) {
        singleDoc.addPage(p);
      }
      const bytes = await singleDoc.save({ useObjectStreams: true });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      return {
        blob,
        filename: `${baseName}_range_1.pdf`,
        isZip: false,
        pdfCount: 1,
      };
    }

    // Multiple PDFs produced: bundle into ZIP archive
    const createdPdfs: { name: string; bytes: Uint8Array }[] = [];

    for (let i = 0; i < pageSets.length; i++) {
      const subDoc = await PDFDocument.create();
      const copiedPages = await subDoc.copyPages(srcDoc, pageSets[i]);
      for (const p of copiedPages) {
        subDoc.addPage(p);
      }
      const bytes = await subDoc.save({ useObjectStreams: true });
      const pdfName = `${baseName}_part_${i + 1}.pdf`;
      createdPdfs.push({ name: pdfName, bytes });

      if (onProgress) {
        onProgress(Math.round(((i + 1) / pageSets.length) * 100));
      }
    }

    const zipFiles: Record<string, Uint8Array> = {};
    for (const item of createdPdfs) {
      zipFiles[item.name] = item.bytes;
    }

    const zipData = zipSync(zipFiles);
    const zipBlob = new Blob([zipData], { type: 'application/zip' });

    return {
      blob: zipBlob,
      filename: `${baseName}_split_files.zip`,
      isZip: true,
      pdfCount: createdPdfs.length,
    };
  }
}
