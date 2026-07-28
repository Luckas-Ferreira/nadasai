import { expect, test } from '@playwright/test';
import { CLIP, CLIP_B, NOT_AN_IMAGE, expectDownload, openApp, primary, upload } from './helpers';

const PATH = '/pt/audio/juntar';

/** Decoding happens on the audio thread and every track waits on it. */
const READY = { timeout: 30_000 };

const tracks = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: 'Faixas' }).getByRole('listitem');

test.describe('Juntar áudios', () => {
  test('takes several files and lists them in order', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles([CLIP, CLIP_B]);

    await expect(tracks(page)).toHaveCount(2, READY);
    // The strip is app-page-grid, so each track carries its own waveform.
    await expect(tracks(page).first().locator('img')).toBeVisible();
  });

  test('merges into one file named after the first track', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles([CLIP, CLIP_B]);
    await expect(tracks(page)).toHaveCount(2, READY);

    // 4s + 3s, joined straight.
    await expect(page.getByText('0:07.000').first()).toBeVisible();

    await primary(page, 'Juntar áudios').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);
    await expectDownload(page, /^clip-merged\.wav$/);
  });

  test('a crossfade makes the result shorter, a gap makes it longer', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles([CLIP, CLIP_B]);
    await expect(tracks(page)).toHaveCount(2, READY);

    await page.getByRole('radio', { name: 'Crossfade' }).click();
    // 7s total, overlapping by the default 1s.
    await expect(page.getByText('0:06.000').first()).toBeVisible();

    await page.getByRole('radio', { name: 'Silêncio' }).click();
    await expect(page.getByText('0:08.000').first()).toBeVisible();

    await page.getByRole('radio', { name: 'Direto' }).click();
    await expect(page.getByText('0:07.000').first()).toBeVisible();
  });

  test('reordering changes the output, so the run is offered again', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles([CLIP, CLIP_B]);
    await expect(tracks(page)).toHaveCount(2, READY);

    await primary(page, 'Juntar áudios').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);
    await expect(primary(page, 'Juntar áudios')).toBeHidden();

    // The arrows are the real control — drag does nothing from a keyboard.
    await tracks(page).first().getByRole('button', { name: /Mover para depois/ }).click();

    // Order is part of the result. Without it in the signature the stale file
    // would stay downloadable while the strip showed a different order.
    await expect(primary(page, 'Juntar áudios')).toBeVisible();
  });

  test('one file is not a merge', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);

    await expect(tracks(page)).toHaveCount(1, READY);
    await expect(page.getByText('Adicione pelo menos dois arquivos')).toBeVisible();
    await expect(primary(page, 'Juntar áudios')).toBeDisabled();
  });

  test('rejects a file that is not audio', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toContainText('não é um áudio suportado');
    await expect(tracks(page)).toHaveCount(0);
  });
});
