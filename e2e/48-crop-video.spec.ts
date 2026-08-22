import { expect, test, type Page } from '@playwright/test';
import { openApp, primary } from './helpers';

const PATH = '/pt/video/recortar';

/** O recorte toca o vídeo inteiro em tempo real — a espera é a duração dele. */
const CROPPED = { timeout: 90_000 };

/**
 * O RECORTE DE VÍDEO só existe de verdade num navegador: ele depende de
 * `MediaRecorder`, de `canvas.captureStream()` e de um `AudioContext` que num
 * Karma headless não sai do estado suspenso. `reencode.spec.ts` cobre em
 * unidade a parte que dá para isolar — a aritmética do retângulo, onde mora o
 * defeito silencioso do lado ímpar. Tudo o mais é aqui.
 *
 * E o que este arquivo passou a cobrir de propósito é a MAGNITUDE da caixa, e
 * não só a sua forma. A versão anterior afirmava "lados pares" e "1:1 é
 * quadrado", e as duas passavam sobre uma caixa de 2×2 pixels — que é par e é
 * quadrada, e era o que a ferramenta de fato entregava, porque a interação
 * falava em porcentagem e o recorte em fração. Um teste de forma sem teste de
 * tamanho é um teste que aprova o defeito.
 *
 * A fixture é a mesma dos specs 37 e 38: um WebM gravado pela própria página,
 * sem binário no repositório, e 4:3 de propósito — é onde um erro de proporção
 * aparece. Ele chega SEM duração no cabeçalho, como toda gravação de
 * MediaRecorder.
 */
const SOURCE_W = 320;
const SOURCE_H = 240;

async function makeVideo(page: Page, seconds = 2): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ({ duration, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const stream = canvas.captureStream(30);

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start();

      // Cada quadro num tom diferente: é o que torna visível, na régua de
      // quadro de referência, que o quadro mudou de verdade.
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
    },
    { duration: seconds, width: SOURCE_W, height: SOURCE_H },
  );

  return Buffer.from(base64, 'base64');
}

async function dropVideo(page: Page, name = 'gravacao.webm'): Promise<void> {
  const buffer = await makeVideo(page);
  expect(buffer.byteLength).toBeGreaterThan(1000);

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name, mimeType: 'video/webm', buffer });

  // A cropper.js só monta depois que o quadro de referência foi lido do vídeo,
  // e ela chega com uma caixa já marcada — não há nada a desenhar para começar.
  await expect(page.locator('.cropper-crop-box')).toBeVisible({ timeout: 30_000 });
}

/** As dimensões que o painel diz que o arquivo vai ter. */
const resultSize = (page: Page) => page.locator('dl div', { hasText: 'Resultado' }).locator('dd');

async function announcedBox(page: Page): Promise<{ w: number; h: number }> {
  const text = await resultSize(page).innerText();
  const [w, h] = text.match(/\d+/g)!.map(Number);
  return { w, h };
}

/** Arrasta a alça do canto inferior direito da caixa. */
async function dragHandle(page: Page, dx: number, dy: number): Promise<void> {
  const handle = page.locator('.cropper-point.point-se');
  const box = (await handle.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

test.describe('Recortar vídeo', () => {
  /**
   * A ferramenta chega utilizável: a cropper.js monta com uma caixa de 80% do
   * quadro. E o tamanho anunciado tem de ser um RECORTE — menor que a origem e
   * muito maior que o mínimo. Os dois lados desta asserção são o teste: o
   * quadro inteiro passava quando a fração virava 1 no clamp, e 2×2 passava
   * quando a conta de proporção ficava negativa.
   */
  test('chega com uma área marcada, e ela é um recorte de verdade', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(page.getByText('Origem', { exact: true })).toBeVisible();
    await expect(resultSize(page)).toHaveText(/\d+ × \d+/);

    const { w, h } = await announcedBox(page);

    expect(w).toBeLessThan(SOURCE_W);
    expect(h).toBeLessThan(SOURCE_H);
    expect(w).toBeGreaterThan(SOURCE_W / 3);
    expect(h).toBeGreaterThan(SOURCE_H / 3);
  });

  /**
   * O lado ímpar é o defeito que aparece só no MP4 e só em alguns navegadores.
   * A garantia é da aritmética, e aqui se confere que ela chegou à tela.
   */
  test('as dimensões anunciadas são sempre pares', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);
    await dragHandle(page, -37, -23);

    const { w, h } = await announcedBox(page);

    expect(w % 2).toBe(0);
    expect(h % 2).toBe(0);
    expect(w).toBeGreaterThan(SOURCE_W / 4);
  });

  /** A caixa é uma caixa: puxar a alça muda o que vai ser recortado. */
  test('arrastar a alça muda o tamanho anunciado', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    const before = await announcedBox(page);
    await dragHandle(page, -50, -40);
    const after = await announcedBox(page);

    expect(after.w).toBeLessThan(before.w);
    expect(after.h).toBeLessThan(before.h);
    expect(after.w).toBeGreaterThan(20);
  });

  /**
   * A proporção trava a caixa ENQUANTO se arrasta — antes ela era aplicada
   * depois, ajustando a altura por uma conta em porcentagem que fechava a
   * caixa. A fixture é 4:3 justamente porque um quadrado só é interessante num
   * vídeo que não é quadrado, e o piso de tamanho é o que separa "quadrado" de
   * "degenerado".
   */
  test('a proporção 1:1 produz um quadrado num vídeo que não é quadrado', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await page.getByRole('radio', { name: '1:1', exact: true }).click();

    const { w, h } = await announcedBox(page);

    // Tolerância de 2 px: os lados são arredondados para baixo até um par.
    expect(Math.abs(w - h)).toBeLessThanOrEqual(2);
    expect(w).toBeGreaterThan(SOURCE_H / 3);
  });

  /**
   * A régua troca o quadro que está na tela sem tocar na caixa: o recorte vale
   * para o vídeo inteiro, e perder o ajuste a cada conferência de
   * enquadramento tornaria a régua inutilizável.
   */
  test('mudar o quadro de referência não desfaz a área', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    const before = await announcedBox(page);
    const firstFrame = await page.locator('.cropper-canvas img').getAttribute('src');

    const slider = page.locator('input[type=range]');
    await slider.fill('1.5');

    await expect
      .poll(async () => page.locator('.cropper-canvas img').getAttribute('src'))
      .not.toBe(firstFrame);

    expect(await announcedBox(page)).toEqual(before);
  });

  test('recorta e baixa um vídeo que o navegador abre', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);
    await dragHandle(page, -30, -20);

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
    const bytes = Buffer.concat(chunks);
    const head = bytes.subarray(0, 16);

    const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    const isMp4 = head.toString('latin1').includes('ftyp');
    expect(isWebm || isMp4).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  test('o botão volta quando a área muda, e não antes', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await primary(page, 'Recortar o vídeo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(CROPPED);
    await expect(primary(page, 'Recortar o vídeo')).toBeHidden();

    await page.getByRole('radio', { name: '9:16', exact: true }).click();
    await expect(primary(page, 'Recortar o vídeo')).toBeVisible();
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
