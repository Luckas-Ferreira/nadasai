import { expect, test, type Page } from '@playwright/test';
import { DOC_A, SCAN, openApp, primary } from './helpers';

/**
 * A extração é a MESMA do `pdf-to-word`, e é coberta lá. O que só esta página
 * prova é o escritor: TXT sem marcação nenhuma, Markdown com estrutura
 * inferida, e o aviso quando páginas escaneadas ficam de fora — que é a
 * diferença entre um texto incompleto e um texto incompleto que a pessoa sabe
 * que está incompleto.
 */

async function open(page: Page, file = DOC_A): Promise<void> {
  await openApp(page, '/pt/pdf/para-texto');
  await page.locator('input[type=file]').first().setInputFiles(file);
  await expect(page.getByText('O texto extraído aparece aqui')).toBeVisible({ timeout: 30_000 });
}

async function extract(page: Page): Promise<void> {
  await primary(page, 'Extrair o texto').click();
  await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
    timeout: 60_000,
  });
}

test.describe('PDF para texto', () => {
  test('extrai o texto e mostra na tela', async ({ page }) => {
    await open(page);
    await extract(page);

    await expect(page.locator('pre')).toContainText('Documento A');
    await expect(page.getByText('palavras').locator('xpath=../dd')).not.toHaveText('0');
  });

  test('baixa .txt por padrão', async ({ page }) => {
    await open(page);
    await extract(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^doc-a-texto\.txt$/);
  });

  test('baixa .md quando Markdown é escolhido', async ({ page }) => {
    await open(page);

    await page.getByRole('radio', { name: 'Markdown', exact: true }).click();
    await extract(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^doc-a-texto\.md$/);
  });

  /**
   * O marcador de página vem DESLIGADO de propósito: quem joga o resultado num
   * modelo de linguagem não quer a prosa picada a cada folha. Ligar tem de
   * mudar o texto na tela, sem nova extração ser necessária para perceber.
   */
  test('o marcador de página só aparece quando pedido', async ({ page }) => {
    await open(page);
    await extract(page);

    await expect(page.locator('pre')).not.toContainText('--- 1 ---');

    await page.getByText('Marcar onde cada página termina').click();
    await extract(page);

    await expect(page.locator('pre')).toContainText('--- 1 ---');
  });

  /**
   * Com o OCR desligado, uma página escaneada é pulada — e a página tem de
   * dizer isso. Um texto silenciosamente incompleto é o pior resultado
   * possível para quem vai conferir um documento.
   */
  test('avisa quando uma página escaneada fica de fora', async ({ page }) => {
    await open(page, SCAN);

    await page.getByText('Ler páginas escaneadas com OCR').click();

    await primary(page, 'Extrair o texto').click();

    // Ou sai o aviso de páginas puladas, ou sai o erro de "sem texto" — as duas
    // são respostas honestas para um PDF que é só imagem com o OCR desligado.
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 60_000 });
  });

  test('copia para a área de transferência', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await extract(page);

    await page.getByRole('button', { name: /Copiar/ }).click();
    await expect(page.getByRole('button', { name: /Copiado/ })).toBeVisible();
  });

  test('rejeita um arquivo que não é PDF', async ({ page }) => {
    await openApp(page, '/pt/pdf/para-texto');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
