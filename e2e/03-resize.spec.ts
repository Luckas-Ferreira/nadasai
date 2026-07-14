import { expect, test } from '@playwright/test';
import { expectDownload, openApp, primary, upload } from './helpers';

const width = (page: import('@playwright/test').Page) => page.getByRole('spinbutton').first();
const height = (page: import('@playwright/test').Page) => page.getByRole('spinbutton').last();

test.describe('Resize', () => {
  test('hydrates the real dimensions and keeps the aspect ratio locked', async ({ page }) => {
    await openApp(page, '/resize');
    await upload(page);

    // 800×600 is the fixture; the fields must reflect the decoded image, not a guess.
    await expect(width(page)).toHaveValue('800');
    await expect(height(page)).toHaveValue('600');
    // Both dl rows read 800 × 600 before a resize; the first is the source.
    await expect(page.getByRole('definition').filter({ hasText: '800 × 600' }).first()).toBeVisible();

    await width(page).fill('400');
    await width(page).blur();
    await expect(height(page)).toHaveValue('300');
  });

  test('unlocking lets the dimensions diverge, and a preset drives the longest side', async ({ page }) => {
    await openApp(page, '/resize');
    await upload(page);

    await page.getByRole('button', { name: 'Aspect ratio locked' }).click();
    await expect(page.getByRole('button', { name: 'Aspect ratio unlocked' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await width(page).fill('320');
    await width(page).blur();
    await expect(height(page)).toHaveValue('600');

    await page.getByRole('button', { name: 'Aspect ratio unlocked' }).click();
    await page.getByRole('button', { name: '1280', exact: true }).click();
    await expect(width(page)).toHaveValue('1280');
    await expect(height(page)).toHaveValue('960');
  });

  test('resizes and downloads a PNG at the requested box', async ({ page }) => {
    await openApp(page, '/resize');
    await upload(page);

    await page.getByRole('button', { name: '400', exact: true }).click();
    await primary(page, 'Resize').click();

    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('img', { name: 'Result' })).toBeVisible();

    // Upscaling must work too — the old maxWidthOrHeight path silently no-opped.
    await page.getByRole('button', { name: '1920', exact: true }).click();
    await primary(page, 'Resize').click();
    await expect(page.getByText('1920 × 1440')).toBeVisible();

    await expectDownload(page, /^photo-resized\.png$/);
  });
});
