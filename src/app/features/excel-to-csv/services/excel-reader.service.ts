import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';
import { officeKindOf } from '../../../core/office/metadata';
import {
  dateStyles,
  parseSheet,
  sharedStrings,
  toCsv,
  toJson,
  usesDate1904,
  workbookSheets,
  type CsvDelimiter,
  type SheetRef,
} from '../../../core/office/xlsx-read';

export type SheetOutput = 'csv' | 'json';

export interface WorkbookScan {
  readonly sheets: readonly SheetRef[];
  readonly entries: Record<string, Uint8Array>;
  readonly shared: readonly string[];
  readonly dates: ReadonlySet<number>;
  readonly date1904: boolean;
}

export interface SheetTable {
  readonly rows: readonly (readonly string[])[];
  readonly columns: number;
}

/**
 * Abre uma planilha e devolve as células.
 *
 * Toda a gramática está em `core/office/xlsx-read.ts`; aqui só se abre o zip e
 * se juntam as quatro partes que uma leitura precisa: o livro (nomes das abas),
 * as relações (onde cada aba está), os textos compartilhados e os estilos (o
 * que distingue uma data de um número).
 *
 * Nenhuma delas é opcional por capricho: sem os textos compartilhados a
 * planilha sai só com números; sem os estilos toda data sai 45000; sem as
 * relações uma planilha que já teve aba apagada abre a aba errada.
 */
@Injectable({ providedIn: 'root' })
export class ExcelReaderService {
  async scan(file: File): Promise<WorkbookScan> {
    if (officeKindOf(file.name) !== 'xlsx') throw new AppError('office_not_excel');

    const { unzipSync } = await import('fflate');

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new AppError('office_unsupported');
    }

    const decoder = new TextDecoder();
    const read = (path: string): string | null =>
      entries[path] ? decoder.decode(entries[path]) : null;

    const workbook = read('xl/workbook.xml');
    if (!workbook) throw new AppError('office_unsupported');

    const sheets = workbookSheets(workbook, read('xl/_rels/workbook.xml.rels'));
    if (!sheets.length) throw new AppError('office_unsupported');

    return {
      sheets,
      entries,
      shared: sharedStrings(read('xl/sharedStrings.xml')),
      dates: dateStyles(read('xl/styles.xml')),
      date1904: usesDate1904(workbook),
    };
  }

  table(scan: WorkbookScan, index: number): SheetTable {
    const sheet = scan.sheets[index];
    const raw = sheet ? scan.entries[sheet.path] : undefined;
    if (!raw) return { rows: [], columns: 0 };

    const rows = parseSheet(new TextDecoder().decode(raw), {
      shared: scan.shared,
      dateStyles: scan.dates,
      date1904: scan.date1904,
    });

    return {
      rows,
      columns: rows.reduce((max, row) => Math.max(max, row.length), 0),
    };
  }

  render(
    table: SheetTable,
    output: SheetOutput,
    options: { delimiter: CsvDelimiter; header: boolean },
  ): string {
    return output === 'csv' ? toCsv(table.rows, options.delimiter) : toJson(table.rows, options.header);
  }
}
