import { expect, test } from '@playwright/test';
import { NOT_AN_IMAGE, PHOTO, expectDownload, openApp, primary, upload } from './helpers';

const PATH = '/pt/imagem/melhorar-qualidade';

/** Reconstruction runs over every pixel of an 800x600 at 2x or 4x. */
const READY = { timeout: 60_000 };

test.describe('Melhorar qualidade', () => {
  test('runs on arrival and doubles the resolution', async ({ page }) => {
    await openApp(page, PATH);
    // Não há botão a apertar: escolher a ferramenta com uma imagem na mão já é
    // o pedido, e a ferramenta roda sozinha na primeira vez que o arquivo entra.
    await upload(page, PHOTO);

    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    // O painel promete uma resolução, e é ela que separa "ampliou" de "trocou os
    // bytes": a fixture é 800x600, então 2x é exatamente 1600x1200.
    await expect(page.getByText('1600 × 1200 px')).toBeVisible();

    await expectDownload(page, /^photo-hd\.png$/);
  });

  test('re-offers the run when the scale changes, and not before', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, PHOTO);
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    // Mesmo fator: apertar de novo só produziria os mesmos bytes, depois de
    // segundos de reconstrução. Por isso o botão não existe enquanto nada mudou.
    await expect(primary(page, 'Melhorar imagem')).toHaveCount(0);

    await page.getByRole('button', { name: '4x Ultra HD (4K)' }).click();
    await expect(primary(page, 'Melhorar imagem')).toBeVisible();

    await primary(page, 'Melhorar imagem').click();
    await expect(page.getByText('3200 × 2400 px')).toBeVisible(READY);
  });

  test('rejects a file that is not an image', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Baixar' })).toHaveCount(0);
  });
});
