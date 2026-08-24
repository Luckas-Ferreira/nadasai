import { expect, test, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import { openApp, primary } from './helpers';

const PATH = '/pt/office/word-para-texto';

const READY = { timeout: 30_000 };

/**
 * A GRAMÁTICA está coberta em unidade por `office/docx-text.spec.ts`, com XML
 * escrito à mão — inclusive os dois casos que ninguém nota: a lista numerada,
 * cujo formato mora atrás de dois saltos noutro arquivo do pacote, e o título
 * em português, cujo identificador de estilo vem sem acento.
 *
 * O que só o navegador prova é o laço: o zip sendo aberto, a prévia aparecendo
 * na tela ANTES de qualquer download, e a mesma leitura mudando de forma quando
 * se troca Markdown por texto limpo.
 *
 * A fixture é montada em NODE com fflate, pela mesma regra do 47 e do 58:
 * nenhum binário entra no repositório, e um `import('fflate')` dentro de
 * `page.evaluate` não resolveria.
 */
const enc = new TextEncoder();

const para = (text: string, properties = '') =>
  `<w:p>${properties}<w:r><w:t>${text}</w:t></w:r></w:p>`;

function makeDocx(options: { body?: string; numbering?: boolean } = {}) {
  const body =
    options.body ??
    para('Relatorio anual', '<w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr>') +
      para('Primeiro paragrafo do documento.') +
      para(
        'Passo um',
        '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr>',
      ) +
      `<w:tbl><w:tr><w:tc>${para('Item')}</w:tc><w:tc>${para('Valor')}</w:tc></w:tr>` +
      `<w:tr><w:tc>${para('Total')}</w:tc><w:tc>${para('42')}</w:tc></w:tr></w:tbl>`;

  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': enc.encode('<?xml version="1.0"?><Types/>'),
    'word/document.xml': enc.encode(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${body}</w:body></w:document>`,
    ),
  };

  if (options.numbering !== false) {
    entries['word/numbering.xml'] = enc.encode(
      '<?xml version="1.0"?>' +
        '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:abstractNum w:abstractNumId="7"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>' +
        '<w:num w:numId="3"><w:abstractNumId w:val="7"/></w:num>' +
        '</w:numbering>',
    );
  }

  return {
    name: 'relatorio.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(zipSync(entries)),
  };
}

const cell = (page: Page, label: string) =>
  page.locator('dl div', { hasText: label }).locator('dd');

const preview = (page: Page) => page.locator('pre');

async function extract(page: Page, file = makeDocx()): Promise<void> {
  await openApp(page, PATH);
  await page.locator('input[type=file]').first().setInputFiles(file);
  await primary(page, 'Extrair o texto').click();
  await expect(preview(page)).toBeVisible(READY);
}

test.describe('Word para texto', () => {
  /** A prévia é o produto: quem extrai texto quer conferir antes de baixar. */
  test('mostra a prévia na tela, com a estrutura em Markdown', async ({ page }) => {
    await extract(page);

    const text = await preview(page).innerText();

    expect(text).toContain('# Relatorio anual');
    expect(text).toContain('Primeiro paragrafo do documento.');
    expect(text).toContain('| Item | Valor |');
    expect(text).toContain('| --- | --- |');
  });

  /**
   * O formato da lista não está no parágrafo: ele traz um numId, e o caminho
   * até o `numFmt` passa por outro arquivo do pacote. Sem isso a lista sairia
   * com marcador e a ordem dos passos se perderia.
   */
  test('a lista numerada sai numerada, e não com marcador', async ({ page }) => {
    await extract(page);

    expect(await preview(page).innerText()).toContain('1. Passo um');
  });

  test('sem o arquivo de numeração, a mesma lista vira marcador', async ({ page }) => {
    await extract(page, makeDocx({ numbering: false }));

    const text = await preview(page).innerText();
    expect(text).toContain('- Passo um');
    expect(text).not.toContain('1. Passo um');
  });

  test('o texto limpo não tem marcação nenhuma', async ({ page }) => {
    await extract(page);

    await page.getByRole('radio', { name: 'Texto limpo', exact: true }).click();
    await primary(page, 'Extrair o texto').click();
    await expect(preview(page)).toBeVisible(READY);

    const text = await preview(page).innerText();
    expect(text).toContain('Relatorio anual');
    expect(text).not.toContain('# ');
    expect(text).not.toContain('| --- |');
  });

  test('conta palavras, títulos e tabelas', async ({ page }) => {
    await extract(page);

    await expect(cell(page, 'Títulos')).toHaveText('1');
    await expect(cell(page, 'Tabelas')).toHaveText('1');
    expect(Number(await cell(page, 'Palavras').innerText())).toBeGreaterThan(5);
  });

  test('baixa como .md e como .txt, conforme o formato', async ({ page }) => {
    await extract(page);

    const [markdown] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);
    expect(markdown.suggestedFilename()).toBe('relatorio-texto.md');

    await page.getByRole('radio', { name: 'Texto limpo', exact: true }).click();
    await primary(page, 'Extrair o texto').click();
    await expect(preview(page)).toBeVisible(READY);

    const [plain] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);
    expect(plain.suggestedFilename()).toBe('relatorio-texto.txt');
  });

  /** Um .docx sem texto no corpo é caso real, e a página diz o que houve. */
  test('documento sem texto no corpo é explicado, não entregue em branco', async ({ page }) => {
    await extract(page, makeDocx({ body: '<w:p></w:p>' }));

    await expect(page.getByRole('alert')).toContainText('não tem texto no corpo');
  });

  test('rejeita um arquivo que não é do Office', async ({ page }) => {
    await openApp(page, PATH);
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toContainText('.docx');
  });
});
