import { expect, test } from '@playwright/test';
import { openApp, pickFromHome, upload } from './helpers';

/**
 * Stepping back through the chain.
 *
 * The scenario this exists for, in the user's words: you remove a background,
 * carry on editing, resize, accept a crop — and only then notice the crop was
 * bad. Before undo, the chain was one-way: the previous file was dropped on the
 * floor by apply(), so the only way back was Start over and re-uploading.
 */
test.describe('Undo', () => {
  test.setTimeout(180_000);

  test('steps back one tool at a time, all the way to the untouched upload', async ({ page }) => {
    await openApp(page, '/compress');
    await upload(page);

    // Two steps into the chain: compress, then resize.
    await page.getByRole('button', { name: 'Comprimir', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar editando' }).click();

    // From the home, which is where Keep editing lands: the grid, not the rail.
    await pickFromHome(page, 'Redimensionar');
    await page.getByRole('button', { name: 'Redimensionar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar editando' }).click();

    const bar = page.locator('app-current-file-bar');
    await expect(bar).toContainText('Comprimir  →  Redimensionar');
    await expect(bar).toContainText('photo-resized.png');

    // The resize was a mistake. The button names the step it drops, so there is
    // no guessing about what is about to disappear.
    await page.getByRole('button', { name: 'Desfazer Redimensionar' }).click();

    await expect(bar).toContainText('Comprimir');
    await expect(bar).not.toContainText('Redimensionar');
    // Back to the compressed file, byte for byte — not a re-encode.
    await expect(bar).toContainText('photo-min.png');

    // And again, back to the untouched upload.
    await page.getByRole('button', { name: 'Desfazer Comprimir' }).click();
    await expect(bar).toContainText('photo.png');

    // Nothing left to undo: the button is gone, but the file is still loaded.
    await expect(page.getByRole('button', { name: /^Desfazer/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Limpar' })).toBeVisible();
  });

  test('undoing from inside a tool lands you home, on the restored file', async ({ page }) => {
    await openApp(page, '/compress');
    await upload(page);
    await page.getByRole('button', { name: 'Comprimir', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar editando' }).click();

    // A tool reads its source once, when constructed. Undoing while one is open
    // would otherwise leave it rendering the old file forever.
    await pickFromHome(page, 'Cortar');
    await expect(page).toHaveURL(/\/cortar$/);

    await page.getByRole('button', { name: 'Desfazer Comprimir' }).click();

    // `/` redirects to the language root, so the home is `/pt`, never a bare `/`.
    await expect(page).toHaveURL(/\/pt$/);
    await expect(page.locator('app-current-file-bar')).toContainText('photo.png');
  });
});
