import { expect, test } from '@playwright/test';
import { expectDownload, openApp, primary, upload } from './helpers';

test.describe('Cortar', () => {
  test('drives cropper.js: ratios, rotate, flip, reset, then applies', async ({ page }) => {
    await openApp(page, '/crop');
    await upload(page);

    // cropper.js takes over the <img> and injects its own box.
    const box = page.locator('.cropper-crop-box');
    await expect(box).toBeVisible({ timeout: 20_000 });

    for (const ratio of ['1:1', '16:9', '4:3', '3:2', 'Livre']) {
      const button = page.getByRole('button', { name: ratio, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
    }

    await page.getByRole('button', { name: '1:1' }).click();

    // Drag the selection to a new corner, so the crop is a real user gesture.
    const bounds = await box.boundingBox();
    if (bounds) {
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 - 60, bounds.y + bounds.height / 2 - 40, { steps: 12 });
      await page.mouse.up();
    }

    await page.getByRole('button', { name: 'Girar' }).click();
    await page.getByRole('button', { name: 'Espelhar' }).click();
    await page.getByRole('button', { name: 'Redefinir seleção' }).click();
    await expect(box).toBeVisible();

    await primary(page, 'Aplicar corte').click();

    // The result panel appears and the source stays mounted for a second pass.
    await expect(page.getByRole('img', { name: 'Resultado' })).toBeVisible({ timeout: 30_000 });
    await expect(box).toBeVisible();

    await expectDownload(page, /^photo-crop\.png$/);
  });

  test('a crop can be re-applied and chained', async ({ page }) => {
    await openApp(page, '/crop');
    await upload(page);
    await expect(page.locator('.cropper-crop-box')).toBeVisible({ timeout: 20_000 });

    await primary(page, 'Aplicar corte').click();
    await expect(page.getByRole('button', { name: 'Editar o resultado' })).toBeVisible({ timeout: 30_000 });

    // The result matches the selection, so there is nothing left to apply.
    await expect(primary(page, 'Aplicar corte')).toBeHidden();

    // Moving the box brings it back: re-run at a different ratio, no re-upload.
    await page.getByRole('button', { name: '16:9' }).click();
    await primary(page, 'Aplicar corte').click();
    await expect(page.getByRole('img', { name: 'Resultado' })).toBeVisible();

    await page.getByRole('button', { name: 'Editar o resultado' }).click();
    await expect(page.locator('app-file-bar')).toContainText('photo-crop.png');
  });
});
