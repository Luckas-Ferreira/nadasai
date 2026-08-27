import { Injectable, computed, signal } from '@angular/core';
import type { FileKind } from '../files/kind';

/**
 * O que o visualizador em tela cheia está mostrando.
 *
 * Duas fontes, e a diferença é qual delas já tem pixels prontos:
 *
 *   * uma IMAGEM chega por `src` — quem abriu já tem a object URL na mão (a
 *     miniatura da barra de arquivo, o palco da ferramenta), então o visualizador
 *     não cunha uma segunda e não precisa do `File`;
 *   * um PDF chega por `file`, porque não existe "src de um PDF" — as páginas são
 *     rasterizadas dentro do visualizador, sob demanda, e é justamente por isso
 *     que a barra de arquivo continua sem miniatura de PDF: carregar o pdf.js em
 *     TODA rota com um documento na sessão custaria caro para desenhar 32px.
 */
export interface ViewerTarget {
  readonly name: string;
  readonly kind: FileKind;
  readonly src: string | null;
  readonly file: File | null;
}

/**
 * Abre e fecha o visualizador, e é só isso que ele guarda.
 *
 * Mesmo desenho do serviço da paleta de comandos: o estado mora aqui porque o
 * componente é renderizado UMA vez na casca (`app.component.html`) — precisa
 * cobrir a tela inteira, e um overlay dentro de uma ferramenta ficaria preso ao
 * contexto de empilhamento dela, que é a armadilha que a barra de arquivo já
 * documenta sobre o `app-top-bar`.
 */
@Injectable({ providedIn: 'root' })
export class FileViewerService {
  private readonly target = signal<ViewerTarget | null>(null);

  readonly current = this.target.asReadonly();
  readonly open = computed(() => this.target() !== null);

  show(target: ViewerTarget): void {
    this.target.set(target);
  }

  close(): void {
    this.target.set(null);
  }
}
