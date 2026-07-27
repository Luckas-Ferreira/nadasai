import { expect, test, type Page } from '@playwright/test';
import { expectDownload, openApp, pickFromHome, upload } from './helpers';

/**
 * Alpha at a fractional point of the retouch canvas, read from the real bitmap.
 *
 * The whole feature is "the alpha channel changed where I painted", and nothing
 * visible on screen proves that: a checkerboard behind a hole and a checkerboard
 * behind an opaque pixel are the same screenshot. So this asks the canvas.
 */
const alphaAt = (page: Page, x: number, y: number) =>
  page.locator('app-cutout-brush canvas').evaluate(
    (el, at) => {
      const canvas = el as HTMLCanvasElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return -1;
      const pixel = ctx.getImageData(Math.round(canvas.width * at.x), Math.round(canvas.height * at.y), 1, 1);
      return pixel.data[3];
    },
    { x, y },
  );

/** Drags across the middle of the retouch canvas, as a pointer actually would. */
async function paintAcrossCentre(page: Page): Promise<void> {
  const box = await page.locator('app-cutout-brush canvas').boundingBox();
  if (!box) throw new Error('no canvas');

  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.7, y, { steps: 8 });
  await page.mouse.up();
}

test.describe('Remover fundo', () => {
  // IS-Net runs as WASM in the browser, and the first run also pulls 55 MB of
  // weights and runtime off our own origin: minutes, not seconds.
  test.setTimeout(420_000);

  test('runs the model locally, offers backdrops and downloads the cutout', async ({ page }) => {
    await openApp(page, '/remove-bg');

    // Dropping a file is an explicit request, so the tool runs on its own — the
    // click that used to be here either no-opped against the in-flight run or,
    // once it finished, kicked off a second one for identical bytes.
    await upload(page);

    // No assertion on the "Working…" label: with a warm model cache the run can
    // finish before the expect polls, and a racy check is worse than none.

    // The cutout arrives, wipes the original away, and settles — which is what
    // puts the compare toggle on screen. Waiting on the toggle rather than the
    // image is deliberate: it is the one thing that only exists once the reveal
    // has actually finished playing.
    await expect(page.getByRole('button', { name: 'Ver original' })).toBeVisible({
      timeout: 360_000,
    });

    // Nothing left to re-run: removal has no settings, so the button goes.
    await expect(page.getByRole('button', { name: 'Remover fundo', exact: true })).toBeHidden();

    // The original is still reachable, in the same box, both ways.
    await page.getByRole('button', { name: 'Ver original' }).click();
    await expect(page.getByRole('img', { name: 'Original' })).toBeVisible();
    await page.getByRole('button', { name: 'Ver resultado' }).click();
    await expect(page.getByRole('img', { name: 'Resultado' })).toBeVisible();

    const backdrops = page.getByRole('button', { name: /^(#|Transparent)/ });
    await expect(backdrops.first()).toBeVisible();

    // A backdrop paints the surround without remounting the reveal: the wipe is
    // the payoff of the run, so it must not replay on every swatch. If it did,
    // the toggle would vanish while the animation restarted.
    await backdrops.nth(1).click();
    await expect(page.getByRole('img', { name: 'Resultado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver original' })).toBeVisible();

    await page.getByRole('button', { name: 'Transparente' }).click();
    await expect(page.getByRole('img', { name: 'Resultado' })).toBeVisible();

    await expectDownload(page, /^photo-nobg\.png$/);
  });

  test('picking the tool from home runs it, without a second click', async ({ page }) => {
    // A file in the chain, put there by another tool — the home has no uploader.
    // Crop is the carrier and nothing is applied there, so the history stays empty,
    // which matters: remove-bg auto-runs only when it is not already in it.
    await openApp(page, '/pt/imagem/cortar');
    await upload(page);
    await page.getByRole('link', { name: 'Nada Sai' }).first().click();

    // The file is already in the chain, so choosing the tool IS the request. This
    // used to land on a loaded image and wait for a button press that could not
    // have meant anything else.
    await pickFromHome(page, 'Remover fundo');

    await expect(page.getByRole('button', { name: 'Ver original' })).toBeVisible({
      timeout: 360_000,
    });
    await expectDownload(page, /^photo-nobg\.png$/);
  });

  test('the retouch brush erases, restores and undoes, at full resolution', async ({ page }) => {
    await openApp(page, '/remove-bg');
    await upload(page);
    await expect(page.getByRole('button', { name: 'Ver original' })).toBeVisible({ timeout: 360_000 });

    await page.getByRole('button', { name: 'Retocar' }).click();
    const canvas = page.locator('app-cutout-brush canvas');
    await expect(canvas).toBeVisible();

    // The canvas is the image, not the box it is shown in: an 800x600 fixture must
    // be retouched at 800x600 however small it renders.
    await expect
      .poll(() => canvas.evaluate((el) => `${(el as HTMLCanvasElement).width}x${(el as HTMLCanvasElement).height}`))
      .toBe('800x600');

    // A fat brush, so the stroke certainly covers the point being sampled.
    await page.getByRole('slider', { name: 'Pincel' }).fill('120');

    const before = await alphaAt(page, 0.5, 0.5);
    expect(before).toBeGreaterThan(0); // the centre is subject, not hole

    await paintAcrossCentre(page);
    expect(await alphaAt(page, 0.5, 0.5)).toBe(0);

    // Undo replays from the pristine cutout, so it must land back exactly.
    await page.getByRole('button', { name: 'Desfazer traço' }).click();
    expect(await alphaAt(page, 0.5, 0.5)).toBe(before);

    // Restore paints the original's own pixels back: fully opaque, by definition.
    await page.getByRole('radio', { name: 'Restaurar' }).click();
    await paintAcrossCentre(page);
    expect(await alphaAt(page, 0.5, 0.5)).toBe(255);

    // Discard drops every stroke at once.
    await page.getByRole('button', { name: 'Descartar' }).click();
    expect(await alphaAt(page, 0.5, 0.5)).toBe(before);

    // And the edit has to survive out of the editor and into the file.
    await page.getByRole('radio', { name: 'Apagar' }).click();
    await paintAcrossCentre(page);
    await page.getByRole('button', { name: 'Concluir' }).click();

    await expect(page.getByRole('button', { name: 'Retocar' })).toBeVisible();
    await expectDownload(page, /^photo-nobg\.png$/);
  });

  test('coming back to a kept cutout does not re-run the model', async ({ page }) => {
    await openApp(page, '/remove-bg');
    await upload(page);

    await expect(page.getByRole('button', { name: 'Continuar editando' })).toBeVisible({
      timeout: 360_000,
    });
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(page.getByText('photo-nobg.png')).toBeVisible();

    // Re-entering with remove-bg already in the history: the file is a finished
    // cutout, so auto-running would spend inference chewing on its own transparent
    // output. It waits, and offers the button instead.
    await pickFromHome(page, 'Remover fundo');

    await expect(page.getByRole('button', { name: 'Remover fundo', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver original' })).toHaveCount(0);
  });
});
