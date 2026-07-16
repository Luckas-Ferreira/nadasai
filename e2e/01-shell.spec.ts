import { expect, test } from '@playwright/test';
import { NOT_AN_IMAGE, openApp, upload } from './helpers';

test.describe('Shell: home, nav, i18n, theme', () => {
  test('home shows the uploader, the tool grid and the privacy claim', async ({ page }) => {
    await openApp(page);

    await expect(page.getByRole('heading', { name: 'Seus arquivos não saem do seu computador.' })).toBeVisible();
    await expect(page.getByText('Solte uma imagem aqui')).toBeVisible();
    await expect(page.getByText('Seus arquivos nunca saem do seu dispositivo.')).toBeVisible();

    const rail = page.getByRole('navigation', { name: 'Ferramentas' }).first();
    for (const name of ['Remover fundo', 'Cortar', 'Comprimir', 'Redimensionar', 'Converter']) {
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

    await page.getByRole('button', { name: 'Usar uma imagem de exemplo' }).click();

    await expect(page.getByText('exemplo.jpg')).toBeVisible();
    await expect(page.getByText('O que você quer fazer com ela?')).toBeVisible();

    // No alert: a broken asset surfaces here, not in a console nobody reads.
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('the home frames the tools as one module of a platform, not the whole product', async ({ page }) => {
    await openApp(page);

    await expect(page.getByRole('heading', { name: 'Módulo: Imagem' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Em breve' })).toBeVisible();

    // The roadmap is inert: it must never look shippable.
    for (const name of ['PDF', 'Documentos', 'Áudio']) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
    }
  });

  test('the rail routes to every tool', async ({ page }) => {
    await openApp(page);
    const rail = page.getByRole('navigation', { name: 'Ferramentas' }).first();

    const routes = [
      { link: 'Remover fundo', url: '/remove-bg', heading: 'Remover fundo' },
      { link: 'Cortar', url: '/crop', heading: 'Cortar' },
      { link: 'Comprimir', url: '/compress', heading: 'Comprimir' },
      { link: 'Redimensionar', url: '/resize', heading: 'Redimensionar' },
      { link: 'Converter', url: '/convert', heading: 'Converter' },
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

  /**
   * Portuguese-only, for now. The picker is gone, and a language left in storage
   * by an earlier visit must not bring English back — there would be no way left
   * to switch off it.
   */
  test('is Portuguese-only and a stored language cannot override it', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('imgwork.lang', 'en'));
    await openApp(page);

    await expect(page.getByRole('radiogroup', { name: 'Mudar idioma' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Seus arquivos não saem do seu computador.' })).toBeVisible();
    await expect(page.getByText('Seus arquivos nunca saem do seu dispositivo.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Seus arquivos não saem do seu computador.' })).toBeVisible();
  });

  test('a non-image is rejected at the door', async ({ page }) => {
    await openApp(page);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByText(/não é uma imagem suportada/i)).toBeVisible();
    // And nothing entered the chain.
    await expect(page.getByRole('button', { name: 'Limpar' })).toHaveCount(0);
  });
});
