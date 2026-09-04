import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslationService } from '../services/translation.service';
import { PACKAGED } from './platform';
import { takeNativeFile } from './native-shell';

/**
 * O ARQUIVO QUE CHEGA DE FORA DO APP, e a navegação que ele provoca.
 *
 * O manifesto do Android declara "Abrir com" e a folha de compartilhar, e o
 * `MainActivity` copia o arquivo assim que a intent chega. Falta a metade que
 * este serviço é: alguém tem de PERGUNTAR se há arquivo esperando, e alguém tem
 * de LEVAR a pessoa até a tela que responde "o que fazer com ele?".
 *
 * A tela é a mesma de sempre — `/pt/abrir`, a rota que o Web Share Target e o
 * `file_handlers` do PWA já usavam. Um caminho nativo com tela própria seria uma
 * segunda resposta para a mesma pergunta, e as duas divergiriam na primeira
 * ferramenta nova. O que muda entre o site e o app é só de ONDE o `File` sai.
 *
 * ── PUXA E EMPURRA, PELO MESMO MOTIVO DOS RECUOS ───────────────────────────
 *
 * A intent que LANÇA o app chega antes de existir documento carregado, então o
 * empurrão do nativo se perde justamente na vez que mais importa — é ela que
 * decide se tocar "Abrir com" abre o arquivo ou a tela inicial vazia. Por isso o
 * arranque PERGUNTA (`start`), e o evento cobre o resto: o app já aberto,
 * recebendo um segundo arquivo.
 *
 * ── POR QUE UM SINAL, E NÃO UM `take()` NO CONSTRUTOR DA TELA ──────────────
 *
 * Porque a rota pode JÁ estar aberta. Navegar para a mesma URL não reconstrói o
 * componente, então um arquivo entregue enquanto a pessoa está em `/abrir`
 * nunca seria lido — e o sintoma é o pior tipo: tocar "Abrir com" pela segunda
 * vez traz o app para a frente mostrando o arquivo ANTERIOR. Com sinal, a tela
 * reage nos dois casos pelo mesmo caminho.
 */
@Injectable({ providedIn: 'root' })
export class NativeFileIntakeService {
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslationService);

  private readonly incoming = signal<File | null>(null);

  /** O arquivo esperando para ser lido pela tela de abrir. */
  readonly pending = this.incoming.asReadonly();

  /**
   * Liga a escuta e faz a primeira pergunta.
   *
   * Chamado uma vez, do `app.config.ts`, dentro de `afterNextRender` — como o
   * `syncSafeArea` e pelo mesmo motivo: no prerender não há Capacitor nenhum, e
   * ali isto é código morto que o esbuild remove pela constante de build.
   */
  start(): void {
    // A constante de build, e não uma detecção: sem ela o site registraria um
    // ouvinte para um evento que só o Android dispara — morto, mas embarcado. É
    // a mesma razão pela qual `native-shell.ts` a consulta antes de importar o
    // Capacitor.
    if (!PACKAGED) return;

    window.addEventListener('nadasai:file', () => void this.pull());
    void this.pull();
  }

  /**
   * A tela leu o arquivo.
   *
   * Retirar é obrigatório e não higiene: o sinal é o que dispara a navegação, e
   * um arquivo que fica nele reabriria a tela de abrir a cada volta para a home.
   */
  consume(): void {
    this.incoming.set(null);
  }

  private async pull(): Promise<void> {
    const file = await takeNativeFile();
    if (!file) return;

    this.incoming.set(file);

    // A rota tem nome diferente em cada língua (`abrir` / `open`), e a língua sai
    // do prefixo da URL como em todo o resto do produto. No lançamento a URL
    // ainda é `/`, e aí vale o padrão do serviço — que é o mesmo `pt` para onde
    // o `''` redireciona.
    const lang = this.i18n.currentLang();
    void this.router.navigate(['/', lang, lang === 'en' ? 'open' : 'abrir']);
  }
}
