import {
  ApplicationConfig,
  ErrorHandler,
  Injector,
  afterNextRender,
  inject,
  isDevMode,
  provideAppInitializer,
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { AppErrorHandler } from './core/errors/global-error-handler';
import { PACKAGED } from './core/platform/platform';
import { AppUpdateService } from './core/services/app-update.service';
import { ModelPrefetchService } from './core/services/model-prefetch.service';
import { NetworkProbeService } from './core/services/network-probe.service';
import {
  TranslationService,
  languageFromUrl,
  loadDictionary,
} from './core/services/translation.service';

export const appConfig: ApplicationConfig = {
  providers: [
    /**
     * SEM ZONE.JS.
     *
     * O zone.js monkey-patcha todo callback assíncrono do navegador — timers,
     * eventos, promises, XHR — para disparar uma detecção de mudança GLOBAL a
     * cada um deles. Num app que já é `OnPush` + signals do começo ao fim, esse
     * trabalho é inteiramente redundante: quem avisa o Angular do que mudou é o
     * signal, não o callback que o escreveu.
     *
     * O que isso compra, na ordem em que se mede: ~14 kB gz a menos no bundle
     * inicial, e uma mordida no TBT (825–1349 ms medidos), que é o eixo que
     * segura a nota de performance e vira INP ruim no campo — cada rAF do
     * desenho da waveform, cada progresso de OCR e cada chunk do pdf.js
     * deixavam de custar uma varredura da árvore inteira.
     *
     * O PRÉ-REQUISITO ESTAVA PAGO ANTES DA MUDANÇA, e é o que a torna segura:
     * `NgZone` não aparece em lugar nenhum do código, `fakeAsync`/`tick` não
     * aparecem em nenhum dos 560 specs, e todo componente é OnPush com estado em
     * signal. O que continua marcando para checagem sem zone: os bindings de
     * evento do template, o `async` pipe, os signals e `markForCheck` explícito.
     *
     * O que quebra em zoneless, se algum dia voltar: estado guardado em campo
     * comum (não signal) escrito dentro de `setTimeout`, `requestAnimationFrame`
     * ou callback de biblioteca de terceiro. A tela simplesmente não atualiza —
     * sem erro, como quase tudo que dói neste repositório.
     *
     * `zone.js` continua nos polyfills de TESTE (`angular.json`), de propósito:
     * o TestBed sem zone exige provider próprio em cada spec, e trocar isso é
     * uma mudança independente desta.
     */
    provideExperimentalZonelessChangeDetection(),
    /**
     * Sem isto o Angular não toca no scroll — o padrão de
     * `scrollPositionRestoration` é 'disabled', e o navegador simplesmente
     * mantém o offset da tela anterior. Numa SPA em que toda página de
     * ferramenta termina com a mesma seção de FAQ, o efeito era chegar num
     * tool novo já no meio do FAQ, com o dropzone acima da dobra: parecia que
     * a ferramenta tinha aberto na tela errada.
     *
     * 'enabled' e não 'top' porque os dois casos são diferentes: navegação
     * nova vai para o topo, e voltar pelo botão do navegador devolve o ponto
     * onde a pessoa estava lendo.
     */
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),

    /**
     * Reaproveita o DOM do prerender em vez de jogá-lo fora.
     *
     * Sem isto o Angular descarta o HTML gerado e re-renderiza a página inteira
     * no cliente. Medido na home, em 4G lento com CPU 4x:
     *
     *     +1215 ms   main=5231px  [APP-HERO:5063]   HTML do prerender na tela
     *     +2721 ms   main= 784px  [ ]               o hero SOME, a página esvazia
     *     +3065 ms   main=5652px  [APP-HERO:5484]   volta, renderizado no cliente
     *
     * São ~350 ms de tela vazia no meio do carregamento, e o custo cai em cima
     * das três métricas mais pesadas do Lighthouse ao mesmo tempo: o CLS (0,082,
     * o rodapé subindo e descendo), o LCP (o maior elemento é removido e
     * repintado, o que afastava o LCP do FCP em mais de um segundo) e o TBT
     * (renderizar a home toda de novo é trabalho de main thread que não
     * precisava existir). Juntas, 80% do peso da nota.
     *
     * O que a hidratação exige é que o HTML do servidor case com o que o cliente
     * renderiza. Vale saber onde isso NÃO se aplica aqui: o prerender de uma
     * página de ferramenta não contém canvas, nem cropper, nem sobreposição de
     * região, nem grade de páginas — nada disso existe antes de haver arquivo, e
     * arquivo só entra muito depois da hidratação terminar. O que hidrata é a
     * casca (barra do topo, rail, barra mobile, paleta, medidor), o dropzone
     * vazio e o FAQ.
     *
     * A exceção conhecida é o fallback de SPA: `spa-fallback.mjs` serve `pt.html`
     * para qualquer URL que não casa com arquivo, então nessas o markup do
     * servidor é de outra rota e o mismatch é certo. O Angular loga NG0500 e
     * re-renderiza a subárvore — que é exatamente o que ele já fazia em todas as
     * páginas antes desta linha. Degrada para o comportamento antigo, não para
     * pior.
     */
    provideClientHydration(),

    // Wraps fetch/XHR/sendBeacon/WebSocket to count file egress. Must run before
    // any application code can issue a request, or the instrument has a blind spot.
    provideAppInitializer(() => inject(NetworkProbeService).install()),

    /**
     * Carrega o dicionário do idioma DESTA URL, e segura o bootstrap até ele
     * chegar.
     *
     * Os dois dicionários deixaram de morar dentro do `TranslationService` e
     * viraram chunks próprios (ver o cabeçalho de lá): eram 123 kB brutos /
     * 43,8 kB gz que todo visitante baixava e o parser atravessava, com metade
     * num idioma que ele nunca ia ler. O preço de separá-los é este
     * inicializador, porque `t()` é síncrono em ~750 pontos de template e não
     * pode ser a primeira coisa a descobrir que o texto ainda não chegou.
     *
     * Bloquear o bootstrap é a escolha certa e não um atalho: o alternativo é
     * renderizar a casca sem texto e preenchê-la um quadro depois, que é uma
     * página inteira piscando em branco — e, com hidratação, um mismatch contra
     * um HTML de prerender que JÁ TEM o texto, o que faz o Angular descartar e
     * repintar a subárvore. `scripts/preload-dictionary.mjs` põe um
     * `modulepreload` do chunk certo em cada página gerada, então o download
     * acontece em paralelo com o `main.js` em vez de depois dele.
     *
     * A URL sai do `DOCUMENT` injetado, não de `window`: no prerender não há
     * `window`, e é o platform-server que preenche `document.location` com a
     * rota sendo gerada — é isso que faz cada arquivo nascer com o dicionário
     * certo dentro.
     */
    provideAppInitializer(() => {
      const i18n = inject(TranslationService);
      const lang = languageFromUrl(inject(DOCUMENT).location?.pathname ?? '/pt');
      return loadDictionary(lang).then((dict) => i18n.install(lang, dict));
    }),

    /**
     * O par no navegador do handler que `app.config.server.ts` instala para o
     * prerender: sem ele, uma exceção fora de qualquer `try/catch` de ferramenta
     * era uma linha no console e nada na tela. Ver o arquivo.
     */
    { provide: ErrorHandler, useClass: AppErrorHandler },

    /**
     * The offline claim, made true.
     *
     * Every tool is a lazy route and the AI model is fetched at runtime, so
     * without this, cutting the network and clicking a tool hung forever on a
     * chunk that would never arrive — which made a liar out of the home page's
     * own "turn off your Wi-Fi" invitation.
     *
     * registerWhenStable waits for the app to go quiet before installing, so the
     * prefetch never competes with the first paint. The 30s ceiling is the escape
     * hatch for a page that never stabilises.
     *
     * Only in production builds: ng serve does not emit ngsw-worker.js, and a
     * service worker caching a dev server is a debugging nightmare.
     *
     * O arquivo registrado é `nadasai-sw.js`, e não o `ngsw-worker.js` direto:
     * ele importa o worker do Angular inteiro e acrescenta uma única coisa que o
     * ngsw não faz e não se estende para fazer — atender o POST do Web Share
     * Target, que é como um arquivo compartilhado no Android entra no app. Tudo
     * o mais (precache, atualização, offline) continua sendo o ngsw.
     */
    provideServiceWorker('nadasai-sw.js', {
      // E NUNCA no app empacotado. Ali os arquivos vêm do APK, não da rede:
      // não há nada para pré-cachear, não há deploy novo para detectar, e o
      // registro simplesmente FALHA no WebView — NG05604
      // (SERVICE_WORKER_REGISTRATION_FAILED), medido no emulador. Um erro por
      // inicialização que não informa nada e não conserta nada.
      enabled: !isDevMode() && !PACKAGED,
      registrationStrategy: 'registerWhenStable:30000',
    }),

    /**
     * Watches for a new deploy and swaps to it behind a blocking overlay. No-op
     * without a service worker, so ng serve is unaffected.
     *
     * DEPOIS DA PRIMEIRA RENDERIZAÇÃO, e não durante a inicialização. Como
     * `provideAppInitializer` puro, isto disputava a thread principal exatamente
     * na janela em que o TBT é medido — 825 a 1349 ms de main thread bloqueada,
     * o eixo que segura a nota de performance e vira INP ruim no campo. Nada
     * aqui é urgente: uma versão nova que aparece 200 ms depois é a mesma versão
     * nova. O initializer continua existindo só para abrir o contexto de
     * injeção; quem espera é o `afterNextRender`, que não roda no prerender.
     */
    provideAppInitializer(() => {
      const injector = inject(Injector);
      const updates = inject(AppUpdateService);
      afterNextRender(() => void updates.start(), { injector });
    }),

    /**
     * Pulls the model down once the browser goes idle, so the first background
     * removal is inference-only. Deliberately after the initializers above: the
     * 42 MB must never race the first paint, and never a lazy chunk someone is
     * actually waiting on. Skips itself entirely on a metered or slow link.
     */
    provideAppInitializer(() => {
      const injector = inject(Injector);
      const prefetch = inject(ModelPrefetchService);
      afterNextRender(() => void prefetch.start(), { injector });
    }),
  ],
};
