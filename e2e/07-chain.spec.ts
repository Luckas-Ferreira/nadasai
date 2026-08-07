import { expect, test } from '@playwright/test';
import { expectDownload, openApp, pickFromHome, primary, upload } from './helpers';

const rail = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Ferramentas' }).first();

test.describe('The chain', () => {
  test('compress → resize → convert keeps deriving names from the original', async ({ page }) => {
    // Entered through a tool rather than the home: the home has no uploader any
    // more (see the fixme in 01-shell), so the first tool is where a file gets in.
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page);
    await expect(page.getByText('photo.png')).toBeVisible();

    await primary(page, 'Comprimir').click();
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(page.getByText('photo-min.png')).toBeVisible();

    // Landed on the home, mid-chain — and it asks what is next instead of
    // pitching to a first-time visitor again.
    await expect(page.getByText('O que você quer fazer com ela?')).toBeVisible();

    // From the home the grid IS the navigation: the rail is scoped to a module
    // and the home belongs to none.
    await pickFromHome(page, 'Redimensionar');
    await page.getByRole('button', { name: '400', exact: true }).click();
    await primary(page, 'Redimensionar').click();
    await page.getByRole('button', { name: 'Continuar editando' }).click();

    // Suffixes must not stack: photo.png, never resized-min-photo.png.
    await expect(page.getByText('photo-resized.png')).toBeVisible();
    await expect(page.getByText('Comprimir  →  Redimensionar')).toBeVisible();

    await pickFromHome(page, 'Converter');
    await page
      .getByRole('radiogroup', { name: 'Formato de destino' })
      .getByRole('radio', { name: 'PNG' })
      .click();
    await primary(page, 'Converter').click();
    await expectDownload(page, /^photo-converted\.png$/);
  });

  /**
   * The other half of the same guarantee: between two tools of one module you do
   * not have to go home at all. That is what the scoped rail is for, and it has to
   * carry the chain exactly like the home grid does.
   */
  test('the rail hands the file to a sibling tool without going home', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page);
    await primary(page, 'Comprimir').click();
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await pickFromHome(page, 'Redimensionar');

    await rail(page).getByRole('link', { name: 'Converter' }).click();
    await expect(page.getByText('Solte uma imagem aqui')).toHaveCount(0);
    await expect(page.getByText('photo-min.png')).toBeVisible();
  });

  test('Clear drops the file everywhere', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page);
    await expect(page.getByText('photo.png')).toBeVisible();

    // Cleared from the home, because `clear()` empties the chain without routing:
    // a tool reads its source once, at construction, so the one you are standing in
    // keeps showing what it already loaded. "Everywhere" means the NEXT tool.
    await page.getByRole('link', { name: 'Nada Sai' }).first().click();
    await page.getByRole('button', { name: 'Limpar' }).click();

    // The home is back to pitching rather than asking what is next.
    await expect(page.getByText('O que você quer fazer com ela?')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Seus arquivos não saem do seu computador.' }),
    ).toBeVisible();

    await pickFromHome(page, 'Cortar');
    await expect(page.getByText('Solte uma imagem aqui')).toBeVisible();
  });
});
