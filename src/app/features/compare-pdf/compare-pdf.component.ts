import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { saveBlob } from '../../core/image/download';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';
import { ComparePdfService, type ComparePdfResult } from './services/compare-pdf.service';

@Component({
  selector: 'app-compare-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    ButtonDirective,
    IconComponent,
  ],
  templateUrl: './compare-pdf.component.html',
})
export class ComparePdfComponent {
  private readonly comparer = inject(ComparePdfService);
  private readonly workspace = inject(WorkspaceService);
  private readonly pendingTransition = inject(PendingTransitionService);
  protected readonly tool = toolById('compare-pdf');
  protected readonly i18n = inject(TranslationService);

  /**
   * O ESQUERDO vem da sessão; o direito é sempre local.
   *
   * Mesma regra que merge-pdf e img-to-pdf seguem: a sessão guarda UM arquivo, e
   * é isso que torna a cadeia possível. Um segundo arquivo é estado do
   * componente, e reagir à sessão para ele jogaria fora a escolha da pessoa toda
   * vez que o arquivo da cadeia mudasse.
   */
  protected readonly left = signal<File | null>(null);
  protected readonly right = signal<File | null>(null);

  protected readonly busy = signal(false);
  protected readonly progress = signal<number | null>(null);
  protected readonly result = signal<ComparePdfResult | null>(null);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly ignoreWhitespace = signal(true);
  protected readonly ignoreCase = signal(false);

  protected readonly canRun = computed(() => !!this.left() && !!this.right() && !this.busy());

  protected readonly scannedTotal = computed(() => {
    const res = this.result();
    return res ? res.leftScanned + res.rightScanned : 0;
  });

  protected readonly identical = computed(() => this.result()?.identical ?? false);

  private readonly ranSettings = signal<string | null>(null);

  private readonly settings = computed(() =>
    [
      this.left()?.name ?? '',
      this.left()?.size ?? 0,
      this.right()?.name ?? '',
      this.right()?.size ?? 0,
      this.ignoreWhitespace(),
      this.ignoreCase(),
    ].join('|'),
  );

  protected readonly stale = computed(() => this.ranSettings() !== this.settings());

  constructor() {
    hydrateFromWorkspace('compare-pdf', (file) => {
      this.left.set(file);
      this.clearResult();
    });
  }

  protected onLeft(file: File): void {
    this.errorKey.set(null);

    try {
      this.workspace.load(file, 'compare-pdf');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected onRight(file: File): void {
    this.errorKey.set(null);
    this.right.set(file);
    this.clearResult();
  }

  protected clearRight(): void {
    this.right.set(null);
    this.clearResult();
  }

  protected async run(): Promise<void> {
    const left = this.left();
    const right = this.right();
    if (!left || !right || !this.canRun()) return;

    this.busy.set(true);
    this.progress.set(0);
    this.errorKey.set(null);

    try {
      const settings = this.settings();

      const res = await this.comparer.compare({
        left,
        right,
        leftPassword: this.workspace.pdfPassword() ?? undefined,
        ignoreWhitespace: this.ignoreWhitespace(),
        ignoreCase: this.ignoreCase(),
        onProgress: (p) => this.progress.set(p),
      });

      this.result.set(res);
      this.ranSettings.set(settings);

      // `produces: null` — o resultado é uma leitura, não um arquivo que
      // continua a cadeia. Nada a registrar.
      this.pendingTransition.clear();
    } catch (err) {
      console.error('[ComparePdf] failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
      this.progress.set(null);
    }
  }

  /**
   * O download é o diff UNIFICADO, e não os dois textos: é o formato que se
   * cola num ticket, num e-mail ou numa revisão de código, e o único que
   * carrega a comparação em vez de carregar os dois lados dela.
   */
  protected download(): void {
    const res = this.result();
    const left = this.left();
    const right = this.right();
    if (!res || !left || !right) return;

    saveBlob(this.comparer.unified(res, left.name, right.name), `${baseName(left.name)}-diff.txt`);
  }

  protected reset(): void {
    this.left.set(null);
    this.right.set(null);
    this.clearResult();
    this.errorKey.set(null);
    this.workspace.clear();
  }

  private clearResult(): void {
    this.result.set(null);
    this.ranSettings.set(null);
    this.pendingTransition.clear();
  }
}

function baseName(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}
