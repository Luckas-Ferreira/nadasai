import { expect, test, type Page } from '@playwright/test';
import { openApp, primary } from './helpers';

const PATH = '/pt/video/para-gif';

/** Ler quadro a quadro por posicionamento é a parte lenta, e é o ponto. */
const READY = { timeout: 90_000 };

/**
 * O vídeo é gravado PELA PRÓPRIA PÁGINA, como no 22: um canvas animado passa por
 * um MediaRecorder e vira um WebM de verdade. Nada de binário no repositório, e
 * o arquivo tem a propriedade que mais importa aqui — ele é uma gravação de
 * MediaRecorder, ou seja, vem SEM duração no cabeçalho, que é exatamente o
 * arquivo que as pessoas trazem para virar GIF.
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

    // Quatro cores chapadas girando: é conteúdo de interface, o material que a
    // ferramenta mais recebe. Note que ele NÃO chega aqui com quatro cores — o
    // WebM é codificado com perda no caminho, e é isso que o teste de cores
    // usadas registra.
    const palette = ['#0f172a', '#2563eb', '#ffffff', '#dc2626'];
    let step = 0;
    const painter = setInterval(() => {
      ctx.fillStyle = palette[step % palette.length];
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = palette[(step + 2) % palette.length];
      ctx.fillRect(20, 20, 120, 90);
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

test.describe('Vídeo para GIF', () => {
  test('writes an animated GIF the browser can decode', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(primary(page, 'Gerar GIF')).toBeVisible(READY);
    await primary(page, 'Gerar GIF').click();

    // A prévia é o próprio arquivo: se ela aparece, o navegador aceitou os bytes
    // como GIF — que é a prova que nenhuma asserção sobre o cabeçalho daria.
    const preview = page.locator('img[src^="blob:"]').first();
    await expect(preview).toBeVisible(READY);

    const decoded = await preview.evaluate(
      (img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }),
    );
    expect(decoded.w).toBeGreaterThan(0);
    expect(decoded.h).toBeGreaterThan(0);

    // E o arquivo baixado precisa ser um GIF de verdade, não uma imagem
    // renomeada: os seis primeiros bytes do formato são a assinatura.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^gravacao-gif\.gif$/);

    const stream = await download.createReadStream();
    const head = await new Promise<Buffer>((resolve, reject) => {
      const parts: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => parts.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(parts).subarray(0, 6)));
      stream.on('error', reject);
    });

    expect(head.toString('ascii')).toBe('GIF89a');
  });

  /**
   * Escrever este teste corrigiu uma afirmação do produto.
   *
   * A fixture é feita de quatro cores chapadas, e a expectativa inicial era ver
   * a "paleta exata" — o caminho em que o GIF não aproxima cor nenhuma. Ela não
   * aparece, e o motivo não é a ferramenta: o vídeo passa por um codificador com
   * perda antes de chegar aqui, e ele espalha variação em torno de cada cor
   * chapada. Uma captura que "tem quatro cores" chega com milhares.
   *
   * O texto da página dizia que gravação de tela costuma cair no caminho exato;
   * agora diz que isso vale menos vezes do que parece, e por quê. O que o teste
   * trava é o que de fato acontece: a paleta respeita o teto pedido.
   */
  test('reports how many colours the palette ended up using', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(primary(page, 'Gerar GIF')).toBeVisible(READY);
    await page.getByRole('radio', { name: '64', exact: true }).click();
    await primary(page, 'Gerar GIF').click();

    await expect(page.getByText('Cores usadas')).toBeVisible(READY);

    const used = await page
      .getByText('Cores usadas')
      .locator('xpath=following-sibling::span[1]')
      .innerText();

    expect(Number(used)).toBeGreaterThan(1);
    expect(Number(used)).toBeLessThanOrEqual(64);
  });

  test('re-offers the run when a setting changes, and not otherwise', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(primary(page, 'Gerar GIF')).toBeVisible(READY);
    await primary(page, 'Gerar GIF').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(READY);

    // Mesmos ajustes: apertar de novo só reproduziria os mesmos bytes depois de
    // dezenas de posicionamentos de vídeo.
    await expect(primary(page, 'Gerar GIF')).toHaveCount(0);

    // Muda a taxa de quadros: a largura padrão já é a do vídeo de origem, e
    // clicar nela de novo não mudaria nada — o botão continuaria escondido, com
    // razão.
    await page.getByRole('radio', { name: '8', exact: true }).click();
    await expect(primary(page, 'Gerar GIF')).toBeVisible();
  });

  test('counts the frames it is going to write before writing them', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(primary(page, 'Gerar GIF')).toBeVisible(READY);

    // O painel promete quadros e resolução, não megabytes: no GIF o peso depende
    // do conteúdo, e prometer bytes antes de escrever seria inventar precisão.
    await expect(page.getByText('Quadros a gerar')).toBeVisible();
    await expect(page.getByText(/\d+ · \d+×\d+/)).toBeVisible();
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
    await expect(primary(page, 'Gerar GIF')).toHaveCount(0);
  });
});
