import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';
import { AppUpdateService } from './core/services/app-update.service';
import { ModelPrefetchService } from './core/services/model-prefetch.service';
import { NetworkProbeService } from './core/services/network-probe.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
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
     */
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),

    /**
     * Watches for a new deploy and swaps to it behind a blocking overlay. No-op
     * without a service worker, so ng serve is unaffected.
     */
    provideAppInitializer(() => inject(AppUpdateService).start()),

    /**
     * Pulls the model down once the browser goes idle, so the first background
     * removal is inference-only. Deliberately after the initializers above: the
     * 42 MB must never race the first paint, and never a lazy chunk someone is
     * actually waiting on. Skips itself entirely on a metered or slow link.
     */
    provideAppInitializer(() => inject(ModelPrefetchService).start()),
  ],
};
