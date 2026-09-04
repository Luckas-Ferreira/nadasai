import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { NativeFileIntakeService } from '../../core/platform/native-file-intake.service';
import { ObjectUrlScope } from '../../core/image/object-url';
import { FileViewerService } from '../../core/services/file-viewer.service';
import { DropzoneComponent } from '../../shared/ui/dropzone.component';
import { IconComponent } from '../../shared/ui/icon/icon.component';
import { TranslationService } from '../../core/services/translation.service';
import { WorkspaceService } from '../../core/services/workspace.service';
import { kindOf } from '../../core/files/kind';
import { type ToolDef, nextToolsFor, toolPath } from '../../core/tools/tools';
import { takeSharedFile } from '../../core/services/share-target';

/**
 * Onde o SISTEMA OPERACIONAL entrega um arquivo.
 *
 * TRÊS portas levam a esta rota, e nenhuma delas existia:
 *
 *   * `file_handlers` no manifesto — "Abrir com > Nada Sai" no Explorer, no
 *     Finder e na lista de apps do Android. O arquivo chega pela `launchQueue`,
 *     que só entrega para a janela do app instalado.
 *   * `share_target` — a folha de compartilhamento do Android. O arquivo chega
 *     por um POST que o service worker intercepta e guarda; ver
 *     `core/services/share-target.ts`.
 *   * as INTENTS do app empacotado (ACTION_VIEW e ACTION_SEND), que são as duas
 *     de cima outra vez — e precisam existir em separado porque o Capacitor
 *     empacota os assets e não traduz o manifesto web em intent-filter. O
 *     arquivo chega por `NativeFileIntakeService`, e é a única das três em que
 *     alguém teve de NAVEGAR até aqui: a intent lança o app em `/`.
 *
 * As três desembocam no mesmo `receive()` de propósito. Uma tela por porta seria
 * a mesma pergunta respondida em três lugares, e os três divergiriam na primeira
 * ferramenta nova.
 *
 * A página NÃO é uma ferramenta: ela não transforma nada. Ela descobre o TIPO do
 * arquivo e mostra o que o produto sabe fazer com aquele tipo — a mesma lista que
 * a cadeia usa (`nextToolsFor`), então uma ferramenta nova aparece aqui sem
 * ninguém editar este arquivo.
 *
 * Sem arquivo nenhum (alguém digitou a URL), vira um seletor comum: solte um
 * arquivo e escolha o que fazer. É a única tela do produto que aceita qualquer
 * tipo e deixa a decisão para depois.
 */
@Component({
  selector: 'app-open-with',
  // Escopado ao componente, como em toda ferramenta: a object URL da prévia
  // morre com a rota. Provido em root, seria o vazamento que a classe existe
  // para fechar.
  providers: [ObjectUrlScope],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DropzoneComponent, IconComponent],
  template: `
    <section class="mx-auto w-full max-w-[880px]">
      <header class="mb-6">
        <h1 class="text-2xl">{{ i18n.t()['open.title'] }}</h1>
        <p class="mt-0.5 text-md text-muted">{{ i18n.t()['open.subtitle'] }}</p>
      </header>

      @if (file(); as incoming) {
        <div class="mb-5 flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-raised text-accent">
            <app-icon name="doc" [size]="19" />
          </span>
          <span class="min-w-0">
            <span class="block truncate text-base font-semibold text-text">{{ incoming.name }}</span>
            <span class="block font-mono tabular text-xs text-muted">{{ kindLabel() }}</span>
          </span>
        </div>

        <!-- VER vem antes de EDITAR, e é essa a ordem certa da pergunta.
             Quem entrega um arquivo ao app pelo "Abrir com" do sistema quase
             sempre quer só olhá-lo; a lista de ferramentas abaixo continua
             inteira para quem quer mudar alguma coisa. Só aparece para o que o
             visualizador sabe desenhar — oferecer "visualizar" um MP3 seria
             abrir uma tela vazia. -->
        @if (previewable()) {
          <button
            type="button"
            (click)="view()"
            class="mb-6 flex w-full items-center gap-3 rounded-lg border border-line bg-surface p-4 text-left
                   transition-all duration-200 hover:-translate-y-0.5 hover:border-accent hover:bg-raised"
          >
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-raised text-accent">
              <app-icon name="expand" [size]="19" />
            </span>
            <span class="min-w-0">
              <span class="block text-base font-semibold text-text">{{ i18n.t()['open.view'] }}</span>
              <span class="mt-0.5 block text-xs text-muted">{{ i18n.t()['open.view_hint'] }}</span>
            </span>
          </button>
        }

        @if (tools().length > 0) {
          <p class="mb-3 text-sm font-medium text-muted">{{ i18n.t()['open.pick_tool'] }}</p>

          <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            @for (tool of tools(); track tool.id) {
              <li>
                <button
                  type="button"
                  (click)="use(tool)"
                  [style.--tone-fg]="'var(--tone-' + tool.tone + '-fg)'"
                  [style.--tone-bg]="'var(--tone-' + tool.tone + '-bg)'"
                  class="group flex h-full w-full items-start gap-3 rounded-lg border border-line bg-surface p-4 text-left
                         transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--tone-fg)] hover:bg-raised"
                >
                  <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--tone-bg)] text-[color:var(--tone-fg)]">
                    <app-icon [name]="tool.icon" [size]="19" />
                  </span>
                  <span class="min-w-0">
                    <span class="block text-base font-semibold text-text group-hover:text-accent">
                      {{ i18n.t()[tool.navKey] }}
                    </span>
                    <span class="mt-0.5 block text-xs text-muted">{{ i18n.t()[tool.descKey] }}</span>
                  </span>
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="text-sm text-muted">{{ i18n.t()['open.no_tool'] }}</p>
        }
      } @else {
        <app-dropzone
          accept="*/*"
          [titleKey]="'open.drag'"
          [hintKey]="'open.drag_hint'"
          (fileSelected)="receive($event)"
        />
      }
    </section>
  `,
})
export class OpenWithComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly workspace = inject(WorkspaceService);
  private readonly viewer = inject(FileViewerService);
  private readonly urls = inject(ObjectUrlScope);
  private readonly router = inject(Router);

  protected readonly file = signal<File | null>(null);

  protected readonly tools = computed<readonly ToolDef[]>(() => {
    const incoming = this.file();
    return incoming ? nextToolsFor(kindOf(incoming), null) : [];
  });

  /**
   * O visualizador sabe desenhar isto?
   *
   * A MESMA lista da barra de arquivo, e não por acaso: imagem e vetor têm
   * pixels prontos, o PDF é rasterizado lá dentro, e áudio, vídeo e binário
   * não têm o que mostrar. Um botão que abre uma tela vazia é pior do que
   * nenhum botão.
   */
  protected readonly previewable = computed(() => {
    const incoming = this.file();
    if (!incoming) return false;
    const kind = kindOf(incoming);
    return kind === 'image' || kind === 'svg' || kind === 'pdf';
  });

  protected readonly kindLabel = computed(() => {
    const incoming = this.file();
    return incoming ? kindOf(incoming).toUpperCase() : '';
  });

  constructor() {
    // `launchQueue` e o depósito do compartilhamento só existem no navegador, e
    // esta rota é PRERENDERIZADA como todas as outras — tocar em `window` no
    // módulo derrubaria o worker de prerender e levaria junto as rotas ainda na
    // fila dele, que é o modo de falha que `app.config.server.ts` teve de
    // instrumentar para ser sequer legível.
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    void takeSharedFile().then((shared) => {
      if (shared) this.receive(shared);
    });

    /**
     * A TERCEIRA ORIGEM: o "Abrir com" do app empacotado.
     *
     * É um EFFECT e não uma leitura no construtor porque esta rota pode já estar
     * aberta quando o segundo arquivo chega — navegar para a mesma URL não
     * reconstrói o componente, e o sintoma seria o pior tipo: tocar "Abrir com"
     * de novo traz o app para a frente mostrando o arquivo ANTERIOR. É a mesma
     * razão pela qual a hidratação da cadeia é effect, e não leitura única.
     *
     * `consume()` é o que impede o laço: o effect relê com `null` e não faz nada.
     */
    const intake = inject(NativeFileIntakeService);
    effect(() => {
      const native = intake.pending();
      if (!native) return;
      this.receive(native);
      intake.consume();
    });

    const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
    queue?.setConsumer(async (params) => {
      const handle = params.files?.[0];
      if (handle) this.receive(await handle.getFile());
    });
  }

  protected receive(file: File): void {
    this.file.set(file);
  }

  /**
   * Abre o arquivo em tela cheia, sem escolher ferramenta nenhuma.
   *
   * Ele entra na SESSÃO antes, e sem id de ferramenta — a guarda de tipo do
   * `WorkspaceService` pergunta se o tool que vai ABRIR o arquivo aceita aquele
   * tipo, e aqui não há tool: é a mesma chamada que o gravador de voz faz, pelo
   * mesmo motivo. Sem isso o visualizador abriria com a lista de destinos vazia,
   * porque ela é derivada do tipo da sessão.
   */
  protected view(): void {
    const incoming = this.file();
    if (!incoming) return;

    this.workspace.load(incoming);

    this.viewer.show({
      name: incoming.name,
      kind: kindOf(incoming),
      // Só o PDF é rasterizado dentro do visualizador; a imagem precisa de
      // pixels prontos, e a object URL vive no escopo desta rota.
      src: kindOf(incoming) === 'pdf' ? null : this.urls.replace(null, incoming),
      file: incoming,
    });
  }

  protected use(tool: ToolDef): void {
    const incoming = this.file();
    if (!incoming) return;

    this.workspace.load(incoming, tool.id);

    const lang = this.i18n.currentLang();
    void this.router.navigateByUrl(`/${lang}/${toolPath(tool, lang)}`);
  }
}

/** Tipos da File Handling API, ainda ausentes do lib.dom do TypeScript 5.7. */
interface LaunchParams {
  readonly files?: readonly FileSystemFileHandle[];
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}
