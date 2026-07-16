import { expect, test } from '@playwright/test';
import { expectDownload, openApp, primary, upload } from './helpers';

test.describe('Comprimir', () => {
  test('compresses, reports savings, re-runs at a new quality and downloads WebP', async ({ page }) => {
    await openApp(page, '/compress');
    await upload(page);

    // The panel only exists once a source is loaded.
    await expect(page.getByText('A saída é WebP')).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Qualidade' })).toHaveValue('75');

    await primary(page, 'Comprimir').click();

    // A result swaps the plain preview for the before/after slider.
    const compare = page.getByRole('slider', { name: 'Original / Result' });
    await expect(compare).toBeVisible({ timeout: 30_000 });

    // The "Compressed" row: a real size, plus the savings badge.
    const compressed = page.getByRole('definition').last();
    await expect(compressed).toContainText(/\d+(\.\d+)? (KB|MB|B)/);
    await expect(compressed).toContainText(/\d+%/);

    await compare.fill('20');
    await compare.fill('80');

    // The primary button stays live: re-run at a different quality without re-uploading.
    await page.getByRole('slider', { name: 'Qualidade' }).fill('20');
    await expect(page.getByText('20%')).toBeVisible();
    await primary(page, 'Comprimir').click();
    await expect(compressed).toContainText(/\d+%/);

    await expectDownload(page, /^photo-min\.webp$/);
  });

  test('Keep editing pushes the result into the chain', async ({ page }) => {
    await openApp(page, '/compress');
    await upload(page);
    await primary(page, 'Comprimir').click();

    await expect(page.getByRole('button', { name: 'Continuar editando' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar editando' }).click();

    await expect(page).toHaveURL(/localhost:4200\/$/);
    await expect(page.getByText('photo-min.webp')).toBeVisible();
    await expect(page.getByText('O que você quer fazer com ela?')).toBeVisible();

    // The next tool hydrates from the chain — no second upload.
    await page.getByRole('navigation', { name: 'Ferramentas' }).first().getByRole('link', { name: 'Redimensionar' }).click();
    await expect(page.getByRole('button', { name: 'Redimensionar', exact: true })).toBeVisible();
    await expect(page.getByText('Solte uma imagem aqui')).toHaveCount(0);
  });

  test('Start over empties the chain', async ({ page }) => {
    await openApp(page, '/compress');
    await upload(page);
    await expect(page.getByRole('button', { name: 'Limpar' })).toBeVisible();

    await page.getByRole('button', { name: 'Recomeçar' }).click();
    await expect(page.getByText('Solte uma imagem aqui')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Limpar' })).toHaveCount(0);
  });
});
