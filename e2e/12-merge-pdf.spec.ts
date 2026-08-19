import { expect, test } from '@playwright/test';
import { DOC_A, DOC_B, expectDownload, openApp, primary } from './helpers';

const PATH = '/pt/pdf/juntar';

/** Scoped to the page strip: the shell's nav is a list of <li> too. */
const pages = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: 'Páginas' }).getByRole('listitem');

/** Thumbnails go through pdf.js, so the first render is slower than a file read. */
const READY = { timeout: 45_000 };

test.describe('Juntar PDF', () => {
  test('flattens every source into one page list, in file order', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles([DOC_A, DOC_B]);

    // Two 2-page PDFs become four pages, each labelled by its source document —
    // which is the only thing that makes the order observable.
    await expect(pages(page)).toHaveCount(4, READY);
    await expect(pages(page).nth(0).getByRole('img')).toHaveAttribute('alt', 'doc-a.pdf · 1');
    await expect(pages(page).nth(1).getByRole('img')).toHaveAttribute('alt', 'doc-a.pdf · 2');
    await expect(pages(page).nth(2).getByRole('img')).toHaveAttribute('alt', 'doc-b.pdf · 1');
    await expect(pages(page).nth(3).getByRole('img')).toHaveAttribute('alt', 'doc-b.pdf · 2');
  });

  test('follows the arranged order, and names the file after page one', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles([DOC_A, DOC_B]);
    await expect(pages(page)).toHaveCount(4, READY);

    // Walk doc-b's first page to the front. The output name comes off page one,
    // so the rename is what proves the new order reached the encode.
    await pages(page).nth(2).getByRole('button', { name: 'Mover para antes' }).click();
    await pages(page).nth(1).getByRole('button', { name: 'Mover para antes' }).click();
    await expect(pages(page).nth(0).getByRole('img')).toHaveAttribute('alt', 'doc-b.pdf · 1');

    // pdf-lib is a dynamic import, so this also exercises the lazy chunk.
    await primary(page, 'Juntar PDFs').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    await expectDownload(page, /^doc-b-merged\.pdf$/);
  });

  test('re-offers the run when the order or a rotation changes', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles([DOC_A]);
    await expect(pages(page)).toHaveCount(2, READY);

    await primary(page, 'Juntar PDFs').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    // Same pages, same rotations: pressing it again could only rebuild identical bytes.
    await expect(primary(page, 'Juntar PDFs')).toBeHidden();

    await pages(page).nth(0).getByRole('button', { name: 'Mover para depois' }).click();
    await expect(primary(page, 'Juntar PDFs')).toBeVisible();

    await primary(page, 'Juntar PDFs').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);
    await expect(primary(page, 'Juntar PDFs')).toBeHidden();

    // Rotation feeds the merge too, so it has to invalidate the result as well.
    await pages(page).nth(0).getByRole('button', { name: /^Girar 90°/ }).click();
    await expect(primary(page, 'Juntar PDFs')).toBeVisible();
  });

  test('removing a page drops it and invalidates the result', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles([DOC_A]);
    await expect(pages(page)).toHaveCount(2, READY);

    await primary(page, 'Juntar PDFs').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    await pages(page).nth(0).getByRole('button', { name: /^Remover/ }).click();

    await expect(pages(page)).toHaveCount(1);
    await expect(pages(page).nth(0).getByRole('img')).toHaveAttribute('alt', 'doc-a.pdf · 2');
    // The PDF on screen no longer matches the list, so it must not stay downloadable.
    await expect(page.getByRole('button', { name: 'Baixar' })).toHaveCount(0);
  });
});
