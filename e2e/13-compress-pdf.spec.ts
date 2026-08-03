import { expect, test } from '@playwright/test';
import { DOC_A, NOT_AN_IMAGE, SCAN, expectDownload, openApp, primary, upload } from './helpers';

const PATH = '/pt/pdf/comprimir';

/** Rendering every page through pdf.js and re-encoding it is the slow part. */
const READY = { timeout: 60_000 };

test.describe('Comprimir PDF', () => {
  test('shrinks a raster-heavy PDF and reports the saving', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, SCAN);

    // The first page is rendered on load, which is also the validation: a file
    // that is not a readable PDF fails here rather than after pressing Compress.
    await expect(primary(page, 'Comprimir PDF')).toBeVisible(READY);

    await primary(page, 'Comprimir PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    // The badge only renders when the result is genuinely smaller. Exact,
    // because the FAQ below the tool talks about savings too — a substring
    // match here reads the copy instead of the result.
    await expect(page.getByText('Economia', { exact: true })).toBeVisible();

    await expectDownload(page, /^scan-min\.pdf$/);
  });

  test('re-offers the run only when the level changes', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, SCAN);
    await expect(primary(page, 'Comprimir PDF')).toBeVisible(READY);

    await primary(page, 'Comprimir PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    // Same level: pressing it again could only produce identical bytes.
    await expect(primary(page, 'Comprimir PDF')).toBeHidden();

    await page.getByRole('radiogroup', { name: 'Compressão' }).getByRole('radio', { name: 'Forte' }).click();
    await expect(primary(page, 'Comprimir PDF')).toBeVisible();
  });

  test('keeps the original when compressing would make the file bigger', async ({ page }) => {
    await openApp(page, PATH);
    // A page of vector text becomes a photograph of itself. The tool has to say
    // so, not hand back a "compressed" file that is larger than what went in.
    await upload(page, DOC_A);
    await expect(primary(page, 'Comprimir PDF')).toBeVisible(READY);

    await primary(page, 'Comprimir PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    // Anchored, for the same reason as the badge above: the FAQ quotes this
    // notice back, so an unanchored match finds the copy as well as the notice.
    await expect(page.getByText(/^Este PDF já está bem otimizado/)).toBeVisible();
    await expect(page.getByText('Economia', { exact: true })).toHaveCount(0);
  });

  test('rejects a file that is not a PDF', async ({ page }) => {
    await openApp(page, PATH);
    // The picker's `accept` is a filter, not a guarantee — "All files" is one
    // click away, and a drop bypasses it entirely.
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toContainText('não é um PDF válido');
    await expect(primary(page, 'Comprimir PDF')).toHaveCount(0);
  });
});
