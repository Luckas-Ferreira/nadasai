import { expect, test, type Page } from '@playwright/test';
import { DOC_A, DOC_B, SCAN, openApp, primary } from './helpers';

/**
 * O Myers é coberto em unidade por `diff.spec.ts` e a extração pelo
 * `pdf-to-word`. O que só esta página prova é a JUNÇÃO das duas — e as duas
 * respostas que a ferramenta precisa dar sem que ninguém pergunte: "o texto é
 * idêntico" e "esta página escaneada ficou de fora".
 *
 * A segunda é a que mais importa. Uma comparação que ignora páginas em silêncio
 * é usada para decidir se um contrato mudou, e responde errado.
 */

async function open(page: Page, right = DOC_B): Promise<void> {
  await openApp(page, '/pt/pdf/comparar');

  // Os dois campos são dropzones distintas; o segundo é sempre o último input
  // de arquivo da página. Não dá para casar por texto: o artigo no pé repete
  // "nova versão" duas vezes, e o modo estrito recusa três correspondências.
  await page.locator('input[type=file]').nth(0).setInputFiles(DOC_A);
  await page.locator('input[type=file]').last().setInputFiles(right);

  await expect(primary(page, 'Comparar')).toBeVisible({ timeout: 30_000 });
}

test.describe('Comparar PDFs', () => {
  test('mostra o que mudou entre dois documentos', async ({ page }) => {
    await open(page);

    await primary(page, 'Comparar').click();

    // As fixtures dizem "Documento A" e "Documento B" — a diferença tem de
    // aparecer dos dois lados do diff.
    await expect(page.getByText('Adicionadas').locator('xpath=../dd')).not.toHaveText('0', {
      timeout: 60_000,
    });
    await expect(page.getByText('Removidas').locator('xpath=../dd')).not.toHaveText('0');
  });

  /**
   * Comparar um arquivo com ele mesmo é a única entrada em que a resposta certa
   * é "nada mudou" — e dizê-la explicitamente é melhor que mostrar um painel
   * vazio que se parece com falha.
   */
  test('diz quando o texto é idêntico, em vez de mostrar nada', async ({ page }) => {
    await open(page, DOC_A);

    await primary(page, 'Comparar').click();

    await expect(page.getByRole('alert')).toContainText('idêntico', { timeout: 60_000 });
  });

  /**
   * Página sem camada de texto fica de fora, e a contagem tem de aparecer.
   * Comparar menos do que a pessoa pensa é o modo de falha desta ferramenta.
   */
  test('conta as páginas escaneadas que ficaram de fora', async ({ page }) => {
    await open(page, SCAN);

    await primary(page, 'Comparar').click();

    await expect(page.getByRole('alert')).toContainText('camada de texto', { timeout: 60_000 });
  });

  test('baixa o diff unificado', async ({ page }) => {
    await open(page);

    await primary(page, 'Comparar').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 60_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^doc-a-diff\.txt$/);
  });

  test('o botão volta quando uma opção muda, e não antes', async ({ page }) => {
    await open(page);

    await primary(page, 'Comparar').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(primary(page, 'Comparar')).toBeHidden();

    await page.getByText('Ignorar maiúsculas e minúsculas').click();
    await expect(primary(page, 'Comparar')).toBeVisible();
  });

  test('rejeita um arquivo que não é PDF', async ({ page }) => {
    await openApp(page, '/pt/pdf/comparar');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
