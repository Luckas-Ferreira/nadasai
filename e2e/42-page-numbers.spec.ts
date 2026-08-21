import { expect, test } from '@playwright/test';
import { DOC_A, openApp, primary } from './helpers';

/**
 * Numerar páginas é a ferramenta de PDF mais simples do produto, e mesmo assim
 * tem uma decisão que quase toda concorrente erra: "pular a capa" e "começar a
 * contar" são perguntas DIFERENTES. Os dois testes do meio são sobre isso.
 *
 * A asserção sobre o texto do documento é a que justifica a ferramenta existir:
 * a página não é rasterizada, então o texto original continua extraível. Se
 * isso cair, a ferramenta virou uma compressão com perda disfarçada.
 */

async function open(page: import('@playwright/test').Page): Promise<void> {
  await openApp(page, '/pt/pdf/numerar-paginas');
  await page.locator('input[type=file]').first().setInputFiles(DOC_A);
  await expect(page.getByText('Serão numeradas')).toBeVisible({ timeout: 30_000 });
}

test.describe('Numerar páginas', () => {
  test('numera e baixa um PDF', async ({ page }) => {
    await open(page);

    await primary(page, 'Numerar páginas').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^doc-a-numerado\.pdf$/);
  });

  /**
   * A prova de que nada foi rasterizado: o texto que já estava no documento
   * continua extraível pelo pdf.js DEPOIS de numerar. É o mesmo tipo de
   * asserção do 18-remove-exif, que confere os bytes em vez da tela.
   */
  test('o texto original continua extraível — a página não é rasterizada', async ({ page }) => {
    await open(page);

    await primary(page, 'Numerar páginas').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('latin1');

    // Uma ferramenta que rasterizasse a folha substituiria o conteúdo por um
    // XObject de imagem — é exatamente o que compress-pdf e protect-pdf fazem,
    // e é o que esta NÃO pode fazer.
    //
    // A prova positiva é melhor que a negativa e está no próprio content
    // stream: o operador de texto que a fixture escreveu continua lá, palavra
    // por palavra. Rasterizar teria trocado isso por pixels.
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect(raw, 'a página virou imagem').not.toContain('/Subtype /Image');
    expect(raw, 'o texto original não sobreviveu').toContain('(Documento A - pagina 1) Tj');
  });

  /**
   * Pular 1 e começar em 1: a capa é folha avulsa, e o documento de duas
   * páginas passa a ter exatamente UMA numerada.
   */
  test('pular a capa reduz a contagem do que será numerado', async ({ page }) => {
    await open(page);

    await expect(page.getByText('Serão numeradas').locator('xpath=../dd')).toHaveText(/2/);

    await page.getByLabel('Pular as primeiras').fill('1');
    await expect(page.getByText('Serão numeradas').locator('xpath=../dd')).toHaveText(/1/);
  });

  /**
   * "Começar em" é independente de "pular": os botões de formato mostram o
   * número resolvido, então mudar o início muda o rótulo do próprio seletor.
   */
  test('começar em outro número muda o que os formatos mostram', async ({ page }) => {
    await open(page);

    await expect(page.getByRole('radio', { name: 'Página 1', exact: true })).toBeVisible();

    await page.getByLabel('Começar em').fill('7');

    await expect(page.getByRole('radio', { name: 'Página 7', exact: true })).toBeVisible();
  });

  test('o botão volta quando uma opção muda, e não antes', async ({ page }) => {
    await open(page);

    await primary(page, 'Numerar páginas').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(primary(page, 'Numerar páginas')).toBeHidden();

    await page.getByRole('radio', { name: /^— 1 —$/ }).click();
    await expect(primary(page, 'Numerar páginas')).toBeVisible();
  });

  test('rejeita um arquivo que não é PDF', async ({ page }) => {
    await openApp(page, '/pt/pdf/numerar-paginas');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
