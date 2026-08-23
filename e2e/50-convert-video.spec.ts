import { expect, test, type Page } from '@playwright/test';
import { openApp, primary } from './helpers';

const PATH = '/pt/video/converter';

/** A conversão toca o vídeo inteiro em tempo real — a fixture é curta. */
const CONVERTED = { timeout: 90_000 };

/**
 * O CONVERSOR DE VÍDEO é a mesma máquina do recorte e do corte
 * (`core/video/reencode.ts`) sem retângulo e sem intervalo: o que ele muda é o
 * CONTÊINER. Por isso o que este arquivo cobre não é a recodificação — essa
 * está em `reencode.spec.ts` e nos specs 48 e 49 — e sim as duas decisões que
 * só existem aqui: escolher um destino que faça sentido, e recusar o que não
 * faz.
 *
 * A fixture é a mesma dos specs 37, 38, 48 e 49: um WebM gravado pela própria
 * página, sem binário no repositório.
 */
async function makeVideo(page: Page, seconds = 2): Promise<Buffer> {
  const base64 = await page.evaluate(async (duration) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);

    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();

    const palette = ['#0f172a', '#2563eb', '#ffffff', '#dc2626'];
    let step = 0;
    const painter = setInterval(() => {
      ctx.fillStyle = palette[step % palette.length];
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      step++;
    }, 60);

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

async function dropVideo(page: Page, name = 'gravacao.webm'): Promise<void> {
  const buffer = await makeVideo(page);
  expect(buffer.byteLength).toBeGreaterThan(1000);

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name, mimeType: 'video/webm', buffer });

  await expect(page.getByText('Origem', { exact: true })).toBeVisible({ timeout: 30_000 });
}

const mp4Button = (page: Page) => page.getByRole('radio', { name: 'MP4', exact: true });
const webmButton = (page: Page) => page.getByRole('radio', { name: 'WEBM', exact: true });

test.describe('Converter vídeo', () => {
  /**
   * A origem é WebM, então o destino tem de chegar apontando para MP4. Se
   * chegasse em WebM, a primeira coisa que a pessoa veria seria o aviso de
   * "mesmo formato" — a ferramenta pareceria quebrada antes de ser usada.
   */
  test('chega apontando para o formato útil, não para o da origem', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(mp4Button(page)).toBeChecked();
    await expect(page.getByRole('alert')).toBeHidden();
    await expect(primary(page, 'Converter o vídeo')).toBeEnabled();
  });

  /** Converter WebM em WebM só acrescentaria uma geração de compressão. */
  test('recusa converter para o formato que o arquivo já tem', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await webmButton(page).click();

    await expect(page.getByRole('alert')).toContainText('já é WEBM');
    await expect(primary(page, 'Converter o vídeo')).toBeDisabled();
  });

  test('converte e baixa um MP4 de verdade', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await primary(page, 'Converter o vídeo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(CONVERTED);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('gravacao-convertido.mp4');

    // O contêiner tem de ser o pedido, e não só a extensão: um MP4 traz "ftyp"
    // logo no começo. Um WebM renomeado passaria em qualquer asserção de nome.
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);

    expect(bytes.subarray(0, 16).toString('latin1')).toContain('ftyp');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  test('o botão volta quando o formato muda, e não antes', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await primary(page, 'Converter o vídeo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(CONVERTED);
    await expect(primary(page, 'Converter o vídeo')).toBeHidden();

    await webmButton(page).click();
    await expect(primary(page, 'Converter o vídeo')).toBeVisible();
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
