import { expect, test, type Page } from '@playwright/test';
import { CLIP, openApp, primary, upload } from './helpers';

/**
 * A ferramenta é aritmética curta, então o que o e2e precisa provar não é a
 * conta — `channels.spec.ts` já a cobre em unidade, incluindo o cancelamento de
 * fase. O que só aparece no navegador é a ADAPTAÇÃO ao arquivo: um mono não
 * pode oferecer "extrair o canal direito", e o nome do arquivo baixado tem de
 * dizer qual operação o produziu, senão extrair os dois lados dá dois arquivos
 * indistinguíveis na pasta.
 */

async function open(page: Page): Promise<void> {
  await openApp(page, '/pt/audio/separar-canais');
  await upload(page, CLIP);
  await expect(page.getByText('Taxa de amostragem')).toBeVisible({ timeout: 30_000 });
}

/** Baixa e devolve o nome sugerido. */
async function download(page: Page): Promise<string> {
  await primary(page, 'Gerar arquivo').click();
  await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
    timeout: 30_000,
  });

  const [event] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar', exact: true }).click(),
  ]);

  return event.suggestedFilename();
}

test.describe('Separar canais', () => {
  test('extrai um lado e o nome do arquivo diz qual', async ({ page }) => {
    await open(page);

    await page.getByRole('radio', { name: 'Só o esquerdo' }).click();
    expect(await download(page)).toMatch(/^clip-esquerdo\.wav$/);
  });

  test('cada operação nomeia o próprio arquivo', async ({ page }) => {
    await open(page);

    await page.getByRole('radio', { name: 'Só o direito' }).click();
    expect(await download(page)).toMatch(/^clip-direito\.wav$/);

    await page.getByRole('radio', { name: 'Trocar os lados' }).click();
    expect(await download(page)).toMatch(/^clip-canais-trocados\.wav$/);
  });

  test('mistura em mono e escreve MP3 quando pedido', async ({ page }) => {
    await open(page);

    await page.getByRole('radio', { name: 'Misturar em mono' }).click();
    await page.getByRole('radio', { name: 'MP3', exact: true }).click();

    expect(await download(page)).toMatch(/^clip-mono\.mp3$/);
  });

  /**
   * O desenho no centro é a operação. Ele muda ANTES de qualquer
   * processamento — é o que permite decidir sem gerar o arquivo primeiro.
   */
  test('o diagrama mostra quantos canais saem, antes de gerar', async ({ page }) => {
    await open(page);

    await page.getByRole('radio', { name: 'Misturar em mono' }).click();
    await expect(page.getByText('Canais na saída').locator('xpath=../dd')).toHaveText(/1/);

    await page.getByRole('radio', { name: 'Trocar os lados' }).click();
    await expect(page.getByText('Canais na saída').locator('xpath=../dd')).toHaveText(/2/);
  });

  test('o botão volta quando a operação muda, e não antes', async ({ page }) => {
    await open(page);

    await primary(page, 'Gerar arquivo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(primary(page, 'Gerar arquivo')).toBeHidden();

    await page.getByRole('radio', { name: 'Só o esquerdo' }).click();
    await expect(primary(page, 'Gerar arquivo')).toBeVisible();
  });

  test('rejeita um arquivo que não é áudio', async ({ page }) => {
    await openApp(page, '/pt/audio/separar-canais');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
