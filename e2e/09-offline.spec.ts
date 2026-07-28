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
  test('with the network cut, a tool still processes and downloads', async ({ page, context }) => {
    // The file enters through a tool (the home has no uploader), then the chain
    // continues from the home grid — which is also a lazy route, so the offline
    // assertion still covers the thing that used to hang.
    await openApp(page, '/pt/imagem/cortar');
    await serviceWorkerReady(page);

    await upload(page);
    await page.getByRole('link', { name: 'Nada Sai' }).first().click();
    await context.setOffline(true);

    await expect(page.locator('app-network-proof')).toContainText('Você está sem internet');

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
