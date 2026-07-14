import { expect, test } from '@playwright/test';
import { expectDownload, openApp, primary, upload } from './helpers';

const rail = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Tools' }).first();

test.describe('The chain', () => {
  test('compress → resize → convert keeps deriving names from the original', async ({ page }) => {
    await openApp(page);

    // Upload once, on the home page, then hand the file down the chain.
    await upload(page);
    await expect(page.getByText('photo.png')).toBeVisible();
    await expect(page.getByText('What do you want to do with it?')).toBeVisible();

    await rail(page).getByRole('link', { name: 'Compress' }).click();
    await expect(page.getByText('Drop an image here')).toHaveCount(0);
    await primary(page, 'Compress').click();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByText('photo-min.webp')).toBeVisible();

    await rail(page).getByRole('link', { name: 'Resize' }).click();
    await page.getByRole('button', { name: '400', exact: true }).click();
    await primary(page, 'Resize').click();
    await page.getByRole('button', { name: 'Keep editing' }).click();

    // Suffixes must not stack: photo.png, never resized-min-photo.webp.
    await expect(page.getByText('photo-resized.webp')).toBeVisible();
    await expect(page.getByText('Compress  →  Resize')).toBeVisible();

    await rail(page).getByRole('link', { name: 'Convert' }).click();
    await page.getByRole('radiogroup', { name: 'Target format' }).getByRole('radio', { name: 'PNG' }).click();
    await primary(page, 'Convert').click();
    await expectDownload(page, /^photo-converted\.png$/);
  });

  test('Clear drops the file everywhere', async ({ page }) => {
    await openApp(page);
    await upload(page);
    await expect(page.getByText('photo.png')).toBeVisible();

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('Or pick a tool')).toBeVisible();

    await rail(page).getByRole('link', { name: 'Crop' }).click();
    await expect(page.getByText('Drop an image here')).toBeVisible();
  });
});
