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
    const srcDoc = await PDFDocument.load(arrayBuffer);
    const totalPages = srcDoc.getPageCount();

    if (totalPages === 0) {
      throw new Error('pdf_empty');
    }

    // Compute sets of 0-indexed page numbers for each output document
    let pageSets: number[][] = [];

    if (mode === 'range') {
      if (rangeSubMode === 'custom') {
        for (const range of customRanges) {
          const from = Math.max(1, Math.min(totalPages, range.from));
          const to = Math.max(from, Math.min(totalPages, range.to));
          const pageIndices: number[] = [];
          for (let p = from - 1; p < to; p++) {
            pageIndices.push(p);
          }
          if (pageIndices.length > 0) {
            pageSets.push(pageIndices);
          }
        }
      } else {
        // Fixed range chunking (e.g. 2 pages per PDF)
        const chunkSize = Math.max(1, fixedChunkSize);
        for (let i = 0; i < totalPages; i += chunkSize) {
          const chunk: number[] = [];
          for (let j = i; j < Math.min(totalPages, i + chunkSize); j++) {
            chunk.push(j);
          }
          pageSets.push(chunk);
        }
      }
    } else {
      // mode === 'pages'
      if (pagesSubMode === 'all') {
        for (let i = 0; i < totalPages; i++) {
          pageSets.push([i]);
        }
      } else {
        // Select specific pages
        const validPages = selectedPages
          .filter((p) => p >= 1 && p <= totalPages)
          .sort((a, b) => a - b);

        if (mergeOutput) {
          // All selected pages into 1 PDF
          if (validPages.length > 0) {
            pageSets.push(validPages.map((p) => p - 1));
          }
        } else {
          // Each selected page into an individual PDF
          for (const p of validPages) {
            pageSets.push([p - 1]);
          }
        }
      }
    }

    if (pageSets.length === 0) {
      throw new Error('no_pages_selected');
    }

    // Handle Merge Output option for custom ranges
    if (mode === 'range' && mergeOutput && pageSets.length > 1) {
      const combined: number[] = [];
      for (const set of pageSets) {
        combined.push(...set);
      }
      pageSets = [combined];
    }

    // Build output PDFs
    const createdPdfs: { name: string; bytes: Uint8Array }[] = [];
    const baseName = file.name.replace(/\.[^/.]+$/, '');

    for (let i = 0; i < pageSets.length; i++) {
      const pageIndices = pageSets[i];
      const newDoc = await PDFDocument.create();
      const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
      for (const page of copiedPages) {
        newDoc.addPage(page);
      }

      const pdfBytes = await newDoc.save();

      let pdfName = '';
      if (pageSets.length === 1) {
        pdfName = `${baseName}_split.pdf`;
      } else if (pageIndices.length === 1) {
        pdfName = `${baseName}_page_${pageIndices[0] + 1}.pdf`;
      } else {
        pdfName = `${baseName}_range_${pageIndices[0] + 1}-${pageIndices[pageIndices.length - 1] + 1}.pdf`;
      }

      createdPdfs.push({ name: pdfName, bytes: pdfBytes });

      if (onProgress) {
        onProgress(Math.round(((i + 1) / pageSets.length) * 100));
      }
    }

    // If only 1 PDF created, return as single PDF blob
    if (createdPdfs.length === 1) {
      const blob = new Blob([createdPdfs[0].bytes], { type: 'application/pdf' });
      return {
        blob,
        filename: createdPdfs[0].name,
        isZip: false,
        pdfCount: 1,
      };
    }

    // Multiple PDFs created: bundle into a ZIP archive using fflate
    const zipFiles: Record<string, Uint8Array> = {};
    for (const item of createdPdfs) {
      zipFiles[item.name] = item.bytes;
    }

    const zipData = zipSync(zipFiles);
    const zipBlob = new Blob([zipData], { type: 'application/zip' });

    return {
      blob: zipBlob,
      filename: `${baseName}_split.zip`,
      isZip: true,
      pdfCount: createdPdfs.length,
    };
  }
}
