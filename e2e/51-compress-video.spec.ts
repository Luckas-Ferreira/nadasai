import { expect, test, type Page } from '@playwright/test';
import { openApp, primary } from './helpers';

const PATH = '/pt/video/comprimir';

/** A compressão toca o vídeo inteiro em tempo real — a fixture é curta. */
const COMPRESSED = { timeout: 90_000 };

/**
 * O COMPRESSOR é a mesma máquina do recorte e do corte sem retângulo e sem
 * intervalo, com resolução e bitrate. A aritmética da saída está em
 * `reencode.spec.ts` (`outputSize`); o que só o navegador prova é a leitura do
 * painel: a lista de alturas depende da altura da ORIGEM, e a estimativa muda
 * junto com os controles.
 *
 * A fixture é 640x480 de propósito: é o menor tamanho que ainda deixa a lista
 * de alturas com algo a oferecer. Numa de 240 de altura NENHUMA das opções
 * reduz, e a lista fica só com "Original" — correto, e inútil para testar o
 * filtro. 480 deixa 360p dentro e 480p, 720p e 1080p fora, que é exatamente a
 * fronteira que interessa.
 */
const SOURCE_H = 480;

async function makeVideo(page: Page, seconds = 2): Promise<Buffer> {
  const base64 = await page.evaluate(async (duration) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);

    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();

    // O GRÃO É LOAD-BEARING, pelo mesmo motivo que o do PNG das fixtures de
    // imagem. Um vídeo de cor chapada comprime a quase nada, então QUALQUER
    // recodificação o deixa maior — e a ferramenta, corretamente, recusa
    // comprimir quando o ajuste engordaria o arquivo. Sem ruído o teste
    // esbarraria nessa recusa e pareceria um defeito do produto.
    const noise = ctx.createImageData(canvas.width, canvas.height);
    const palette = [
      [15, 23, 42],
      [37, 99, 235],
      [255, 255, 255],
      [220, 38, 38],
    ];
    let step = 0;
    const painter = setInterval(() => {
      const [r, g, b] = palette[step % palette.length];
      for (let i = 0; i < noise.data.length; i += 4) {
        const grain = (Math.random() * 160) | 0;
        noise.data[i] = (r + grain) & 255;
        noise.data[i + 1] = (g + grain) & 255;
        noise.data[i + 2] = (b + grain) & 255;
        noise.data[i + 3] = 255;
      }
      ctx.putImageData(noise, 0, 0);
      step++;
    }, 100);

    await new Promise((resolve) => setTimeout(resolve, duration * 1000));
    clearInterval(painter);
    recorder.stop();
    await stopped;

    const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, seconds);

  return Buffer.from(base64, 'base64');
}

async function dropVideo(page: Page, name = 'gravacao.webm'): Promise<number> {
  const buffer = await makeVideo(page);
  expect(buffer.byteLength).toBeGreaterThan(1000);

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name, mimeType: 'video/webm', buffer });

  await expect(page.getByText('Origem', { exact: true })).toBeVisible({ timeout: 30_000 });
  return buffer.byteLength;
}

/** O que o painel diz que o arquivo vai ter: dimensões e tamanho aproximado. */
const estimateCell = (page: Page) =>
  page.locator('dl div', { hasText: 'Tamanho estimado' }).locator('dd');

test.describe('Comprimir vídeo', () => {
  /**
   * A fixture tem 480 de altura, então 1080p, 720p e 480p não podem aparecer:
   * nenhuma das três reduz. Mostrar e ignorar seria pior do que não mostrar, e
   * é o que aconteceria se a lista fosse fixa.
   */
  test('a lista de resoluções só oferece o que de fato reduz', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(page.getByRole('radio', { name: 'Original', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: '360p', exact: true })).toBeVisible();

    for (const label of ['1080p', '720p', '480p']) {
      await expect(page.getByRole('radio', { name: label, exact: true })).toHaveCount(0);
    }
  });

  test('a estimativa muda quando a qualidade muda', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await page.getByRole('radio', { name: 'Alta', exact: true }).click();
    const high = await estimateCell(page).innerText();

    await page.getByRole('radio', { name: 'Leve', exact: true }).click();
    await expect(estimateCell(page)).not.toHaveText(high);
  });

  /** Baixar a altura tem de aparecer nas DIMENSÕES anunciadas, não só no peso. */
  test('baixar a resolução muda o tamanho anunciado do quadro', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await page.getByRole('radio', { name: 'Original', exact: true }).click();
    await expect(estimateCell(page)).toContainText(`× ${SOURCE_H}`);

    await page.getByRole('radio', { name: '360p', exact: true }).click();
    await expect(estimateCell(page)).not.toContainText(`× ${SOURCE_H}`);
  });

  test('comprime e baixa um vídeo de verdade, e ele é MENOR', async ({ page }) => {
    await openApp(page, PATH);
    const sourceBytes = await dropVideo(page);

    await page.getByRole('radio', { name: '360p', exact: true }).click();
    await page.getByRole('radio', { name: 'Leve', exact: true }).click();

    await primary(page, 'Comprimir o vídeo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(COMPRESSED);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^gravacao-comprimido\.(webm|mp4)$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);
    const head = bytes.subarray(0, 16);

    const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    const isMp4 = head.toString('latin1').includes('ftyp');
    expect(isWebm || isMp4).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(500);

    // A promessa da ferramenta, e a única asserção que a cobre: o arquivo tem
    // de SAIR MENOR. Sem ela o teste aprovaria uma compressão que engorda.
    expect(bytes.byteLength).toBeLessThan(sourceBytes);
  });

  test('o botão volta quando o ajuste muda, e não antes', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await page.getByRole('radio', { name: '360p', exact: true }).click();
    await page.getByRole('radio', { name: 'Leve', exact: true }).click();

    await primary(page, 'Comprimir o vídeo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(COMPRESSED);
    await expect(primary(page, 'Comprimir o vídeo')).toBeHidden();

    await page.getByRole('radio', { name: 'Equilibrada', exact: true }).click();
    await expect(primary(page, 'Comprimir o vídeo')).toBeVisible();
  });

  test('rejeita um arquivo que não é vídeo', async ({ page }) => {
    await openApp(page, PATH);
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
