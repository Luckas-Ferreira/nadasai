import { ErrorHandler, Injectable, Injector, inject, signal } from '@angular/core';
import { TranslationService } from '../services/translation.service';
import { toMessageKey } from '../errors';

/**
 * O que sobra depois que todo `try/catch` do produto já falou.
 *
 * Cada ferramenta mapeia as próprias falhas para um `errorKey` e as mostra num
 * `<app-alert>` — essa é a regra da casa, e ela cobre o caminho previsto. O que
 * ela não cobre é o imprevisto: uma exceção dentro de um `effect`, de um
 * callback de biblioteca, de um `subscribe` sem catch, ou uma promise rejeitada
 * que ninguém esperava. Sem um handler global, esses casos viravam uma linha
 * vermelha no console e NADA na tela — que é literalmente o defeito mais comum
 * que este repositório já teve, agora sem lugar para acontecer.
 *
 * O `app.config.server.ts` já instalava um handler equivalente para o prerender,
 * e pelo mesmo motivo: o Angular engolia a exceção e o build só dizia "erro ao
 * prerenderizar a rota X". Este é o par dele no navegador.
 *
 * O texto reaproveita `toMessageKey`, então uma falha conhecida que escapou do
 * catch da ferramenta ainda aparece com o nome certo; o resto cai em
 * `error.generic`. O console continua recebendo o erro cru — quem depura precisa
 * do stack, e o usuário não.
 */
@Injectable({ providedIn: 'root' })
export class GlobalErrorService {
  private readonly i18n = inject(TranslationService);

  private readonly _message = signal<string | null>(null);
  readonly message = this._message.asReadonly();

  report(error: unknown): void {
    try {
      this._message.set(this.i18n.t()[toMessageKey(error)]);
    } catch {
      // Traduzir não pode ser a coisa que quebra o tratamento de erro.
      this._message.set(null);
    }
  }

  dismiss(): void {
    this._message.set(null);
  }
}

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  /**
   * O `Injector`, e não o serviço direto — a diferença é a única razão pela qual
   * isto funciona.
   *
   * O `ErrorHandler` é construído durante o bootstrap, antes de quase tudo.
   * Injetar `GlobalErrorService` como campo arrastava o `TranslationService`
   * junto, que depende do `Router`, que por sua vez alcança o `ErrorHandler`:
   * ciclo de DI, `NG0200`. E o modo de falha é cruel — o handler quebra ao ser
   * criado, então TODA exceção posterior vira NG0200 no console e o erro
   * original desaparece. Foi assim que ele escondeu um defeito de produção por
   * um build inteiro.
   *
   * Resolvendo pelo injector dentro do `handleError`, o serviço só é criado no
   * primeiro erro de verdade — quando o app já está de pé e não há ciclo.
   */
  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    console.error(error);

    try {
      this.injector.get(GlobalErrorService).report(error);
    } catch {
      // Um handler de erro que lança é pior do que não ter handler.
    }
  }
}
