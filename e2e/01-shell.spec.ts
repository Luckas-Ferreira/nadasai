import { expect, test } from '@playwright/test';
import { NOT_AN_IMAGE, openApp, upload } from './helpers';

test.describe('Shell: home, nav, i18n, theme', () => {
  test('home shows the uploader, the tool grid and the privacy claim', async ({ page }) => {
    await openApp(page);

    await expect(page.getByRole('heading', { name: 'Your files never leave your computer.' })).toBeVisible();
    await expect(page.getByText('Drop an image here')).toBeVisible();
    await expect(page.getByText('Your files never leave your device.')).toBeVisible();

    const rail = page.getByRole('navigation', { name: 'Tools' }).first();
    for (const name of ['Remove background', 'Crop', 'Compress', 'Resize', 'Convert']) {
      await expect(rail.getByRole('link', { name, exact: true })).toBeVisible();
    }
  });

  /**
   * The demo image is the shortest path to the first result, and the person most
   * likely to click it — someone evaluating the product with no file to hand — is
   * the one least likely to give it a second chance. If public/exemplo.jpg ever
   * goes missing, the button stays on screen and throws. This is what catches that.
   */
  test('the sample image loads with one click and enters the chain', async ({ page }) => {
    await openApp(page);

    await page.getByRole('button', { name: 'Use a sample image' }).click();

    await expect(page.getByText('exemplo.jpg')).toBeVisible();
    await expect(page.getByText('What do you want to do with it?')).toBeVisible();

    // No alert: a broken asset surfaces here, not in a console nobody reads.
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('the home frames the tools as one module of a platform, not the whole product', async ({ page }) => {
    await openApp(page);

    await expect(page.getByRole('heading', { name: 'Module: Image' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Coming next' })).toBeVisible();

    // The roadmap is inert: it must never look shippable.
    for (const name of ['PDF', 'Documents', 'Audio']) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
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
    await expect(page.getByRole('heading', { name: 'Seus arquivos não saem do seu computador.' })).toBeVisible();
    await expect(page.getByText('Seus arquivos nunca saem do seu dispositivo.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Seus arquivos não saem do seu computador.' })).toBeVisible();

    await page.getByRole('radiogroup', { name: 'Mudar idioma' }).first().getByRole('radio', { name: 'EN' }).click();
    await expect(page.getByRole('heading', { name: 'Your files never leave your computer.' })).toBeVisible();
  });

  test('a non-image is rejected at the door', async ({ page }) => {
    await openApp(page);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByText(/isn't a supported image/i)).toBeVisible();
    // And nothing entered the chain.
    await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
  });
});
