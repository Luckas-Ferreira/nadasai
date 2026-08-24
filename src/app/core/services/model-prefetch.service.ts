import { Injectable, computed, inject, signal } from '@angular/core';
import { BackgroundRemovalService } from './background-removal.service';
import { PackService } from './pack.service';

/**
 * Pulls the 42 MB of model weights down while the user is doing something else,
 * so the first background removal is inference-only instead of a two-minute wait.
 *
 * Why this is a separate service from BackgroundRemovalService: that one is
 * deliberately free of UI signals, because it once held them as a root singleton
 * and two concurrent runs fought over the same progress signal. That reasoning is
 * about *per-run* state, which still belongs to the component. A download is the
 * opposite kind of thing — it is global, idempotent, and outlives navigation, so
 * it needs a home that also outlives navigation. Keeping it here means the rule
 * over there stays intact.
 *
 * The download itself is not duplicated: this calls the same memoised session
 * promise the real run awaits, so a prefetch in flight *is* the first run's
 * download, not a second copy of it.
 */

/** Chrome-only, and absent in Firefox/Safari — hence the hand-rolled shape. */
interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * `downloading` means the network is being used and the user should be told.
 * `warming` is the same work with the bytes already on disk — it costs them
 * nothing, so it says nothing.
 */
export type PrefetchState = 'idle' | 'downloading' | 'warming' | 'ready' | 'skipped';

/**
 * How long to wait for the service worker to take control before giving up and
 * fetching anyway. Comfortably past registerWhenStable's own 30s ceiling.
 */
const SW_WAIT_MS = 40_000;

@Injectable({ providedIn: 'root' })
export class ModelPrefetchService {
  private readonly removal = inject(BackgroundRemovalService);
  private readonly packs = inject(PackService);

  private readonly state = signal<PrefetchState>('idle');
  private readonly percent = signal(0);

  readonly downloading = computed(() => this.state() === 'downloading');
  readonly progress = computed(() => this.percent());

  private started = false;

  /**
   * Kicks the download off once the browser is idle.
   *
   * Idle, not eager: the model must never compete with the first paint or with a
   * lazy tool chunk the user is actually waiting on. requestIdleCallback is the
   * whole reason this is polite — the fallback timer exists for Safari, which
   * still does not ship it.
   */
  start(): void {
    // A geração estática roda este mesmo app no Node, uma vez por rota, e lá
    // não existe `navigator` — `shouldSkip()` o lê na primeira linha e
    // derrubaria o build inteiro. Baixar 42 MB de pesos também não faria
    // sentido nenhum num processo que só quer o HTML e é descartado em seguida.
    if (typeof window === 'undefined') return;

    if (this.started) return;
    this.started = true;

    if (this.shouldSkip()) {
      this.state.set('skipped');
      return;
    }

    const run = () => void this.waitForServiceWorker().then(() => this.download());
    if ('requestIdleCallback' in window) {
      requestIdleCallback(run, { timeout: 10_000 });
    } else {
      setTimeout(run, 3_000);
    }
  }

  /**
   * Do not start until the service worker is actually in charge of fetches.
   *
   * The `ai` asset group is lazy: ngsw only ever caches the weights if the
   * request passes through it. Idle arrives long before registration does
   * (registerWhenStable), so an ungated prefetch fetched 44 MB straight past the
   * worker — nothing was cached, and the next visit paid for it all over again.
   * Measured: the `ai` cache stayed empty, and the bar appeared twice.
   *
   * The timeout is the escape hatch for a browser with no service worker at all
   * (Firefox private mode, an insecure origin, ng serve). There the download will
   * not be cached by ngsw whatever we do, and warming the session is still worth
   * more than refusing to start.
   */
  private waitForServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator) || navigator.serviceWorker.controller) return Promise.resolve();

    return new Promise((resolve) => {
      const done = () => resolve();
      navigator.serviceWorker.addEventListener('controllerchange', done, { once: true });
      setTimeout(done, SW_WAIT_MS);
    });
  }

  /**
   * Someone is paying for these bytes, and it is not us.
   *
   * Three reasons to not spend them, and only the first was here originally:
   *
   *   1. THE LINK. 42 MB pushed onto a metered phone that only came to crop a
   *      photo is a real cost to a real person. When the browser says the user
   *      asked for data saving, or that the link is 2g/3g, we do not spend it.
   *   2. THE SETTING. `/pt/configuracoes` now has a switch, on by default — this
   *      prefetch is what makes the first cutout inference-only instead of a
   *      42 MB wait, so the old behaviour stayed the default. Turning it off has
   *      to be obeyed, or the switch is decoration.
   *   3. THE HAND. Removing the AI package on that page writes a marker, and this
   *      reads it. Without that check the 42 MB came straight back on the next
   *      idle visit, and the remove button looked broken — the user did exactly
   *      what the screen offered and the screen undid it.
   *
   * In all three cases the model still downloads ON DEMAND, which is exactly the
   * behaviour that existed before this service.
   */
  private shouldSkip(): boolean {
    if (!this.packs.autoDownloadEnabled()) return true;
    if (this.packs.wasRemovedByHand('remove-bg')) return true;

    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!conn) return false;
    if (conn.saveData) return true;
    return conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g' || conn.effectiveType === '3g';
  }

  private async download(): Promise<void> {
    // Only claim to be downloading when bytes actually come off the network.
    //
    // Warming re-reads the weights on every load, and once they are cached that
    // read is 44 MB out of local disk and zero out of the network (measured:
    // transferSize 0). Reporting that as a download told the user, every single
    // refresh, that we were pulling 44 MB down — on a page whose whole argument
    // is that it tells the truth about network traffic. It was the bar that was
    // wrong, never the cache.
    this.state.set((await this.isCached()) ? 'warming' : 'downloading');

    await this.removal.prefetch((fraction) => this.percent.set(Math.round(fraction * 100)));

    // prefetch() resolves either way — it swallows its own errors, because an
    // opportunistic download must not raise an alarm the user did not ask for.
    // Either way the bar goes away; a failed one just re-downloads on demand.
    this.percent.set(100);
    this.state.set('ready');
  }

  /**
   * Has the service worker already got the weights?
   *
   * caches.match() searches every cache, so it finds ngsw's own without knowing
   * how ngsw names things. The manifest is the cheap proxy for the whole set: it
   * is fetched first and cached in the same lazy group as the parts, so if it is
   * there, they are too. Any error means "assume not cached", which at worst
   * shows a bar that was not needed — never the reverse.
   */
  private async isCached(): Promise<boolean> {
    if (!('caches' in window)) return false;
    try {
      const url = new URL('model/isnet-q8.manifest.json', document.baseURI).href;
      // `ignoreVary` porque desde a tela de configuração esta entrada pode ter
      // sido escrita pela PÁGINA (`cache.put(url, …)`, Request sem headers) e
      // carregar o `Vary` da resposta original. Um match padrão então erraria e a
      // barra voltaria a dizer "baixando 42 MB" sobre bytes que já estão em
      // disco — que é exatamente o defeito que este método existe para não ter.
      return !!(await caches.match(url, { ignoreVary: true }));
    } catch {
      return false;
    }
  }
}
