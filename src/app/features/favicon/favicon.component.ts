import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toMessageKey } from '../../core/errors';
import { ICO_SIZES, encodeIco } from '../../core/image/converters';
import { saveBlob } from '../../core/image/download';
import { formatBytes, loadImage, suffixedName } from '../../core/image/image-file.util';
import { ObjectUrlScope } from '../../core/image/object-url';
import { WorkspaceService, hydrateFromWorkspace } from '../../core/services/workspace.service';
import { PendingTransitionService } from '../../core/services/pending-transition.service';
import { TranslationService, type TranslationKey } from '../../core/services/translation.service';
import { toolById } from '../../core/tools/tools';
import { ActionBarComponent } from '../../shared/ui/action-bar.component';
import { AlertComponent } from '../../shared/ui/alert.component';
import { ButtonDirective } from '../../shared/ui/button.directive';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { PanelComponent } from '../../shared/ui/panel.component';
import { PreviewSurfaceComponent } from '../../shared/ui/preview-surface.component';
import { ToolPageComponent } from '../../shared/ui/tool-page.component';

/** Os quatro que um `<link rel="icon">` de site realmente usa, já marcados. */
const DEFAULT_SIZES: readonly number[] = [16, 32, 48, 256];

/**
 * Favicon multi-resolução.
 *
 * O motor já existia inteiro: `encodeIco` em `core/image/converters.ts` escreve
 * um ICO de verdade — diretório ICONDIR + uma entrada PNG por tamanho — e é
 * coberto por `converters.spec.ts`. Ele só era alcançável escondido dentro do
 * conversor, com os seis tamanhos fixos e sem nada na tela dizendo o que ia sair.
 * Esta ferramenta é a UI que faltava, e é por isso que ela quase não tem lógica:
 * escolher os tamanhos e chamar o encoder. A opção do conversor saiu depois
 * disto: com os tamanhos à escolha aqui, ela era esta tela com controle pior.
 *
 * O `contain` do encoder é o detalhe que vale saber ao olhar a prévia: um
 * retângulo entra numa caixa quadrada com borda transparente em vez de ser
 * espremido. Uma versão antiga distorcia (uma foto 1600x900 saía como um
 * 256x256 achatado), então a prévia aqui mostra o quadrado, e não o recorte.
 */
@Component({
  selector: 'app-favicon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ObjectUrlScope],
  imports: [
    ToolPageComponent,
    DropzoneComponent,
    PreviewSurfaceComponent,
    PanelComponent,
    ActionBarComponent,
    AlertComponent,
    ButtonDirective,
  ],
  templateUrl: './favicon.component.html',
})
export class FaviconComponent {
  private readonly urls = inject(ObjectUrlScope);
  private readonly tool = toolById('favicon');
  private readonly pendingTransition = inject(PendingTransitionService);

  protected readonly state = inject(WorkspaceService);
  protected readonly i18n = inject(TranslationService);

  protected readonly allSizes = ICO_SIZES;

  protected readonly sourceUrl = signal<string | null>(null);
  protected readonly resultBlob = signal<Blob | null>(null);
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);

  protected readonly sizes = signal<readonly number[]>(DEFAULT_SIZES);

  /** Dimensões da origem, só para dizer se ela já é quadrada. */
  protected readonly sourceWidth = signal(0);
  protected readonly sourceHeight = signal(0);

  protected readonly sourceFile = computed(() => this.state.fileFor('favicon'));

  protected readonly isSquare = computed(
    () => this.sourceWidth() > 0 && this.sourceWidth() === this.sourceHeight(),
  );

  protected readonly resultSize = computed(() => {
    const blob = this.resultBlob();
    return blob ? formatBytes(blob.size) : '—';
  });

  protected readonly canRun = computed(() => !!this.sourceFile() && this.sizes().length > 0);

  /**
   * Os tamanhos com que o ICO na tela foi escrito. `null` enquanto não há
   * resultado. É o que apaga o botão primário quando apertá-lo só reproduziria
   * o arquivo que já está ali — e o traz de volta assim que um tamanho muda.
   */
  private readonly ranSizes = signal<string | null>(null);

  protected readonly stale = computed(() => this.ranSizes() !== this.sizeKey());

  private readonly sizeKey = computed(() => [...this.sizes()].sort((a, b) => a - b).join(','));

  constructor() {
    hydrateFromWorkspace('favicon', (file) => void this.hydrate(file));
  }

  protected onFile(file: File): void {
    this.errorKey.set(null);

    try {
      this.state.load(file, 'favicon');
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  private async hydrate(file: File | null): Promise<void> {
    this.clearResult();

    if (!file) {
      this.urls.revoke(this.sourceUrl());
      this.sourceUrl.set(null);
      this.sourceWidth.set(0);
      this.sourceHeight.set(0);
      return;
    }

    this.sourceUrl.set(this.urls.replace(this.sourceUrl(), file));

    try {
      const img = await loadImage(file);
      this.sourceWidth.set(img.naturalWidth);
      this.sourceHeight.set(img.naturalHeight);
    } catch (err) {
      this.errorKey.set(toMessageKey(err));
    }
  }

  protected isSelected(size: number): boolean {
    return this.sizes().includes(size);
  }

  /**
   * Alterna um tamanho, mas nunca deixa a lista vazia: um ICO sem entrada
   * nenhuma não é um arquivo degradado, é um arquivo inválido — e `encodeIco`
   * lança nesse caso. Recusar o último clique é mais honesto do que deixar
   * chegar até o erro.
   */
  protected toggleSize(size: number): void {
    this.sizes.update((current) => {
      if (!current.includes(size)) return [...current, size].sort((a, b) => a - b);
      if (current.length === 1) return current;
      return current.filter((s) => s !== size);
    });
  }

  protected async run(): Promise<void> {
    const file = this.sourceFile();
    if (!file || !this.canRun()) return;

    this.busy.set(true);
    this.errorKey.set(null);

    try {
      const key = this.sizeKey();
      const blob = await encodeIco(file, this.sizes());
      this.resultBlob.set(blob);
      this.ranSizes.set(key);

      // O ICO é terminal na cadeia (`produces: null`), então não há commit a
      // registrar — mas a barra de ações ainda precisa do resultado para
      // mostrar o "Baixar".
      this.pendingTransition.clear();
    } catch (err) {
      console.error('[Favicon] ICO encode failed:', err);
      this.errorKey.set(toMessageKey(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected download(): void {
    const blob = this.resultBlob();
    const session = this.state.session();
    if (!blob || !session) return;

    saveBlob(blob, suffixedName(session.originalName, this.tool.suffix, 'ico'));
  }

  protected reset(): void {
    this.urls.releaseAll();
    this.sourceUrl.set(null);
    this.sourceWidth.set(0);
    this.sourceHeight.set(0);
    this.sizes.set(DEFAULT_SIZES);
    this.clearResult();
    this.errorKey.set(null);
    this.state.clear();
  }

  private clearResult(): void {
    this.resultBlob.set(null);
    this.ranSizes.set(null);
    this.pendingTransition.clear();
  }
}
