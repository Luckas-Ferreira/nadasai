import { expect, test } from '@playwright/test';
import { CLIP, expectDownload, openApp, primary, upload } from './helpers';

const PATH = '/pt/audio/normalizar';

/** Decoding runs on the audio thread and the BS.1770 pass follows it. */
const READY = { timeout: 30_000 };

const peak = (page: import('@playwright/test').Page) => page.locator('#normalize-peak');
const lufs = (page: import('@playwright/test').Page) => page.locator('#normalize-lufs');
const gain = (page: import('@playwright/test').Page) => page.locator('#normalize-gain');

/** The reading with the units and the whitespace stripped off. */
async function reading(locator: ReturnType<typeof gain>): Promise<number> {
  const text = (await locator.innerText()).trim();
  return Number.parseFloat(text);
}

test.describe('Normalizar áudio', () => {
  /**
   * The three numbers ARE the tool — the rest is a download button. A measurement
   * that fails silently still renders a full panel, so what is asserted here is
   * that each cell holds a number and not the em dash the template falls back to.
   */
  test('measures the file before offering anything', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);

    await expect(page.locator('canvas')).toBeVisible(READY);

    // The fixture peaks at 0.9 by construction — that is -0.92 dBFS.
    await expect(peak(page)).toContainText('dBFS', READY);
    expect(await reading(peak(page))).toBeCloseTo(-0.9, 0);

    await expect(lufs(page)).toContainText('LUFS');
    expect(Number.isNaN(await reading(lufs(page)))).toBe(false);

    // A loud fixture against the -14 LUFS default: the answer is attenuation,
    // and a tool that only ever adds gain would get the sign wrong here.
    expect(await reading(gain(page))).toBeLessThan(0);
  });

  test('normalizes and names the file from the original', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);
    await expect(page.locator('canvas')).toBeVisible(READY);

    await primary(page, 'Normalizar áudio').click();
    await expect(
      page.locator('app-action-bar').getByRole('button', { name: 'Baixar' }),
    ).toBeVisible(READY);

    await expectDownload(page, /^clip-normalized\.wav$/);
  });

  /**
   * The mode is not a label on the same number: peak reads one sample, loudness
   * reads the whole file through the K-weighting. If both produced the same gain,
   * one of the two paths would not be running.
   */
  test('the mode changes the gain, not just the wording', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);
    await expect(page.locator('canvas')).toBeVisible(READY);

    const loudnessGain = await reading(gain(page));

    await page.getByRole('radio', { name: 'Pico' }).click();
    const peakGain = await reading(gain(page));

    // Peak mode against a fixture already at -0.92 dBFS barely moves it.
    expect(peakGain).toBeCloseTo(-0.1, 1);
    expect(Math.abs(peakGain - loudnessGain)).toBeGreaterThan(1);
  });

  test('re-offers the run only when a setting changes', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);
    await expect(page.locator('canvas')).toBeVisible(READY);

    await primary(page, 'Normalizar áudio').click();
    await expect(
      page.locator('app-action-bar').getByRole('button', { name: 'Baixar' }),
    ).toBeVisible(READY);

    // Same target: pressing it again could only produce identical bytes.
    await expect(primary(page, 'Normalizar áudio')).toBeHidden();

    await page.getByRole('button', { name: /Podcast/ }).click();
    await expect(primary(page, 'Normalizar áudio')).toBeVisible();
  });

  test('writes MP3 when MP3 is asked for', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);
    await expect(page.locator('canvas')).toBeVisible(READY);

    await page.getByRole('radio', { name: 'MP3' }).click();

    await primary(page, 'Normalizar áudio').click();
    await expect(
      page.locator('app-action-bar').getByRole('button', { name: 'Baixar' }),
    ).toBeVisible(READY);

    await expectDownload(page, /^clip-normalized\.mp3$/);
  });
});
