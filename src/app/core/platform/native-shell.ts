import { PACKAGED } from './platform';

/**
 * A CASCA DO APARELHO — o terceiro consumidor da costura de plataforma, e o
 * único que não faz conta nenhuma: ele só pergunta onde ficam as bordas da tela
 * e manda esconder as barras do sistema.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
 *
 * Do targetSdk 35 em diante o Android desenha o app de BORDA A BORDA, e é o app
 * que tem de recuar. Na web isso seria `env(safe-area-inset-*)` e acabou; no
 * WebView não é, e a diferença é a mesma classe já registrada no
 * `MainActivity.java` a respeito do `crossOriginIsolated`: o `env()` da WebView
 * responde pelo RECORTE DE TELA, não pelas barras do sistema, mesmo com
 * `viewport-fit=cover`. Então quem mede é o lado nativo (`SystemBars.java`), que
 * escreve `--safe-top/right/bottom/left` direto no `documentElement`.
 *
 * O CSS já traz esses tokens com `env(...)` como padrão, então a web continua
 * inteira e este arquivo só SOBRESCREVE onde há aparelho.
 *
 * ── O `insets()` DAQUI NÃO É REDUNDANTE COM O EMPURRÃO NATIVO ───────────────
 *
 * O nativo publica a cada mudança de recuo, mas a primeira mudança acontece
 * antes de existir documento carregado — e é justamente ela que decide se o app
 * "abre torto". Por isso o arranque PEDE uma vez. Depois disso, quem manda é o
 * empurrão (rotação, barra que some, modo imersivo).
 *
 * ── TUDO FALHA PARA O LADO SEGURO ──────────────────────────────────────────
 *
 * Sem empacotamento, sem ponte ou com qualquer exceção, as funções não fazem
 * nada e o CSS fica com o valor de `env()`. O pior caso é o comportamento da
 * web, nunca uma tela com a cromagem no lugar errado.
 */

interface IncomingFile {
  present: boolean;
  path?: string;
  name?: string;
  mimeType?: string;
  size?: number;
}

interface NadaSaiShellPlugin {
  insets(): Promise<{ top: number; right: number; bottom: number; left: number }>;
  immersive(options: { on: boolean }): Promise<void>;
  incomingFile(): Promise<IncomingFile>;
  releaseIncomingFile(): Promise<void>;
}

/**
 * O proxy do plugin, memoizado e SEMPRE dentro de um objeto.
 *
 * O embrulho `{ api }` é o mesmo do `native-matte.ts` e pelo mesmo motivo, que
 * vale a pena repetir porque desfazê-lo não quebra nada de imediato:
 * `registerPlugin` devolve um Proxy que transforma toda leitura de propriedade
 * numa chamada da ponte, então uma promise que resolve COM o proxy faz o motor
 * ler `.then` para saber se é um thenable — e o que aparece no console é
 * `"NadaSaiShell.then() is not implemented on android"`, um erro que nomeia um
 * método que ninguém escreveu.
 *
 * Memoizado porque registrar o mesmo nome duas vezes avisa no console e devolve
 * o proxy que já existia.
 */
interface Shell {
  readonly api: NadaSaiShellPlugin;
  /**
   * Traduz um caminho de arquivo do aparelho numa URL que a WebView consegue
   * buscar. É o servidor local do Capacitor que atende, por
   * `shouldInterceptRequest`, sem abrir socket nenhum — que é a mesma via dos
   * assets e a razão de o app funcionar sem permissão de rede.
   */
  readonly convertFileSrc: (path: string) => string;
}

let bridge: Promise<Shell | null> | undefined;

function shell(): Promise<Shell | null> {
  // Constante de build: no bundle da web o resto é código morto e o esbuild o
  // elimina, junto com o import dinâmico do Capacitor.
  if (!PACKAGED) return Promise.resolve(null);

  bridge ??= import('@capacitor/core')
    .then(({ registerPlugin, Capacitor }) => ({
      api: registerPlugin<NadaSaiShellPlugin>('NadaSaiShell'),
      convertFileSrc: (path: string) => Capacitor.convertFileSrc(path),
    }))
    .catch(() => null);

  return bridge;
}

/**
 * Pede os recuos e os escreve no CSS.
 *
 * Escrever aqui e não devolver o valor é deliberado: quem consome isto é o
 * layout, em `styles.css`, e um segundo caminho (um signal lido por templates)
 * daria duas fontes para a mesma medida — a que diverge no dia em que uma delas
 * não for atualizada.
 */
export async function syncSafeArea(): Promise<void> {
  const native = await shell();
  if (!native) return;

  try {
    const insets = await native.api.insets();
    const root = document.documentElement.style;
    root.setProperty('--safe-top', `${insets.top}px`);
    root.setProperty('--safe-right', `${insets.right}px`);
    root.setProperty('--safe-bottom', `${insets.bottom}px`);
    root.setProperty('--safe-left', `${insets.left}px`);
  } catch {
    // Sem recuos medidos o CSS fica com o `env()`, que no pior caso é zero: o
    // app desenha por baixo das barras, exatamente como antes desta mudança.
  }
}

/**
 * Esconde ou devolve a barra de status e a de navegação.
 *
 * É o que separa uma página que ocupa a tela de um visualizador de galeria. Só o
 * `app-file-viewer` chama, e ele é quem garante o par: entrar ao abrir, sair ao
 * fechar, inclusive quando o componente é destruído por navegação.
 */
export async function setImmersive(on: boolean): Promise<void> {
  const native = await shell();
  if (!native) return;

  try {
    await native.api.immersive({ on });
  } catch {
    // Uma barra que não escondeu é uma tela cheia menos bonita. Uma exceção
    // aqui derrubaria a abertura do visualizador, que é muito pior.
  }
}

/**
 * O arquivo que o sistema entregou pelo "Abrir com" ou pela folha de
 * compartilhar, ou `null` — que é a resposta em quase todo lançamento.
 *
 * ── OS BYTES NÃO ATRAVESSAM A PONTE ────────────────────────────────────────
 *
 * O nativo devolve METADADO e um caminho; quem lê o conteúdo é a própria
 * WebView, buscando a URL do servidor local. É deliberado: a ponte serializa em
 * JSON, então um vídeo de centenas de MB viraria base64 — um terço maior, em
 * memória, duas vezes. Aqui o `fetch` entrega um `Blob` que o navegador respalda
 * em disco enquanto pode.
 *
 * `takeSharedFile` faz a mesma coisa do lado web, pelo mesmo motivo, e é por
 * isso que as duas se parecem: as duas RETIRAM. A leitura apaga a cópia do
 * cache do aparelho — num produto cujo argumento é que nada fica guardado, o
 * arquivo de outra pessoa esquecido ali seria vazamento local, mas real.
 *
 * O `release` roda mesmo se o `fetch` falhar: o que não dá para fazer é deixar
 * o arquivo para trás porque a leitura deu errado.
 */
export async function takeNativeFile(): Promise<File | null> {
  const native = await shell();
  if (!native) return null;

  try {
    const incoming = await native.api.incomingFile();
    if (!incoming.present || !incoming.path) return null;

    try {
      const response = await fetch(native.convertFileSrc(incoming.path));
      const blob = await response.blob();
      return new File([blob], incoming.name ?? 'arquivo', { type: incoming.mimeType ?? '' });
    } finally {
      await native.api.releaseIncomingFile();
    }
  } catch {
    // Sem arquivo, o app abre normalmente. Uma tela de erro sobre uma intent que
    // a pessoa não sabe que existe é pior do que a tela inicial.
    return null;
  }
}
