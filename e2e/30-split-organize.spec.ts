import { expect, test } from '@playwright/test';
import { DOC_LONG, NOT_AN_IMAGE, expectDownload, openApp, primary, upload } from './helpers';

/**
 * Dividir e organizar, juntas porque são as duas ferramentas que mexem na
 * SEQUÊNCIA das páginas sem tocar no conteúdo delas — e porque as duas tinham a
 * mesma cobertura até aqui: a navegação do 01-shell, que só prova que a rota
 * abre.
 *
 * A fixture é o documento de seis páginas. Com duas, "dividir a cada 2 páginas"
 * e "extrair todas" produzem a mesma coisa, e o teste passaria sem separar os
 * dois modos.
 */

/** Rasterizar as miniaturas de seis páginas pelo pdf.js é a parte lenta. */
const READY = { timeout: 60_000 };

test.describe('Dividir PDF', () => {
  const PATH = '/pt/pdf/dividir';

  /**
   * NOME FORA DO PADRÃO, e o teste registra o que a ferramenta FAZ hoje.
   *
   * Todo o resto do produto deriva o nome de `originalName` + o `suffix` do
   * `ToolDef` (`photo-crop.png`, `clip-cut.wav`, `doc-a-redacted.pdf`). Dividir
   * escreve `doc-long_split_files.zip` e `doc-long_range_1.pdf`, ou seja, ignora
   * o `suffix: 'split'` que declara em `tools.ts`. Dentro do zip os nomes
   * PRECISAM se distinguir, então `_range_1` ali é certo; o nome do zip e o do
   * arquivo único é que destoam. Fica pinado como está: mudar nome de download é
   * decisão de produto, não efeito colateral de escrever teste.
   */
  test('extracts every page and hands back a zip', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_LONG);

    await expect(primary(page, 'Dividir PDF')).toBeVisible(READY);

    await page.getByRole('radio', { name: 'Páginas' }).click();
    await primary(page, 'Dividir PDF').click();

    // Vários arquivos não são um PDF: a saída é um zip, e é isso que a barra de
    // ações lê para não oferecer "assinar PDF" a seguir.
    await expectDownload(page, /^doc-long_split_files\.zip$/);
  });

  test('a single range comes back as a PDF, not a zip', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_LONG);
    await expect(primary(page, 'Dividir PDF')).toBeVisible(READY);

    // O modo intervalo já abre com um intervalo só, cobrindo o documento
    // inteiro — e um arquivo só continua sendo um PDF.
    await primary(page, 'Dividir PDF').click();
    await expectDownload(page, /^doc-long_range_1\.pdf$/);
  });

  test('rejects a file that is not a PDF', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(primary(page, 'Dividir PDF')).toHaveCount(0);
  });
});

test.describe('Organizar PDF', () => {
  const PATH = '/pt/pdf/organizar';

  test('reads every page and writes the reordered document', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_LONG);

    // Seis miniaturas, uma por página: a prova de que o documento foi lido, e
    // não apenas aceito.
    await expect(page.locator('app-page-grid li')).toHaveCount(6, READY);

    await page.getByRole('button', { name: 'Mover para depois' }).first().click();
    await primary(page, 'Organizar PDF').click();

    await expectDownload(page, /^doc-long-organized\.pdf$/);
  });

  test('stops offering the run once the result matches the arrangement', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_LONG);
    await expect(page.locator('app-page-grid li')).toHaveCount(6, READY);

    await primary(page, 'Organizar PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(READY);

    // Apertar de novo sem mexer em nada só reproduziria os mesmos bytes.
    await expect(primary(page, 'Organizar PDF')).toHaveCount(0);

    // Mexer na ordem devolve o botão: agora existe um resultado a produzir que
    // é diferente do que está na tela.
    await page.getByRole('button', { name: 'Mover para depois' }).first().click();
    await expect(primary(page, 'Organizar PDF')).toBeVisible();
  });
});
