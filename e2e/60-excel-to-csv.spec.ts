import { expect, test, type Page } from '@playwright/test';
import { zipSync } from 'fflate';
import { openApp, primary } from './helpers';

const PATH = '/pt/office/excel-para-csv';

const READY = { timeout: 30_000 };

/**
 * A GRAMÁTICA está coberta em unidade por `office/xlsx-read.spec.ts`, com as
 * três indireções que o formato cobra e o ano bissexto que nunca existiu. O que
 * só o navegador prova é o laço: as abas aparecendo com a contagem de cada uma,
 * a prévia na tela ANTES do download, e o separador mudando o arquivo.
 *
 * A fixture é montada em NODE com fflate, como no 47, no 58 e no 59.
 */
const enc = new TextEncoder();
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

function makeXlsx() {
  const sheet1 = `<?xml version="1.0"?><worksheet ${NS}><sheetData>
    <row><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row><c r="A2" t="s"><v>3</v></c><c r="B2"><v>1234.56</v></c><c r="C2" s="1"><v>45000</v></c></row>
    <row><c r="A3" t="s"><v>4</v></c><c r="C3" s="1"><v>45001</v></c></row>
  </sheetData></worksheet>`;

  const sheet2 = `<?xml version="1.0"?><worksheet ${NS}><sheetData></sheetData></worksheet>`;

  return {
    name: 'vendas.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(
      zipSync({
        '[Content_Types].xml': enc.encode('<?xml version="1.0"?><Types/>'),
        'xl/workbook.xml': enc.encode(
          `<?xml version="1.0"?><workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
            '<sheets><sheet name="Vendas" sheetId="1" r:id="rId1"/>' +
            '<sheet name="Vazia" sheetId="2" r:id="rId2"/></sheets></workbook>',
        ),
        'xl/_rels/workbook.xml.rels': enc.encode(
          '<?xml version="1.0"?><Relationships>' +
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>' +
            '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
        ),
        'xl/sharedStrings.xml': enc.encode(
          `<?xml version="1.0"?><sst ${NS}>` +
            '<si><t>Cliente</t></si><si><t>Valor</t></si><si><t>Data</t></si>' +
            '<si><t>Ana; Souza</t></si><si><t>Bruno</t></si></sst>',
        ),
        'xl/styles.xml': enc.encode(
          `<?xml version="1.0"?><styleSheet ${NS}><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
        ),
        'xl/worksheets/sheet1.xml': enc.encode(sheet1),
        'xl/worksheets/sheet2.xml': enc.encode(sheet2),
      }),
    ),
  };
}

const cell = (page: Page, label: string) =>
  page.locator('dl div', { hasText: label }).locator('dd').first();

const preview = (page: Page) => page.locator('pre');

async function convert(page: Page): Promise<void> {
  await openApp(page, PATH);
  await page.locator('input[type=file]').first().setInputFiles(makeXlsx());
  await expect(page.getByRole('radio', { name: 'Vendas', exact: true })).toBeVisible(READY);
  await primary(page, 'Converter a aba').click();
  await expect(preview(page)).toBeVisible(READY);
}

test.describe('Excel para CSV', () => {
  test('lista as abas e conta as linhas antes de converter', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles(makeXlsx());

    await expect(page.getByRole('radio', { name: 'Vendas', exact: true })).toBeVisible(READY);
    await expect(page.getByRole('radio', { name: 'Vazia', exact: true })).toBeVisible();
    await expect(cell(page, 'Linhas')).toHaveText('3');
    await expect(cell(page, 'Colunas')).toHaveText('3');
  });

  /**
   * As três indireções de uma vez: o texto vem da tabela compartilhada, a data
   * vem do estilo, e a célula B3 está AUSENTE — o que precisa virar campo
   * vazio na posição certa, e não deslocar a coluna C para a esquerda.
   */
  test('resolve texto, data e a célula que não existe', async ({ page }) => {
    await convert(page);

    // `textContent` e não `innerText`: o CSV separa linhas com CRLF por
    // especificação, e o `innerText` normaliza a quebra e ainda devolve a
    // indentação do template — a asserção passaria a medir o que o navegador
    // mostra em vez do que o arquivo tem.
    const csv = (await preview(page).textContent()) ?? '';
    const lines = csv.trim().split('\r\n');

    expect(lines[0]).toBe('Cliente;Valor;Data');
    expect(lines[1]).toBe('"Ana; Souza";1234.56;2023-03-15');
    expect(lines[2]).toBe('Bruno;;2023-03-16');
  });

  /** O padrão é ponto e vírgula, e trocar o separador muda o que é citado. */
  test('trocar o separador muda o arquivo', async ({ page }) => {
    await convert(page);

    await page.getByRole('radio', { name: 'Vírgula', exact: true }).click();
    await primary(page, 'Converter a aba').click();
    await expect(preview(page)).toBeVisible(READY);

    const lines = ((await preview(page).textContent()) ?? '').trim().split('\r\n');
    expect(lines[0]).toBe('Cliente,Valor,Data');
    expect(lines[1]).toBe('Ana; Souza,1234.56,2023-03-15');
  });

  test('em JSON a primeira linha vira as chaves', async ({ page }) => {
    await convert(page);

    await page.getByRole('radio', { name: 'JSON', exact: true }).click();
    await primary(page, 'Converter a aba').click();
    await expect(preview(page)).toBeVisible(READY);

    const parsed = JSON.parse((await preview(page).textContent()) ?? "[]");
    expect(parsed[0]).toEqual({ Cliente: 'Ana; Souza', Valor: '1234.56', Data: '2023-03-15' });
  });

  test('a aba vazia é explicada e não deixa converter', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles(makeXlsx());
    await expect(page.getByRole('radio', { name: 'Vazia', exact: true })).toBeVisible(READY);

    await page.getByRole('radio', { name: 'Vazia', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('não tem célula preenchida');
    await expect(primary(page, 'Converter a aba')).toBeDisabled();
  });

  test('baixa como .csv e como .json, conforme a saída', async ({ page }) => {
    await convert(page);

    const [csv] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);
    expect(csv.suggestedFilename()).toBe('vendas-planilha.csv');

    await page.getByRole('radio', { name: 'JSON', exact: true }).click();
    await primary(page, 'Converter a aba').click();
    await expect(preview(page)).toBeVisible(READY);

    const [json] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);
    expect(json.suggestedFilename()).toBe('vendas-planilha.json');
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
