import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DocxOutput } from '../../core/office/docx-text';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { suffixedName } from '../../core/image/image-file.util';
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
import { WordTextService, type WordTextResult } from './services/word-text.service';

@Component({
  selector: 'app-word-to-text',
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
  templateUrl: './word-to-text.component.html',
})
export class WordToTextComponent {
  private readonly reader = inject(WordTextService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('word-to-text');
  protected readonly i18n = inject(TranslationService);

  protected readonly file = signal<File | null>(null);
  protected readonly output = signal<DocxOutput>('markdown');

  protected readonly busy = signal(false);
  protected readonly result = signal<WordTextResult | null>(null);
  protected readonly copied = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly formatOptions = computed<SegmentOption<DocxOutput>[]>(() => [
    { value: 'markdown', label: this.i18n.t()['wordtext.markdown'] },
    { value: 'text', label: this.i18n.t()['wordtext.plain'] },
  ]);

  protected readonly outputHint = computed(() =>
    this.output() === 'markdown'
      ? this.i18n.t()['wordtext.markdown_hint']
      : this.i18n.t()['wordtext.plain_hint'],
  );

  /**
   * Um `.docx` sem texto no corpo é caso real, não erro: caixas de texto, um
   * documento inteiro em imagens, um digitalizado. Dizer isso é melhor do que
   * entregar um arquivo vazio, e a frase diz também o que a ferramenta NÃO é —
   * ela lê o corpo, não faz OCR.
   */
  protected readonly empty = computed(() => {
    const result = this.result();
    return !!result && result.words === 0;
  });

  protected readonly extension = computed(() => (this.output() === 'markdown' ? 'md' : 'txt'));

  protected readonly canRun = computed(() => !!this.file() && !this.busy());

  private readonly ranSettings = signal<string | null>(null);
  protected readonly stale = computed(() => this.ranSettings() !== this.output());

  constructor() {
    hydrateFromWorkspace('word-to-text', (file) => this.load(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'word-to-text');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private load(file: File | null): void {
    this.clearResult();
    this.file.set(file);
  }

  protected setOutput(value: DocxOutput): void {
    this.output.set(value);
    this.clearResult();
  }

  protected async run(): Promise<void> {
    const file = this.file();
    if (!file || !this.canRun()) return;

    this.busy.set(true);
    this.errorKey.set(null);

    try {
      const output = this.output();
      const result = await this.reader.extract(file, output);

      this.result.set(result);
      this.ranSettings.set(output);

      const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
      this.pendingTransition.registerResult(
        'word-to-text',
        blob,
        this.tool.suffix,
        this.extension(),
      );
    } catch (err) {
      console.error('[WordToText] extraction failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected async copy(): Promise<void> {
    const result = this.result();
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result.text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch (err) {
      // A área de transferência pede permissão e um gesto, e nem todo navegador
      // concede. Falhar aqui não pode custar o texto: ele está na tela e o
      // download continua sendo o caminho garantido.
      console.error('[WordToText] clipboard refused:', err);
    }
  }

  protected download(): void {
    const result = this.result();
    const session = this.workspace.session();
    if (!result || !session) return;

    const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, this.extension()));
  }

  protected reset(): void {
    this.file.set(null);
    this.clearResult();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private clearResult(): void {
    this.result.set(null);
    this.copied.set(false);
    this.ranSettings.set(null);
    this.pendingTransition.clear();
  }
}
