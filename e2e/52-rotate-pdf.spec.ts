import { statSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { DOC_LONG, expectDownload, openApp, primary, upload } from './helpers';

const PATH = '/pt/pdf/girar';

/**
 * GIRAR é a única ferramenta de PDF daqui que não perde nada, e a asserção que
 * mais importa é justamente essa: o arquivo que sai continua tendo TEXTO. Um
 * caminho que rasterizasse — como o comprimir com perda, o proteger e o
 * censurar fazem — passaria em qualquer teste de "baixou um PDF".
 *
 * O resto cobre o controle que separa esta ferramenta do organizar: girar
 * TODAS as páginas de uma vez.
 */
const READY = { timeout: 30_000 };

const turnedCell = (page: Page) => page.locator('dl div', { hasText: 'Giradas' }).locator('dd');

async function openDoc(page: Page): Promise<void> {
  await openApp(page, PATH);
  await upload(page, DOC_LONG);
  await expect(page.getByText('Páginas', { exact: true })).toBeVisible(READY);
}

test.describe('Girar PDF', () => {
  test('sem girar nada não há o que salvar, e a página diz', async ({ page }) => {
    await openDoc(page);

    await expect(turnedCell(page)).toHaveText('0');
    await expect(page.getByRole('alert')).toContainText('Nenhuma página foi girada');
    await expect(primary(page, 'Salvar girado')).toBeDisabled();
  });

  /** O controle principal: uma ação, o documento inteiro. */
  test('girar tudo gira todas as páginas de uma vez', async ({ page }) => {
    await openDoc(page);

    const pages = Number(
      await page.locator('dl div', { hasText: 'Páginas' }).locator('dd').innerText(),
    );
    expect(pages).toBeGreaterThan(1);

    await page.getByRole('button', { name: 'Direita', exact: true }).click();

    await expect(turnedCell(page)).toHaveText(String(pages));
    await expect(page.getByRole('alert')).toBeHidden();
    await expect(primary(page, 'Salvar girado')).toBeEnabled();
  });

  /**
   * Quatro voltas de 90° são a identidade. É o que prova que a rotação SOMA
   * sobre o que a página já tinha em vez de ser atribuída — e é o mesmo motivo
   * por que acertar uma página avulsa antes de girar tudo funciona.
   */
  test('quatro voltas voltam ao começo', async ({ page }) => {
    await openDoc(page);

    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'Direita', exact: true }).click();
    }

    await expect(turnedCell(page)).toHaveText('0');
    await expect(primary(page, 'Salvar girado')).toBeDisabled();
  });

  test('salva um PDF com o nome derivado do original', async ({ page }) => {
    await openDoc(page);
    await page.getByRole('button', { name: 'Esquerda', exact: true }).click();

    await primary(page, 'Salvar girado').click();
    await expectDownload(page, /^doc-long-girado\.pdf$/);
  });

  /**
   * A asserção que carrega a ferramenta. Girar grava um número dentro do PDF;
   * não redesenha nada. Se algum dia isto virar um caminho que rasteriza, os
   * bytes de fonte somem e este teste cai — que é exatamente o que se quer.
   */
  test('o PDF salvo continua tendo texto, não uma imagem da página', async ({ page }) => {
    await openDoc(page);
    await page.getByRole('button', { name: '180°', exact: true }).click();

    // Salvar PRODUZ o resultado; baixar é o segundo passo. Esperar o download
    // no clique do primário trava até o timeout.
    await primary(page, 'Salvar girado').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(READY);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);

    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    /**
     * Duas marcas, e nenhuma delas é `/Font`: o pdf-lib salva com
     * `useObjectStreams`, então os dicionários de recurso ficam dentro de um
     * fluxo comprimido e não aparecem nos bytes crus — a mesma armadilha que o
     * spec do limpar metadados registra.
     *
     * O que aparece cru é um XObject de imagem, porque a especificação proíbe
     * pôr fluxo dentro de object stream. Então: nenhuma imagem, e o arquivo do
     * mesmo tamanho de grandeza do original. Um caminho que rasterizasse
     * falharia nas duas.
     */
    const text = bytes.toString('latin1');
    expect(text).not.toContain('/Image');

    const original = statSync(DOC_LONG).size;
    expect(bytes.byteLength).toBeLessThan(original * 2);
  });

  test('rejeita um arquivo que não é PDF', async ({ page }) => {
    await openApp(page, PATH);
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
