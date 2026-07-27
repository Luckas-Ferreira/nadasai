import { expect, test } from '@playwright/test';
import { expectDownload, openApp, pickFromHome, primary, upload } from './helpers';

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

    // Drag the divider with a real pointer, which is the way anyone actually uses
    // it and the way that was broken: the <img> layers are natively draggable, so
    // the press started an image drag, the divider stuck after a few pixels and the
    // browser began selecting the page instead. fill() drives the range input and
    // never touched any of that.
    const frame = page.locator('app-compare-slider > div');
    const box = await frame.boundingBox();
    if (!box) throw new Error('no compare frame');

    const midY = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.5, midY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, midY, { steps: 10 });
    await page.mouse.up();

    // The divider followed the pointer the whole way, not a few pixels.
    const divider = frame.locator('div[style*="left"]').first();
    const left = await divider.evaluate((el) => parseFloat((el as HTMLElement).style.left));
    expect(left).toBeGreaterThan(70);
    expect(left).toBeLessThan(80);

    // And the drag selected nothing — the symptom that gave the bug away.
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');

    // Nothing to re-run at the quality already used: the button would only rebuild
    // the same file.
    await expect(primary(page, 'Comprimir')).toBeHidden();

    // Move the slider and it comes back — re-run at a new quality, no re-upload.
    await page.getByRole('slider', { name: 'Qualidade' }).fill('20');
    await expect(page.getByText('20%')).toBeVisible();
    await primary(page, 'Comprimir').click();
    await expect(compressed).toContainText(/\d+%/);
    await expect(primary(page, 'Comprimir')).toBeHidden();

    await expectDownload(page, /^photo-min\.webp$/);
  });

  test('Keep editing pushes the result into the chain', async ({ page }) => {
    await openApp(page, '/compress');
    await upload(page);
    await primary(page, 'Comprimir').click();

    await expect(page.getByRole('button', { name: 'Continuar editando' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar editando' }).click();

    // `/` redirects to the language root. Asserted without the port, which was
    // hardcoded to 4200 and made the spec unrunnable against any other server.
    await expect(page).toHaveURL(/\/pt$/);
    await expect(page.getByText('photo-min.webp')).toBeVisible();
    await expect(page.getByText('O que você quer fazer com ela?')).toBeVisible();

    // The next tool hydrates from the chain — no second upload. Picked from the
    // home grid: the rail is scoped to a module and the home belongs to none.
    await pickFromHome(page, 'Redimensionar');
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
