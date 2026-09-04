import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input, output } from '@angular/core';
import { FileViewerService } from '../../core/services/file-viewer.service';
import { TranslationService } from '../../core/services/translation.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { IconComponent } from './icon/icon.component';

/**
 * The image stage. Dark in both themes on purpose: a light surround measurably
 * changes how you perceive an image's brightness and colour, which is why every
 * serious editor puts the canvas on near-black.
 *
 * ── E O BOTÃO DE AMPLIAR ────────────────────────────────────────────────────
 *
 * O visualizador em tela cheia existia e quase ninguém o alcançava: o único
 * gatilho era a miniatura de 32px da barra de arquivo, que não parece um botão.
 * No celular isso é o problema inteiro — a imagem aparece num palco espremido
 * entre cabeçalho, painel e texto longo, e o gesto óbvio (tocar a imagem) não
 * fazia nada.
 *
 * É um BOTÃO no canto, e não um toque na imagem, de propósito: seis ferramentas
 * têm um palco que se arrasta (cropper.js no recortar, no 3x4 e no recorte de
 * vídeo; `app-region-overlay` nas três de censura), e ali um toque que abrisse a
 * tela cheia quebraria a ferramenta para consertar a navegação. Nenhuma dessas
 * seis usa este componente — mas a regra é a que vale para a próxima que não usar.
 *
 * O que ele amplia é o `src` QUE ESTÁ NA TELA, e não o arquivo da sessão: se a
 * ferramenta já produziu um resultado, ampliar tem de ampliar o resultado. Só o
 * NOME vem da sessão, porque é o único lugar que o tem.
 */
@Component({
  selector: 'app-preview-surface',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <!-- A ALTURA VEM DA VIEWPORT NO CELULAR, e do que a ferramenta pediu no
         desktop.

         O minHeight continua sendo a medida do desktop, onde o palco é uma
         célula de grade e quem manda é a ferramenta. No celular ele deixa de
         valer: 420px fixos escolhidos sem saber o tamanho da tela deixavam vão
         morto num aparelho alto e espremiam num baixo. --stage-h é o mesmo
         token que o palco do app-tool-page usa, então os dois nunca discordam.

         O --surface-min é variável e não min-height inline porque estilo
         inline vence classe: com o binding direto, o md: não teria como
         devolver o número da ferramenta no desktop. -->
    <div
      class="relative flex items-center justify-center overflow-hidden rounded-xl border border-stage-line bg-stage p-6
             min-h-[var(--stage-h)] md:min-h-[var(--surface-min)]"
      [style.--surface-min]="minHeight() + 'px'"
    >
      @if (src(); as source) {
        <div
          class="relative flex max-h-full items-center justify-center rounded-sm"
          [class.checkerboard]="checkerboard() && !background()"
          [style.background-color]="background()"
        >
          <img
            [src]="source"
            [alt]="alt()"
            class="max-h-[min(62vh,600px)] max-w-full object-contain"
            (error)="loadError.emit()"
          />
        </div>

        <!-- Some enquanto a ferramenta trabalha: ampliar um resultado que ainda
             está sendo escrito mostraria o estado anterior com cara de atual. -->
        @if (!busy()) {
          <button
            type="button"
            (click)="expand(source)"
            [attr.aria-label]="i18n.t()['viewer.expand']"
            [title]="i18n.t()['viewer.expand']"
            class="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full
                   bg-viewer-scrim text-viewer-text transition-colors hover:bg-viewer-hover
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <app-icon name="expand" [size]="17" />
          </button>
        }
      }

      @if (busy()) {
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-stage/85 backdrop-blur-[3px]">
          <div class="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-accent"></div>

          <p class="text-sm font-medium text-white">{{ busyLabel() || i18n.t()['common.processing'] }}</p>

          @if (progress() !== null) {
            <div class="w-56">
              <div class="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  class="h-full rounded-full bg-accent transition-[width] duration-300"
                  [style.width.%]="progress()"
                ></div>
              </div>
              <p class="mt-2 text-center text-xs text-white/50 tabular" aria-live="polite">{{ progress() }}%</p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PreviewSurfaceComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly viewer = inject(FileViewerService);
  private readonly workspace = inject(WorkspaceService);

  readonly src = input<string | null>(null);
  readonly alt = input('');
  readonly checkerboard = input(false, { transform: booleanAttribute });
  readonly background = input<string | null>(null);
  readonly busy = input(false, { transform: booleanAttribute });
  readonly busyLabel = input<string | null>(null);
  readonly progress = input<number | null>(null);
  readonly minHeight = input(420);

  readonly loadError = output<void>();

  /**
   * Abre em tela cheia o que está na tela.
   *
   * O `kind` é `'image'` fixo e não o da sessão: este palco só desenha imagem —
   * é para isso que ele existe —, e passar o tipo da sessão faria o visualizador
   * tentar rasterizar um PDF a partir de uma object URL de PNG. O nome cai para
   * o rótulo genérico quando não há sessão, que é o caso de uma ferramenta que
   * ainda não commitou nada.
   */
  protected expand(src: string): void {
    this.viewer.show({
      name: this.workspace.session()?.originalName ?? this.i18n.t()['viewer.title'],
      kind: 'image',
      src,
      file: null,
    });
  }
}
