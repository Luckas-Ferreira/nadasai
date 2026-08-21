import { expect, test } from '@playwright/test';
import { PHOTO, expectDownload, openApp, primary, upload } from './helpers';

/**
 * O ICO é o único formato do produto cuja estrutura o navegador não sabe ler de
 * volta — não há `Image` que decodifique um ICO multi-resolução e diga quantas
 * entradas ele tem. Então a asserção aqui é sobre os BYTES: o cabeçalho ICONDIR
 * declara quantas imagens existem, e é isso que separa "gerou o arquivo" de
 * "gerou o arquivo que a seleção pediu".
 *
 * É a mesma escolha do `18-remove-exif`, que confere o rabo do JPEG depois do
 * SOS em vez de confiar na tela.
 */
async function readIco(download: import('@playwright/test').Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const buf = Buffer.concat(chunks);

  return {
    reserved: buf.readUInt16LE(0),
    type: buf.readUInt16LE(2),
    count: buf.readUInt16LE(4),
    /** 0 no byte de tamanho significa 256, que é como o formato codifica o maior. */
    sizes: Array.from({ length: buf.readUInt16LE(4) }, (_, i) => buf.readUInt8(6 + i * 16) || 256),
    bytes: buf.length,
  };
}

test.describe('Favicon', () => {
  test('escreve um ICO com uma entrada por tamanho marcado', async ({ page }) => {
    await openApp(page, '/pt/imagem/favicon');
    await upload(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await primary(page, 'Gerar .ico').click();
        await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
          timeout: 30_000,
        });
        await page.getByRole('button', { name: 'Baixar', exact: true }).click();
      })(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^photo-favicon\.ico$/);

    const ico = await readIco(download);
    expect(ico.reserved).toBe(0);
    expect(ico.type).toBe(1); // 1 = ícone, 2 = cursor
    expect(ico.count).toBe(4); // 16, 32, 48, 256 são os marcados por padrão
    expect(ico.sizes).toEqual([16, 32, 48, 256]);
  });

  test('marcar e desmarcar tamanhos muda o que sai no arquivo', async ({ page }) => {
    await openApp(page, '/pt/imagem/favicon');
    await upload(page);

    for (const size of ['48', '256']) {
      await page.getByRole('button', { name: size, exact: true }).click();
    }
    await page.getByRole('button', { name: '128', exact: true }).click();

    await primary(page, 'Gerar .ico').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect((await readIco(download)).sizes).toEqual([16, 32, 128]);
  });

  /**
   * Um ICO sem entrada nenhuma não é um arquivo degradado, é um arquivo
   * inválido — e o encoder lança nesse caso. Recusar o último clique é mais
   * honesto do que deixar chegar até o erro.
   */
  test('não deixa desmarcar o último tamanho', async ({ page }) => {
    await openApp(page, '/pt/imagem/favicon');
    await upload(page);

    for (const size of ['16', '32', '48', '256']) {
      await page.getByRole('button', { name: size, exact: true }).click();
    }

    // O último clique foi recusado: sobrou exatamente um marcado.
    await expect(page.getByRole('button', { name: '256', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(primary(page, 'Gerar .ico')).toBeEnabled();
  });

  /**
   * O botão primário some quando apertá-lo só reproduziria o arquivo que já
   * está na tela, e volta assim que a seleção muda. É a mesma regra do resto do
   * produto, e a que evita "apertei e não aconteceu nada".
   */
  test('o botão volta quando a seleção muda, e não antes', async ({ page }) => {
    await openApp(page, '/pt/imagem/favicon');
    await upload(page);

    await primary(page, 'Gerar .ico').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(primary(page, 'Gerar .ico')).toBeHidden();

    await page.getByRole('button', { name: '64', exact: true }).click();
    await expect(primary(page, 'Gerar .ico')).toBeVisible();
  });

  test('avisa quando a imagem não é quadrada, em vez de esticá-la em silêncio', async ({ page }) => {
    await openApp(page, '/pt/imagem/favicon');
    await upload(page, PHOTO);

    // Pelo papel, e não pelo texto solto: o artigo no pé da página explica o
    // mesmo encaixe com as mesmas palavras, e uma busca solta acha os dois.
    await expect(page.getByRole('alert').filter({ hasText: /não é quadrada/ })).toBeVisible();
  });

  /**
   * `produces: null` — o ICO é terminal. Oferecer "comprimir imagem" a seguir
   * seria pior do que não oferecer nada, porque nenhuma ferramenta daqui abre
   * um ICO de volta.
   */
  test('é o fim da cadeia: nenhum próximo passo é oferecido', async ({ page }) => {
    await openApp(page, '/pt/imagem/favicon');
    await upload(page);

    await primary(page, 'Gerar .ico').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.getByText('Enviar para outra ferramenta')).toBeHidden();
  });
});
