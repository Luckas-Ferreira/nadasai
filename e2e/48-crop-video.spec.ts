import { expect, test, type Page } from '@playwright/test';
import { drawRegion, openApp, primary } from './helpers';

const PATH = '/pt/video/recortar';

/** O recorte toca o vídeo inteiro em tempo real — a espera é a duração dele. */
const CROPPED = { timeout: 90_000 };

/**
 * O RECORTE DE VÍDEO só existe de verdade num navegador: ele depende de
 * `MediaRecorder`, de `canvas.captureStream()` e de um `AudioContext` que num
 * Karma headless não sai do estado suspenso. `crop.spec.ts` cobre em unidade a
 * parte que dá para isolar — a aritmética do retângulo, onde mora o defeito
 * silencioso do lado ímpar. Tudo o mais é aqui.
 *
 * A fixture é a mesma dos specs 37 e 38: um WebM gravado pela própria página,
 * sem binário no repositório. Ele chega SEM duração no cabeçalho, como toda
 * gravação de MediaRecorder — e aqui isso importa duas vezes, porque a duração
 * é o que a tela usa para estimar a espera.
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
}

/** As dimensões que o painel diz que o arquivo vai ter. */
const resultSize = (page: Page) => page.getByText('Resultado', { exact: true }).locator('xpath=../dd');

test.describe('Recortar vídeo', () => {
  test('desenhar a área anuncia as dimensões antes de recortar', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(page.getByText('Origem', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(resultSize(page)).toHaveText('—');

    await drawRegion(page, { x: 0.2, y: 0.2 }, { x: 0.7, y: 0.8 });

    await expect(resultSize(page)).toHaveText(/\d+ × \d+/);
  });

  /**
   * O lado ímpar é o defeito que aparece só no MP4 e só em alguns navegadores.
   * A garantia é da aritmética, e aqui se confere que ela chegou à tela.
   */
  test('as dimensões anunciadas são sempre pares', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);
    await drawRegion(page, { x: 0.11, y: 0.13 }, { x: 0.69, y: 0.77 });

    const text = await resultSize(page).innerText();
    const [w, h] = text.match(/\d+/g)!.map(Number);

    expect(w % 2).toBe(0);
    expect(h % 2).toBe(0);
  });

  test('recorta e baixa um vídeo que o navegador abre', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);
    await drawRegion(page, { x: 0.25, y: 0.25 }, { x: 0.75, y: 0.75 });

    await primary(page, 'Recortar o vídeo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(CROPPED);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^gravacao-recortado\.(webm|mp4)$/);

    // Os bytes têm de ser um contêiner de verdade. Um WebM começa com a
    // assinatura EBML; um MP4 traz "ftyp" logo no começo.
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const head = Buffer.concat(chunks).subarray(0, 16);

    const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    const isMp4 = head.toString('latin1').includes('ftyp');
    expect(isWebm || isMp4).toBe(true);
  });

  /**
   * A proporção é de PIXEL e a região está em fração de cada eixo, então a
   * conversão precisa passar pelas dimensões do vídeo. Aplicá-la direto nas
   * frações produziria um quadrado só num vídeo quadrado — e a fixture é 4:3,
   * que é exatamente onde o erro apareceria.
   */
  test('a proporção 1:1 produz um quadrado num vídeo que não é quadrado', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);
    await drawRegion(page, { x: 0.1, y: 0.1 }, { x: 0.6, y: 0.9 });

    await page.getByRole('radio', { name: '1:1', exact: true }).click();

    const text = await resultSize(page).innerText();
    const [w, h] = text.match(/\d+/g)!.map(Number);

    // Tolerância de 2 px: os lados são arredondados para baixo até um par.
    expect(Math.abs(w - h)).toBeLessThanOrEqual(2);
  });

  test('o botão volta quando a área muda, e não antes', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);
    await drawRegion(page, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 });

    await primary(page, 'Recortar o vídeo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(CROPPED);
    await expect(primary(page, 'Recortar o vídeo')).toBeHidden();

    await page.getByRole('radio', { name: '9:16', exact: true }).click();
    await expect(primary(page, 'Recortar o vídeo')).toBeVisible();
  });

  test('sem área desenhada não há o que recortar', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(page.getByText('Origem', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(primary(page, 'Recortar o vídeo')).toBeDisabled();
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
