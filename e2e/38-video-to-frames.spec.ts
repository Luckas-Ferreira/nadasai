import { expect, test, type Page } from '@playwright/test';
import { openApp, primary } from './helpers';

const PATH = '/pt/video/extrair-quadros';

/** Posicionar e decodificar quadro é a parte lenta, como no GIF. */
const READY = { timeout: 90_000 };

/**
 * Mesma fixture do 37: um WebM gravado pela própria página. Ele é uma gravação
 * de MediaRecorder, ou seja, chega sem duração no cabeçalho — e a duração é
 * justamente o que decide quantos quadros o modo de intervalo produz. Se o
 * conserto do `probeVideo` regredir, é aqui que aparece.
 */
async function makeVideo(page: Page, seconds = 3): Promise<Buffer> {
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

test.describe('Extrair quadros', () => {
  test('captures one frame as a real image file', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(primary(page, 'Capturar este quadro')).toBeVisible(READY);
    await primary(page, 'Capturar este quadro').click();

    // A prévia é o próprio arquivo: se o navegador a desenha, os bytes são uma
    // imagem de verdade e não um canvas renomeado. Ancorada pelo alt e não por
    // `img[src^=blob:]`: a barra de arquivo também mantém uma miniatura em
    // object URL, e a consulta solta pegava a dela.
    const preview = page.getByAltText('Quadro pronto');
    await expect(preview).toBeVisible(READY);

    const size = await preview.evaluate((img: HTMLImageElement) => ({
      w: img.naturalWidth,
      h: img.naturalHeight,
    }));

    // O vídeo sintético é 320x240, e o padrão é a resolução original: capturar
    // na largura da janela em vez da do arquivo é o defeito que a tecla de print
    // tem e esta ferramenta existe para não ter.
    expect(size.w).toBe(320);
    expect(size.h).toBe(240);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^gravacao-frame\.png$/);
  });

  test('extracts a batch into a zip', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(primary(page, 'Capturar este quadro')).toBeVisible(READY);

    await page.getByRole('radio', { name: 'A cada N segundos' }).click();
    await expect(page.getByText('Quadros a extrair')).toBeVisible();

    await primary(page, 'Extrair quadros').click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    // Vários arquivos não são uma imagem: a saída vira zip, e é isso que a barra
    // de ações lê para não oferecer "cortar imagem" a seguir.
    expect(download.suggestedFilename()).toMatch(/^gravacao-frames\.zip$/);
  });

  test('counts the frames the interval produces before running', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(primary(page, 'Capturar este quadro')).toBeVisible(READY);
    await page.getByRole('radio', { name: 'A cada N segundos' }).click();

    const counter = page.getByText('Quadros a extrair').locator('xpath=following-sibling::span[1]');

    // Três segundos de vídeo a cada 1 s são três quadros; a meio segundo, seis.
    // Se `probeVideo` voltar a devolver duração errada para WebM de gravação, a
    // conta muda e este número denuncia.
    await expect(counter).toHaveText('3');

    await page.getByRole('radio', { name: '0.5s' }).click();
    await expect(counter).toHaveText('6');
  });

  test('writes JPG when JPG is what was asked for', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(primary(page, 'Capturar este quadro')).toBeVisible(READY);
    await page.getByRole('radio', { name: 'JPG', exact: true }).click();
    await primary(page, 'Capturar este quadro').click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^gravacao-frame\.jpg$/);
  });

  test('rejects a file that is not a video', async ({ page }) => {
    await openApp(page, PATH);
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({
        name: 'notas.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('definitivamente nao e um video'),
      });

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(primary(page, 'Capturar este quadro')).toHaveCount(0);
  });
});
