import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
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
