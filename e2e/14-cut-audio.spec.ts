import { expect, test } from '@playwright/test';
import { CLIP, NOT_AN_IMAGE, expectDownload, openApp, primary, upload } from './helpers';

const PATH = '/pt/audio/cortar';

/** Decoding happens on the audio thread, and the waveform waits on it. */
const READY = { timeout: 30_000 };

const start = (page: import('@playwright/test').Page) => page.locator('#cut-start');
const end = (page: import('@playwright/test').Page) => page.locator('#cut-end');

test.describe('Cortar áudio', () => {
  test('opens a file with the whole track selected', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);

    await expect(page.locator('canvas')).toBeVisible(READY);

    // Selecting everything by default is what makes the first drag a narrowing
    // rather than a hunt for the audio.
    await expect(start(page)).toHaveValue('0:00.000');
    await expect(end(page)).toHaveValue('0:04.000');
  });

  test('cuts the selection and names the file from the original', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);
    await expect(page.locator('canvas')).toBeVisible(READY);

    await start(page).fill('0:01.000');
    await start(page).press('Enter');
    await end(page).fill('0:03.000');
    await end(page).press('Enter');

    await expect(page.getByText('0:02.000').first()).toBeVisible();

    await primary(page, 'Cortar áudio').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    // WAV, not .wav-named-mp3: the browser can only encode this one.
    await expectDownload(page, /^clip-cut\.wav$/);
  });

  test('re-offers the run only when a setting changes', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);
    await expect(page.locator('canvas')).toBeVisible(READY);

    await primary(page, 'Cortar áudio').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    // Same selection: pressing it again could only produce identical bytes.
    await expect(primary(page, 'Cortar áudio')).toBeHidden();

    await page.getByRole('radio', { name: 'Remover' }).click();
    await expect(primary(page, 'Cortar áudio')).toBeVisible();
  });

  test('removing a slice yields what is left, not what was selected', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);
    await expect(page.locator('canvas')).toBeVisible(READY);

    await start(page).fill('0:01.000');
    await start(page).press('Enter');
    await end(page).fill('0:03.000');
    await end(page).press('Enter');

    await page.getByRole('radio', { name: 'Remover' }).click();

    // 4s total minus the 2s selection. The panel has to flip with the mode, or
    // the number on screen describes the opposite of the file about to be saved.
    await expect(page.getByText('0:02.000').first()).toBeVisible();

    await primary(page, 'Cortar áudio').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);
    await expectDownload(page, /^clip-cut\.wav$/);
  });

  test('zooms into the waveform and scrolls the timeline', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);
    await expect(page.locator('canvas')).toBeVisible(READY);

    const zoom = page.locator('input[title="Zoom %"]');
    await expect(zoom).toHaveValue('100');

    // At fit there is nothing to scroll; zooming is what creates the timeline.
    await page.getByRole('button', { name: 'Aumentar zoom' }).click();
    await page.getByRole('button', { name: 'Aumentar zoom' }).click();
    await expect(zoom).not.toHaveValue('100');

    const scrollable = await page.evaluate(() => {
      const el = document.querySelector('.doc-scroll')!;
      return el.scrollWidth > el.clientWidth + 5;
    });
    expect(scrollable).toBe(true);

    // The sheet stays pinned at the viewport width. It used to inherit `w-full`
    // from the scroll spacer, which stretched a 750px canvas across the whole
    // zoomed timeline and put every pointer x on the wrong second.
    const pinned = await page.evaluate(() => {
      const scroller = document.querySelector('.doc-scroll')!;
      const canvas = document.querySelector('canvas')!;
      return Math.abs(canvas.getBoundingClientRect().width - scroller.clientWidth) < 4;
    });
    expect(pinned).toBe(true);

    await page.getByRole('button', { name: 'Tudo' }).click();
    await expect(zoom).toHaveValue('100');
  });

  test('framing the selection zooms to it and keeps the times exact', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);
    await expect(page.locator('canvas')).toBeVisible(READY);

    await start(page).fill('0:01.000');
    await start(page).press('Enter');
    await end(page).fill('0:01.500');
    await end(page).press('Enter');

    await page.getByRole('button', { name: 'Enquadrar seleção' }).click();

    // Half a second of a four-second clip, with a margin: 4 / (0.5 * 1.25) = 6.4x.
    await expect(page.locator('input[title="Zoom %"]')).toHaveValue('640');
    // Framing is navigation. It must not move the edit.
    await expect(start(page)).toHaveValue('0:01.000');
    await expect(end(page)).toHaveValue('0:01.500');
  });

  test('rejects a file that is not audio', async ({ page }) => {
    await openApp(page, PATH);
    // The picker's `accept` is a filter, not a guarantee — "All files" is one
    // click away, and a drop bypasses it entirely.
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toContainText('não é um áudio suportado');
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
