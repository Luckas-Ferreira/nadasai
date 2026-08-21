import { expect, test, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import { openApp, primary } from './helpers';

/**
 * A leitura e a limpeza são cobertas em unidade por `office/metadata.spec.ts`,
 * incluindo a igualdade byte a byte das outras entradas do zip. O que só o
 * navegador prova é o LAÇO: a tabela mostrar o que existe, a limpeza acontecer,
 * e a tabela ser RELIDA a partir do arquivo limpo — que é a diferença entre a
 * página afirmar que limpou e a página mostrar que limpou.
 *
 * A fixture é montada em tempo de execução com fflate, pela mesma regra de
 * sempre: nenhum binário entra no repositório.
 */

/**
 * Montada em NODE e não na página: um `import('fflate')` dentro de
 * `page.evaluate` não resolve — especificador nu não existe no contexto do
 * navegador. O spec roda em Node, onde a dependência já está instalada, e o
 * arquivo chega pelo `setInputFiles` como qualquer outro.
 */
function makeDocx(): { name: string; mimeType: string; buffer: Buffer } {
  const enc = new TextEncoder();

  const bytes = zipSync({
    '[Content_Types].xml': enc.encode('<?xml version="1.0"?><Types/>'),
    'docProps/core.xml': enc.encode(
      '<?xml version="1.0"?><cp:coreProperties>' +
        '<dc:title>Proposta</dc:title>' +
        '<dc:creator>Maria Silva</dc:creator>' +
        '<cp:lastModifiedBy>joao-pc-de-casa</cp:lastModifiedBy>' +
        '</cp:coreProperties>',
    ),
    'docProps/app.xml': enc.encode(
      '<?xml version="1.0"?><Properties>' +
        '<Company>Concorrente SA</Company>' +
        '<TotalTime>842</TotalTime>' +
        '</Properties>',
    ),
    'word/document.xml': enc.encode('<?xml version="1.0"?><w:document>Conteudo</w:document>'),
  });

  return {
    name: 'proposta.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(bytes),
  };
}

async function open(page: Page): Promise<void> {
  await openApp(page, '/pt/privacidade/metadados-office');
  await page.locator('input[type=file]').first().setInputFiles(makeDocx());
  await expect(page.getByText('Campos encontrados')).toBeVisible({ timeout: 30_000 });
}

test.describe('Metadados do Office', () => {
  test('mostra o que o documento diz sobre quem o escreveu', async ({ page }) => {
    await open(page);

    await expect(page.getByRole('cell', { name: 'Maria Silva' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'joao-pc-de-casa' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Concorrente SA' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '842' })).toBeVisible();
  });

  /**
   * A tabela é relida a partir do arquivo LIMPO. É o que separa "a página diz
   * que limpou" de "a página mostra que limpou" — mesma ideia do medidor de
   * rede, que é uma leitura e não uma promessa.
   */
  test('a tabela é relida do arquivo limpo, e não some por decreto', async ({ page }) => {
    await open(page);

    await primary(page, 'Apagar os metadados').click();

    await expect(page.getByText('Não sobrou nada')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('cell', { name: 'Maria Silva' })).toBeHidden();
    await expect(page.getByText('Campos encontrados').locator('xpath=../dd')).toHaveText('0');
  });

  test('baixa a cópia limpa com o nome certo', async ({ page }) => {
    await open(page);

    await primary(page, 'Apagar os metadados').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^proposta-limpo\.docx$/);
  });

  /**
   * O conteúdo tem de atravessar intacto. A asserção é sobre os BYTES do
   * arquivo baixado: o zip continua sendo um zip e a entrada do documento
   * continua lá.
   */
  test('o conteúdo do documento sobrevive à limpeza', async ({ page }) => {
    await open(page);

    await primary(page, 'Apagar os metadados').click();
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

    expect(raw.startsWith('PK')).toBe(true);
    expect(raw).toContain('word/document.xml');
    expect(raw, 'o nome do autor sobreviveu').not.toContain('Maria Silva');
  });

  test('conta quantos campos identificam alguém', async ({ page }) => {
    await open(page);

    await expect(page.getByText('Identificam você').locator('xpath=../dd')).not.toHaveText('0');
  });

  test('rejeita um arquivo que não é do Office', async ({ page }) => {
    await openApp(page, '/pt/privacidade/metadados-office');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
