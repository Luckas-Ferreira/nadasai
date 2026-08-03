import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { NOT_AN_IMAGE, PHOTO, PHOTO_META, openApp, primary, upload } from './helpers';

const PATH = '/pt/privacidade/remover-exif';

test.describe('Remover EXIF', () => {
  /**
   * The findings list IS the tool — showing somebody what their own file was
   * carrying is what makes the removal believable. So the spec asserts on the
   * values, not just on the download.
   */
  test('shows what the photo carries, then strips it', async ({ page }, testInfo) => {
    await openApp(page, PATH);
    await upload(page, PHOTO_META);

    await expect(page.getByText('Fulano de Tal')).toBeVisible();
    await expect(page.getByText('Camera Fixture 1.0')).toBeVisible();

    await primary(page, 'Remover Todos os Metadados').click();
    await expect(page.getByText('Conferido de novo depois da limpeza')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('photo-meta-noexif.png');

    const cleaned = testInfo.outputPath('photo-meta-noexif.png');
    await download.saveAs(cleaned);
    const bytes = readFileSync(cleaned);

    // Two assertions, because either alone is satisfiable by the wrong fix: the
    // names are gone, AND the compressed image data was copied rather than
    // re-encoded. A canvas round-trip would pass the first and fail the second.
    expect(bytes.includes(Buffer.from('Fulano de Tal', 'latin1'))).toBe(false);
    expect(bytes.includes(Buffer.from('tEXt', 'latin1'))).toBe(false);

    const original = readFileSync(PHOTO_META);
    const idat = original.indexOf(Buffer.from('IDAT', 'latin1'));
    expect(bytes.includes(original.subarray(idat, idat + 2048))).toBe(true);
  });

  test('says so plainly when there is nothing to remove', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, PHOTO);

    await expect(page.getByText('Nenhum metadado EXIF encontrado neste arquivo.')).toBeVisible();
  });

  test('refuses a file it cannot strip losslessly', async ({ page }) => {
    await openApp(page, PATH);
    // TIFF and anything else is refused rather than half-supported: the tool
    // used to accept it, fail silently and show nothing at all.
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(primary(page, 'Remover Todos os Metadados')).toHaveCount(0);
  });
});
