import { expect, test, type Page } from '@playwright/test';
import { expectDownload, openApp, pickFromHome, primary, upload } from './helpers';

/**
 * The pitch, as a test: pull the plug and keep working.
 *
 * This is the one claim nothing else in the suite can cover. Every tool is a
 * lazy route and the AI model is fetched at runtime, so before the service
 * worker existed, cutting the network and clicking a tool hung forever on a
 * chunk that would never arrive — which made a liar out of the home page's own
 * "turn off your Wi-Fi" invitation, of the PWA claim in the grant form, and of
 * the live unplug-the-internet moment the video pitch is built around.
 *
 * Runs against the production build on :4300 (see playwright.config.ts): the dev
 * server emits no service worker, so under `ng serve` these tests would be
 * asserting against the absence of the thing they exist to prove.
 */
test.use({ baseURL: 'http://localhost:4300' });

/**
 * The worker registers with registerWhenStable, then prefetches every asset
 * group. Going offline before that drains would test the browser's HTTP cache,
 * not the service worker — and would pass for the wrong reason.
 */
async function serviceWorkerReady(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 60_000 });
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'networkidle' });
}

test.describe('Offline', () => {
  /**
   * O manifesto precisa ter o próprio índice em cache — e isso já não foi
   * verdade uma vez.
   *
   * O `ngsw.json` é montado no meio do `ng build`, antes do postbuild que achata
   * o prerender e devolve o `index.html` da raiz. Nesse instante o glob
   * `/index.html` não casava com nada, o manifesto apontava para
   * `/index.csr.html` — que assetGroup nenhum lista — e saía com 340 recursos e
   * ZERO HTML. O worker instalava sem erro, prefetchava tudo, e mesmo assim toda
   * navegação offline caía na rede: o ngsw serve uma navegação entregando o
   * índice do manifesto, e o índice não estava em cache.
   *
   * Os testes abaixo pegam isso, mas só depois de um build inteiro e de dois
   * minutos de inferência. Esta asserção é a mesma falha em duas linhas, e lê o
   * artefato publicado — não a configuração que deveria tê-lo produzido.
   */
  test('o manifesto do service worker tem o índice em cache', async ({ request }) => {
    const manifest = await (await request.get('/ngsw.json')).json();

    expect(manifest.index, 'o manifesto deve apontar para o shell da raiz').toBe('/index.html');
    expect(
      Object.keys(manifest.hashTable),
      `${manifest.index} fora do hashTable: o app não abre offline`,
    ).toContain(manifest.index);
  });

  /**
   * Recarregar sem rede — a falha que as duas provas abaixo NÃO pegam.
   *
   * Elas cortam a rede e seguem navegando pelo router, que é troca de chunk: os
   * chunks estão no hashTable e sempre estiveram, então passavam mesmo com o
   * manifesto sem HTML nenhum. Uma navegação de verdade — recarregar, ou abrir o
   * site já sem rede — é outro caminho: o ngsw a atende servindo o índice do
   * manifesto, e era exatamente esse arquivo que faltava.
   */
  test('recarregar sem rede continua abrindo a ferramenta', async ({ page, context }) => {
    await openApp(page, '/pt/imagem/cortar');
    await serviceWorkerReady(page);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('link', { name: 'Nada Sai' }).first()).toBeVisible();
    // O shell sozinho passaria na linha acima. O input pertence ao componente da
    // ferramenta, que só existe se a rota resolveu e o chunk dela carregou.
    await expect(page.locator('input[type=file]').first()).toBeAttached();
  });

  test('with the network cut, a tool still processes and downloads', async ({ page, context }) => {
    // The file enters through a tool (the home has no uploader), then the chain
    // continues from the home grid — which is also a lazy route, so the offline
    // assertion still covers the thing that used to hang.
    await openApp(page, '/pt/imagem/cortar');
    await serviceWorkerReady(page);

    await upload(page);
    await page.getByRole('link', { name: 'Nada Sai' }).first().click();
    await context.setOffline(true);

    // O medidor viaja com o usuário agora: a leitura fica na pílula da barra do
    // topo e o detalhe abre dentro dela. Estar offline aparece já na pílula,
    // sem precisar abrir nada — é o momento em que a promessa fica mais fácil
    // de acreditar, e escondê-lo atrás de um clique desperdiçaria isso.
    const badge = page.getByRole('button', { name: /Monitor de rede ao vivo/ }).first();
    await expect(badge.locator('app-icon')).toBeVisible();

    await badge.click();
    await expect(page.locator('app-network-proof')).toContainText('Você está sem internet');
    await page.keyboard.press('Escape');

    // Navigating here is the exact thing that used to hang: a lazy chunk.
    await pickFromHome(page, 'Comprimir');
    await primary(page, 'Comprimir').click();
    await expectDownload(page, /^photo-min\.webp$/);
  });

  /**
   * The video-pitch moment, as a test: unplug the internet, on camera, and keep
   * removing backgrounds.
   *
   * This is the acceptance test for the whole engine swap. It only passes because
   * the model is ours now — 42 MB of Apache-2.0 IS-Net served from our own origin
   * and cached by the service worker. On the vendor's AGPL library it could not
   * pass even in principle: the weights came from staticimgly.com at runtime.
   */
  test('the AI removes a background with the network cut', async ({ page, context }) => {
    test.setTimeout(600_000); // a 55 MB cold cache, then two real WASM inference runs

    await openApp(page, '/pt/imagem/cortar');
    await serviceWorkerReady(page);

    // Pass one, online: this is what pulls the model weights into the cache.
    // Arriving with the file already in the chain runs the tool on its own.
    await upload(page);
    await page.getByRole('link', { name: 'Nada Sai' }).first().click();
    await pickFromHome(page, 'Remover fundo');
    // The model is tens of MB, fetched before the first run can even start.
    await page.getByRole('button', { name: 'Baixar' }).waitFor({ timeout: 300_000 });

    await context.setOffline(true);

    // Pass two, offline: a fresh file, so the model genuinely runs again. Dropping
    // it straight onto the tool auto-runs, so there is no button to press here.
    await page.getByRole('button', { name: 'Recomeçar' }).click();
    await upload(page);
    await page.getByRole('button', { name: 'Baixar' }).waitFor({ timeout: 300_000 });

    await expectDownload(page, /^photo-nobg\.png$/);
  });
});
