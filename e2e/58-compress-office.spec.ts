import { expect, test, type Page } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { openApp, primary } from './helpers';

const PATH = '/pt/office/comprimir';

const COMPRESSED = { timeout: 60_000 };
const READY = { timeout: 30_000 };

/**
 * A ESCOLHA de quais entradas são candidatas está coberta em unidade por
 * `office/media.spec.ts`, com um zip fictício. O que só o navegador prova é o
 * resto: a imagem de verdade sendo decodificada, reduzida e recodificada, e —
 * a asserção que carrega a ferramenta — o XML do documento saindo IDÊNTICO.
 *
 * A fixture é montada em NODE com fflate e um PNG escrito à mão, pela mesma
 * regra de sempre: nenhum binário entra no repositório. O `import('fflate')`
 * dentro de `page.evaluate` não resolveria — especificador nu não existe no
 * contexto do navegador —, e o spec roda em Node, onde a dependência já está.
 */
const DOCUMENT_XML = '<?xml version="1.0"?><w:document>Conteudo do relatorio</w:document>';

/**
 * Um BMP de 24 bits com RUÍDO, e as duas escolhas são deliberadas.
 *
 * BMP porque ele não tem canal alfa, e é isso que faz a ferramenta recodificar
 * a imagem como JPEG — o caminho que uma foto de verdade percorre. Um PNG
 * continuaria PNG, pela regra que protege logo com fundo transparente, e o
 * ganho viria só da redução de tamanho.
 *
 * Ruído porque imagem chapada comprime a quase nada dentro do zip, e qualquer
 * recodificação a deixaria MAIOR — a ferramenta então corretamente devolveria o
 * original, e o teste mediria o contrário do que quer. É a mesma armadilha que
 * o PNG das fixtures de imagem e a do compressor de vídeo já documentam.
 *
 * O gerador é um LCG com `Math.imul`: multiplicar em ponto flutuante estoura
 * 2^53, perde precisão e degenera numa sequência quase constante — o que
 * comprime muito bem e produz exatamente a fixture que não serve.
 */
function noisyBmp(side: number): Uint8Array {
  const rowBytes = side * 3;
  if (rowBytes % 4 !== 0) throw new Error('lado precisa dar linha múltipla de 4');

  const pixels = rowBytes * side;
  const out = new Uint8Array(54 + pixels);
  const view = new DataView(out.buffer);

  out[0] = 0x42; // "B"
  out[1] = 0x4d; // "M"
  view.setUint32(2, out.length, true);
  view.setUint32(10, 54, true);

  view.setUint32(14, 40, true); // tamanho do cabeçalho DIB
  view.setInt32(18, side, true);
  view.setInt32(22, side, true);
  view.setUint16(26, 1, true); // planos
  view.setUint16(28, 24, true); // bits por pixel
  view.setUint32(34, pixels, true);

  let seed = 7;
  for (let i = 0; i < pixels; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    out[54 + i] = (seed >>> 16) & 255;
  }

  return out;
}

function makeDocx(withPicture = true): { name: string; mimeType: string; buffer: Buffer } {
  const enc = new TextEncoder();

  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': enc.encode('<?xml version="1.0"?><Types/>'),
    'word/document.xml': enc.encode(DOCUMENT_XML),
    // Vetorial da Microsoft: nenhum navegador decodifica, e ele tem de sair
    // intacto do outro lado.
    'word/media/grafico.emf': new Uint8Array(4096),
  };

  if (withPicture) entries['word/media/foto.bmp'] = noisyBmp(600);

  return {
    name: 'relatorio.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(zipSync(entries)),
  };
}

const cell = (page: Page, label: string) =>
  page.locator('dl div', { hasText: label }).locator('dd');

async function dropDocx(page: Page, withPicture = true): Promise<void> {
  await openApp(page, PATH);
  await page.locator('input[type=file]').first().setInputFiles(makeDocx(withPicture));
  await expect(page.getByText('Imagens encontradas', { exact: true })).toBeVisible(READY);
}

test.describe('Comprimir Office', () => {
  /** O teto do ganho aparece ANTES de processar — nada é decodificado ali. */
  test('mede as imagens antes de comprimir', async ({ page }) => {
    await dropDocx(page);

    await expect(cell(page, 'Imagens encontradas')).toHaveText('1');
    await expect(cell(page, 'Peso das imagens')).toContainText('%');
    await expect(cell(page, 'Resultado')).toHaveText('—');
    await expect(primary(page, 'Comprimir o arquivo')).toBeEnabled();
  });

  /**
   * EMF é o caso comum de "não deu para comprimir", não a exceção: é o que o
   * Word grava quando se cola um gráfico.
   */
  test('sem imagem recomprimível, diz por quê e não deixa aplicar', async ({ page }) => {
    await dropDocx(page, false);

    await expect(cell(page, 'Imagens encontradas')).toHaveText('0');
    await expect(page.getByRole('alert')).toContainText('EMF e WMF');
    await expect(primary(page, 'Comprimir o arquivo')).toBeDisabled();
  });

  test('comprime e baixa um arquivo menor', async ({ page }) => {
    await dropDocx(page);

    await page.getByRole('radio', { name: 'Leve', exact: true }).click();
    await primary(page, 'Comprimir o arquivo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(COMPRESSED);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('relatorio-comprimido.docx');

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);

    expect(bytes.byteLength).toBeLessThan(makeDocx().buffer.byteLength);
    await expect(cell(page, 'Imagens trocadas')).toHaveText('1');
  });

  /**
   * A ASSERÇÃO QUE CARREGA A FERRAMENTA. O documento tem de sair idêntico: se
   * algum dia isto passar a reescrever OOXML, o arquivo pode deixar de abrir no
   * Word e nenhum teste de tamanho perceberia.
   */
  test('o XML do documento sai byte a byte igual, e o EMF também', async ({ page }) => {
    await dropDocx(page);

    await primary(page, 'Comprimir o arquivo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(COMPRESSED);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);

    const out = unzipSync(new Uint8Array(Buffer.concat(chunks)));

    expect(new TextDecoder().decode(out['word/document.xml'])).toBe(DOCUMENT_XML);
    expect(out['word/media/grafico.emf'].byteLength).toBe(4096);
    expect(Object.keys(out).sort()).toEqual(
      ['[Content_Types].xml', 'word/document.xml', 'word/media/foto.bmp', 'word/media/grafico.emf'].sort(),
    );
  });

  test('o botão volta quando o nível muda, e não antes', async ({ page }) => {
    await dropDocx(page);

    await primary(page, 'Comprimir o arquivo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(COMPRESSED);
    await expect(primary(page, 'Comprimir o arquivo')).toBeHidden();

    await page.getByRole('radio', { name: 'Alta', exact: true }).click();
    await expect(primary(page, 'Comprimir o arquivo')).toBeVisible();
  });

  test('rejeita um arquivo que não é do Office, falando do Office', async ({ page }) => {
    await openApp(page, PATH);
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    // A recusa fala pelo módulo que recusou: antes desta ferramenta, um tipo
    // `docx` caía no texto de imagem e mandava usar PNG ou JPEG.
    await expect(page.getByRole('alert')).toContainText('.docx');
  });
});
