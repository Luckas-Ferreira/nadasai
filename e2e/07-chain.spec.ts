import { expect, test } from '@playwright/test';
import { expectDownload, openApp, primary, upload } from './helpers';

const rail = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Ferramentas' }).first();

test.describe('The chain', () => {
  test('compress → resize → convert keeps deriving names from the original', async ({ page }) => {
    await openApp(page);

    // Upload once, on the home page, then hand the file down the chain.
    await upload(page);
    await expect(page.getByText('photo.png')).toBeVisible();
    await expect(page.getByText('O que você quer fazer com ela?')).toBeVisible();

    await rail(page).getByRole('link', { name: 'Comprimir' }).click();
    await expect(page.getByText('Solte uma imagem aqui')).toHaveCount(0);
    await primary(page, 'Comprimir').click();
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(page.getByText('photo-min.webp')).toBeVisible();

    await rail(page).getByRole('link', { name: 'Redimensionar' }).click();
    await page.getByRole('button', { name: '400', exact: true }).click();
    await primary(page, 'Redimensionar').click();
    await page.getByRole('button', { name: 'Continuar editando' }).click();

    // Suffixes must not stack: photo.png, never resized-min-photo.webp.
    await expect(page.getByText('photo-resized.webp')).toBeVisible();
    await expect(page.getByText('Comprimir  →  Redimensionar')).toBeVisible();

    await rail(page).getByRole('link', { name: 'Converter' }).click();
    await page.getByRole('radiogroup', { name: 'Formato de destino' }).getByRole('radio', { name: 'PNG' }).click();
    await primary(page, 'Converter').click();
    await expectDownload(page, /^photo-converted\.png$/);
  });

  test('Clear drops the file everywhere', async ({ page }) => {
    await openApp(page);
    await upload(page);
    await expect(page.getByText('photo.png')).toBeVisible();

    await page.getByRole('button', { name: 'Limpar' }).click();
    await expect(page.getByRole('heading', { name: 'Módulo: Imagem' })).toBeVisible();
    await expect(page.getByText('O que você quer fazer com ela?')).toHaveCount(0);

    await rail(page).getByRole('link', { name: 'Cortar' }).click();
    await expect(page.getByText('Solte uma imagem aqui')).toBeVisible();
  });
});
