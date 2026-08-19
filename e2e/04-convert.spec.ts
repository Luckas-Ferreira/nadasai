import { expect, test } from '@playwright/test';
import { expectDownload, openApp, primary, upload } from './helpers';

const format = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('radiogroup', { name: 'Formato de destino' }).getByRole('radio', { name, exact: true });

test.describe('Converter', () => {
  test('encodes every image format and downloads with the right extension', async ({ page }) => {
    await openApp(page, '/convert');
    await upload(page);

    for (const [target, file] of [
      ['WEBP', /^photo-converted\.webp$/],
      ['JPEG', /^photo-converted\.jpe?g$/],
      ['PNG', /^photo-converted\.png$/],
    ] as const) {
      await format(page, target).click();
      await expect(format(page, target)).toHaveAttribute('aria-checked', 'true');

      await primary(page, 'Converter').click();
      await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible({ timeout: 30_000 });
      await expectDownload(page, file);

      // Re-encoding to the format already on screen is a no-op, so the button goes;
      // picking the next format brings it back.
      await expect(primary(page, 'Converter')).toBeHidden();
    }
  });

  test('PDF and ICO are terminal: downloadable but not chainable', async ({ page }) => {
    await openApp(page, '/convert');
    await upload(page);

    await format(page, 'PDF').click();
    await expect(page.getByText('PDF e ICO são formatos finais')).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Fundo atrás da transparência' })).toBeVisible();
    await page
      .getByRole('radiogroup', { name: 'Fundo atrás da transparência' })
      .getByRole('radio', { name: '#000' })
      .click();

    // jspdf is a dynamic import, so the first PDF run also exercises lazy chunk loading.
    await primary(page, 'Converter').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole('button', { name: 'Editar o resultado' })).toHaveCount(0);
    await expectDownload(page, /^photo-converted\.pdf$/);

    // The backdrop reaches the output only for PDF, so here — and only here —
    // recolouring it is a real change and offers the re-run.
    await expect(primary(page, 'Converter')).toBeHidden();
    await page
      .getByRole('radiogroup', { name: 'Fundo atrás da transparência' })
      .getByRole('radio', { name: '#FFF' })
      .click();
    await expect(primary(page, 'Converter')).toBeVisible();

    await format(page, 'ICO').click();
    await primary(page, 'Converter').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Editar o resultado' })).toHaveCount(0);
    await expectDownload(page, /^photo-converted\.ico$/);
  });

  test('AVIF is not offered as an output format', async ({ page }) => {
    await openApp(page, '/convert');
    await upload(page);

    const options = page.getByRole('radiogroup', { name: 'Formato de destino' }).getByRole('radio');
    await expect(options).toHaveText(['WEBP', 'JPEG', 'PNG', 'PDF', 'ICO']);
  });

  test('a chainable format can keep editing', async ({ page }) => {
    await openApp(page, '/convert');
    await upload(page);

    await format(page, 'PNG').click();
    await primary(page, 'Converter').click();
    await page.getByRole('button', { name: 'Editar o resultado' }).click();

    await expect(page.locator('app-file-bar')).toContainText('photo-converted.png');
  });
});
