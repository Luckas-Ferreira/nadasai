import { expect, test } from '@playwright/test';
import { DOC_A, PHOTO, drawRegion, expectDownload, openApp, primary, upload } from './helpers';

const IMAGE_PATH = '/pt/privacidade/censurar-imagem';
const PDF_PATH = '/pt/privacidade/censurar-pdf';

/** Rebuilding every page as a raster is the slow part. */
const READY = { timeout: 60_000 };

test.describe('Censurar imagem', () => {
  test('exports only after a box is drawn', async ({ page }) => {
    await openApp(page, IMAGE_PATH);
    await upload(page, PHOTO);

    // Nothing drawn is nothing to redact: the button exists but cannot run, so
    // pressing it could only produce a copy of the input.
    await expect(primary(page, 'Baixar Imagem Censurada')).toBeDisabled();

    await drawRegion(page, { x: 0.2, y: 0.3 }, { x: 0.6, y: 0.55 });
    await expect(page.getByText('1 Áreas censuradas')).toBeVisible();

    await primary(page, 'Baixar Imagem Censurada').click();
    await expectDownload(page, /^photo-redacted\.png$/);
  });

  test('undo and clear take the boxes back off', async ({ page }) => {
    await openApp(page, IMAGE_PATH);
    await upload(page, PHOTO);

    await drawRegion(page, { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 });
    await drawRegion(page, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.7 });
    await expect(page.getByText('2 Áreas censuradas')).toBeVisible();

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect(page.getByText('1 Áreas censuradas')).toBeVisible();

    await page.getByRole('button', { name: 'Limpar Tudo' }).click();
    await expect(page.getByText('0 Áreas censuradas')).toBeVisible();
    await expect(primary(page, 'Baixar Imagem Censurada')).toBeDisabled();
  });
});

test.describe('Censurar PDF', () => {
  /**
   * The whole point of this tool is that the result is a raster: a black
   * rectangle drawn over a text layer leaves the text in the file, which is how
   * "redacted" documents leak. The filename is the cheap half of the proof; the
   * expensive half is pinned in pdf-redactor.service.spec.ts.
   */
  test('redacts a page and rebuilds the document', async ({ page }) => {
    await openApp(page, PDF_PATH);
    await upload(page, DOC_A);

    // The first page is rendered before anything can be drawn on it.
    // The host element is inline and has no box of its own; the layer inside it
    // is what covers the page.
    await expect(page.locator('app-region-overlay > div')).toBeVisible(READY);
    await expect(primary(page, 'Censurar e Reconstruir PDF')).toBeDisabled();

    await drawRegion(page, { x: 0.1, y: 0.05 }, { x: 0.9, y: 0.2 });
    await expect(page.locator('app-region-overlay > div > div')).toHaveCount(1);

    await primary(page, 'Censurar e Reconstruir PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    await expectDownload(page, /^doc-a-redacted\.pdf$/);
  });

  test('keeps each page\'s boxes to itself', async ({ page }) => {
    await openApp(page, PDF_PATH);
    await upload(page, DOC_A);
    // The host element is inline and has no box of its own; the layer inside it
    // is what covers the page.
    await expect(page.locator('app-region-overlay > div')).toBeVisible(READY);

    await drawRegion(page, { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.3 });
    const boxes = page.locator('app-region-overlay > div > div');
    await expect(boxes).toHaveCount(1);

    // A box belongs to the page it was drawn on. Carrying it forward would
    // black out something the user never pointed at.
    await page.getByRole('button', { name: 'Próxima página' }).click();
    await expect(boxes).toHaveCount(0);
  });
});
