import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { suffixedName } from '../../core/image/image-file.util';
import type { CsvDelimiter } from '../../core/office/xlsx-read';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { SegmentedComponent, type SegmentOption } from '../../shared/ui/segmented.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import {
  ExcelReaderService,
  type SheetOutput,
  type WorkbookScan,
} from './services/excel-reader.service';

@Component({
  selector: 'app-excel-to-csv',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    SegmentedComponent,
    ButtonDirective,
  ],
  templateUrl: './excel-to-csv.component.html',
})
export class ExcelToCsvComponent {
  private readonly reader = inject(ExcelReaderService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('excel-to-csv');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly scan = signal<WorkbookScan | null>(null);
  protected readonly sheetIndex = signal(0);
  protected readonly reading = signal(false);

  protected readonly output = signal<SheetOutput>('csv');
  protected readonly delimiter = signal<CsvDelimiter>(';');
  protected readonly header = signal(true);

  protected readonly text = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly sheetOptions = computed<SegmentOption<number>[]>(() =>
    (this.scan()?.sheets ?? []).map((sheet, index) => ({ value: index, label: sheet.name })),
  );

  protected readonly outputOptions = computed<SegmentOption<SheetOutput>[]>(() => [
    { value: 'csv', label: 'CSV' },
    { value: 'json', label: 'JSON' },
  ]);

  protected readonly delimiterOptions = computed<SegmentOption<CsvDelimiter>[]>(() => [
    { value: ';', label: this.i18n.t()['xlsxcsv.semicolon'] },
    { value: ',', label: this.i18n.t()['xlsxcsv.comma'] },
    { value: '\t', label: this.i18n.t()['xlsxcsv.tab'] },
  ]);

  /**
   * A tabela da aba escolhida, recalculada quando a aba muda.
   *
   * Ler é barato — o zip já está aberto e o que se percorre é XML de uma aba —,
   * então a contagem de linhas e colunas aparece antes de qualquer conversão.
   * É o que permite trocar de aba e ver na hora qual tem conteúdo.
   */
  protected readonly table = computed(() => {
    const scan = this.scan();
    return scan ? this.reader.table(scan, this.sheetIndex()) : null;
  });

  protected readonly rowCount = computed(() => this.table()?.rows.length ?? 0);
  protected readonly columnCount = computed(() => this.table()?.columns ?? 0);
  protected readonly empty = computed(() => !!this.scan() && this.rowCount() === 0);

  protected readonly extension = computed(() => (this.output() === 'csv' ? 'csv' : 'json'));

  protected readonly canRun = computed(
    () => !!this.scan() && !this.empty() && !this.busy() && !this.reading(),
  );

  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() =>
    [this.sheetIndex(), this.output(), this.delimiter(), this.header()].join('|'),
  );

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    hydrateFromWorkspace('excel-to-csv', (file) => void this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'excel-to-csv');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async load(file: File | null): Promise<void> {
    this.clearResult();
    this.sheetIndex.set(0);

    if (!file) {
      this.file.set(null);
      this.scan.set(null);
      return;
    }

    this.reading.set(true);

    try {
      this.scan.set(await this.reader.scan(file));
      this.file.set(file);
    } catch (err) {
      console.error('[ExcelToCsv] could not read the workbook:', err);
      this.errorKey.set(toMessageKey(err));
      this.file.set(null);
      this.scan.set(null);
    } finally {
      this.reading.set(false);
    }
  }

  protected setSheet(index: number): void {
    this.sheetIndex.set(index);
    this.clearResult();
  }

  protected setOutput(value: SheetOutput): void {
    this.output.set(value);
    this.clearResult();
  }

  protected setDelimiter(value: CsvDelimiter): void {
    this.delimiter.set(value);
    this.clearResult();
  }

  protected toggleHeader(): void {
    this.header.update((on) => !on);
    this.clearResult();
  }

  protected run(): void {
    const table = this.table();
    if (!table || !this.canRun()) return;

    this.busy.set(true);
    this.errorKey.set(null);

    try {
      const settings = this.settings();

      const rendered = this.reader.render(table, this.output(), {
        delimiter: this.delimiter(),
        header: this.header(),
      });

      this.text.set(rendered);
      this.ranSettings.set(settings);

      const blob = new Blob([rendered], { type: 'text/plain;charset=utf-8' });
      this.pendingTransition.registerResult(
        'excel-to-csv',
        blob,
        this.tool.suffix,
        this.extension(),
      );
    } catch (err) {
      console.error('[ExcelToCsv] conversion failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(): Promise<void> {
    const text = this.text();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch (err) {
      // A área de transferência pede permissão, e nem todo navegador concede.
      // O texto está na tela e o download continua sendo o caminho garantido.
      console.error('[ExcelToCsv] clipboard refused:', err);
    }
  }

  protected download(): void {
    const text = this.text();
    const session = this.workspace.session();
    if (!text || !session) return;

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, this.extension()));
  }

  protected reset(): void {
    this.file.set(null);
    this.scan.set(null);
    this.sheetIndex.set(0);
    this.clearResult();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private clearResult(): void {
    this.text.set(null);
    this.copied.set(false);
    this.ranSettings.set(null);
    this.pendingTransition.clear();
  }
}
