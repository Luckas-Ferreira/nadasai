import { expect, test } from '@playwright/test';
import { PHOTO, PHOTO_TALL, expectDownload, openApp, primary } from './helpers';

const PATH = '/pt/imagem/para-pdf';

/** Scoped to the page strip: the shell's nav is a list of <li> too. */
const pages = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: 'Páginas' }).getByRole('listitem');

test.describe('Imagens para PDF', () => {
  test('builds a multi-page PDF and names it after the FIRST page', async ({ page }) => {
    await openApp(page, PATH);

    // The only multi-file dropzone in the app: both images arrive in one pick.
    await page.locator('input[type=file]').first().setInputFiles([PHOTO, PHOTO_TALL]);

    await expect(pages(page)).toHaveCount(2);
    await expect(pages(page).nth(0).getByRole('img')).toHaveAttribute('alt', 'photo.png');
    await expect(pages(page).nth(1).getByRole('img')).toHaveAttribute('alt', 'photo-tall.png');

    // Reordering is the point of the tool, so the output has to follow it — and the
    // filename comes off page one, which is what makes the new order observable.
    await pages(page).nth(1).getByRole('button', { name: 'Mover para antes' }).click();
    await expect(pages(page).nth(0).getByRole('img')).toHaveAttribute('alt', 'photo-tall.png');

    // jspdf is a dynamic import, so this also exercises the lazy chunk.
    await primary(page, 'Gerar PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible({ timeout: 45_000 });

    // A PDF is terminal: it cannot re-enter the editing chain.
    await expect(page.getByRole('button', { name: 'Editar o resultado' })).toHaveCount(0);

    await expectDownload(page, /^photo-tall-pdf\.pdf$/);
  });

  test('re-offers the run only when something the encode reads has changed', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles([PHOTO, PHOTO_TALL]);

    await primary(page, 'Gerar PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible({ timeout: 45_000 });

    // Same list, same settings: pressing it again could only rebuild identical bytes.
    await expect(primary(page, 'Gerar PDF')).toBeHidden();

    await pages(page).nth(0).getByRole('button', { name: 'Mover para depois' }).click();
    await expect(primary(page, 'Gerar PDF')).toBeVisible();

    await primary(page, 'Gerar PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible({ timeout: 45_000 });
    await expect(primary(page, 'Gerar PDF')).toBeHidden();

    // The page size feeds the encode too.
    await page
      .getByRole('radiogroup', { name: 'Tamanho da página' })
      .getByRole('radio', { name: 'Da imagem' })
      .click();
    await expect(primary(page, 'Gerar PDF')).toBeVisible();
  });

  test('removing a page drops it from the list and invalidates the result', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles([PHOTO, PHOTO_TALL]);

    await primary(page, 'Gerar PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible({ timeout: 45_000 });

    await pages(page).nth(0).getByRole('button', { name: /^Remover/ }).click();

    await expect(pages(page)).toHaveCount(1);
    await expect(pages(page).nth(0).getByRole('img')).toHaveAttribute('alt', 'photo-tall.png');
    // The PDF on screen no longer matches the list, so it must not stay downloadable.
    await expect(page.getByRole('button', { name: 'Baixar' })).toHaveCount(0);
  });
});
