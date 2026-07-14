import { expect, test } from '@playwright/test';
import { NOT_AN_IMAGE, openApp, upload } from './helpers';

test.describe('Shell: home, nav, i18n, theme', () => {
  test('home shows the uploader, the tool grid and the privacy claim', async ({ page }) => {
    await openApp(page);

    await expect(page.getByRole('heading', { name: 'Image tools' })).toBeVisible();
    await expect(page.getByText('Drop an image here')).toBeVisible();
    await expect(page.getByText('Your images never leave your device.')).toBeVisible();

    const rail = page.getByRole('navigation', { name: 'Tools' }).first();
    for (const name of ['Remove background', 'Crop', 'Compress', 'Resize', 'Convert']) {
      await expect(rail.getByRole('link', { name, exact: true })).toBeVisible();
    }
  });

  test('the rail routes to every tool', async ({ page }) => {
    await openApp(page);
    const rail = page.getByRole('navigation', { name: 'Tools' }).first();

    const routes = [
      { link: 'Remove background', url: '/remove-bg', heading: 'Remove background' },
      { link: 'Crop', url: '/crop', heading: 'Crop' },
      { link: 'Compress', url: '/compress', heading: 'Compress' },
      { link: 'Resize', url: '/resize', heading: 'Resize' },
      { link: 'Convert', url: '/convert', heading: 'Convert' },
    ];

    for (const route of routes) {
      await rail.getByRole('link', { name: route.link, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route.url}$`));
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      await expect(rail.getByRole('link', { name: route.link, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });

  test('language switch swaps the whole dictionary and survives a reload', async ({ page }) => {
    await openApp(page);
    const langs = page.getByRole('radiogroup', { name: 'Change language' }).first();

    await langs.getByRole('radio', { name: 'PT' }).click();
    await expect(page.getByRole('heading', { name: 'Ferramentas de imagem' })).toBeVisible();
    await expect(page.getByText('Suas imagens nunca saem do seu dispositivo.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ferramentas de imagem' })).toBeVisible();

    await page.getByRole('radiogroup', { name: 'Mudar idioma' }).first().getByRole('radio', { name: 'EN' }).click();
    await expect(page.getByRole('heading', { name: 'Image tools' })).toBeVisible();
  });

  test('theme toggle flips the document theme and persists it', async ({ page }) => {
    await openApp(page);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: 'Toggle theme' }).first().click();
    await expect(html).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('a non-image is rejected at the door', async ({ page }) => {
    await openApp(page);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByText(/isn't a supported image/i)).toBeVisible();
    // And nothing entered the chain.
    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
  });
});
