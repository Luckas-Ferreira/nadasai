import { expect, test } from '@playwright/test';
import { openApp, upload } from './helpers';

/**
 * Stepping back through the chain.
 *
 * The scenario this exists for, in the user's words: you remove a background,
 * carry on editing, resize, accept a crop — and only then notice the crop was
 * bad. Before undo, the chain was one-way: the previous file was dropped on the
 * floor by apply(), so the only way back was Start over and re-uploading.
 *
 * Undo NÃO navega mais, e é isso que os dois testes aqui passaram a afirmar. Ele
 * fazia `navigate(['/'])` para forçar a ferramenta aberta a se reconstruir com o
 * arquivo restaurado — o que expulsava a pessoa da ferramenta e, de quebra,
 * trocava o idioma, porque a rota `''` é um `redirectTo: 'pt'` e quem estava em
 * `/en/...` caía no site em português. Com `hydrateFromWorkspace` a ferramenta
 * reage à sessão, então trocar o arquivo por baixo já basta.
 */
test.describe('Undo', () => {
  test.setTimeout(180_000);

  test('steps back one tool at a time, all the way to the untouched upload', async ({ page }) => {
    await openApp(page, '/compress');
    await upload(page);

    // Comprimir, e seguir para redimensionar pelo chip — que leva o resultado
    // junto sem passar pela home.
    await page.getByRole('button', { name: 'Comprimir', exact: true }).click();
    await page.getByRole('button', { name: 'Redimensionar' }).click();

    await page.getByRole('button', { name: '400', exact: true }).click();
    await page.getByRole('button', { name: 'Redimensionar', exact: true }).click();
    // Segue para Converter pelo chip, que commita o redimensionamento.
    await page.getByRole('button', { name: 'Converter' }).click();

    const bar = page.locator('app-file-bar');
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

  test('undoing from inside a tool keeps you in it, on the restored file', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page);
    await page.getByRole('button', { name: 'Comprimir', exact: true }).click();

    // Pelo chip: a compressão é commitada e o corte abre com ela.
    await page.getByRole('button', { name: 'Cortar' }).click();
    await expect(page).toHaveURL(/\/cortar$/);

    await page.getByRole('button', { name: 'Desfazer Comprimir' }).click();

    // A ferramenta continua aberta — a hidratação troca o arquivo por baixo dela.
    await expect(page).toHaveURL(/\/cortar$/);
    await expect(page.locator('app-file-bar')).toContainText('photo.png');
  });
});
