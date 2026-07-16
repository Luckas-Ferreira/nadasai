import { expect, test } from '@playwright/test';
import { expectDownload, openApp, primary, upload } from './helpers';

test.describe('Remover fundo', () => {
  // IS-Net runs as WASM in the browser, and the first run also pulls 55 MB of
  // weights and runtime off our own origin: minutes, not seconds.
  test.setTimeout(420_000);

  test('runs the model locally, offers backdrops and downloads the cutout', async ({ page }) => {
    await openApp(page, '/remove-bg');
    await upload(page);

    await primary(page, 'Remover fundo').click();

    // No assertion on the "Working…" label: with a warm model cache the run can
    // finish before the expect polls, and a racy check is worse than none.

    // A cutout means the transparent-vs-original compare slider.
    await expect(page.getByRole('slider', { name: 'Original / Result' })).toBeVisible({
      timeout: 360_000,
    });

    const backdrops = page.getByRole('button', { name: /^(#|Transparent)/ });
    await expect(backdrops.first()).toBeVisible();

    // Picking a solid backdrop swaps the slider for a flat preview.
    await backdrops.nth(1).click();
    await expect(page.getByRole('img', { name: 'Resultado' })).toBeVisible();

    await page.getByRole('button', { name: 'Transparente' }).click();
    await expect(page.getByRole('slider', { name: 'Original / Result' })).toBeVisible();

    await expectDownload(page, /^photo-nobg\.png$/);
  });
});
