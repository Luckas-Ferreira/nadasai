import { expect, test } from '@playwright/test';
import { expectDownload, openApp, primary, upload } from './helpers';

test.describe('Crop', () => {
  test('drives cropper.js: ratios, rotate, flip, reset, then applies', async ({ page }) => {
    await openApp(page, '/crop');
    await upload(page);

    // cropper.js takes over the <img> and injects its own box.
    const box = page.locator('.cropper-crop-box');
    await expect(box).toBeVisible({ timeout: 20_000 });

    for (const ratio of ['1:1', '16:9', '4:3', '3:2', 'Free']) {
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

    await page.getByRole('button', { name: 'Rotate' }).click();
    await page.getByRole('button', { name: 'Flip' }).click();
    await page.getByRole('button', { name: 'Reset selection' }).click();
    await expect(box).toBeVisible();

    await primary(page, 'Apply crop').click();

    // The result panel appears and the source stays mounted for a second pass.
    await expect(page.getByRole('img', { name: 'Result' })).toBeVisible({ timeout: 30_000 });
    await expect(box).toBeVisible();

    await expectDownload(page, /^photo-crop\.png$/);
  });

  test('a crop can be re-applied and chained', async ({ page }) => {
    await openApp(page, '/crop');
    await upload(page);
    await expect(page.locator('.cropper-crop-box')).toBeVisible({ timeout: 20_000 });

    await primary(page, 'Apply crop').click();
    await expect(page.getByRole('button', { name: 'Keep editing' })).toBeVisible({ timeout: 30_000 });

    // Re-run with a different ratio without re-uploading.
    await page.getByRole('button', { name: '16:9' }).click();
    await primary(page, 'Apply crop').click();
    await expect(page.getByRole('img', { name: 'Result' })).toBeVisible();

    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByText('photo-crop.png')).toBeVisible();
  });
});
