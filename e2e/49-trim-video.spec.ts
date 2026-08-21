import { expect, test, type Page } from '@playwright/test';
import { openApp, primary } from './helpers';

const PATH = '/pt/video/cortar';

/** O corte toca o TRECHO em tempo real — curto de propósito na fixture. */
const TRIMMED = { timeout: 60_000 };

/**
 * O que só o navegador prova aqui é o LAÇO DE MARCAÇÃO: parar o player, marcar,
 * e ver a seleção mudar antes de qualquer processamento. A recodificação em si
 * é a mesma máquina do `crop-video` (`core/video/reencode.ts`), e o que dela dá
 * para isolar já está em `reencode.spec.ts`.
 *
 * A fixture é a mesma dos specs 37, 38 e 48: um WebM gravado pela própria
 * página, sem binário no repositório — e sem duração no cabeçalho, como toda
 * gravação de MediaRecorder. Aqui isso importa mais do que nunca, porque a
 * duração é o que define o fim inicial da seleção.
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

  await expect(page.getByText('Original', { exact: true })).toBeVisible({ timeout: 30_000 });
}

const startField = (page: Page) => page.locator('input[aria-label="Início (s)"]');
const endField = (page: Page) => page.locator('input[aria-label="Fim (s)"]');
const resultClock = (page: Page) => page.locator('dl div', { hasText: 'Resultado' }).locator('dd');

/** Os campos numéricos são o ajuste FINO — o componente só lê no `change`. */
async function setField(field: ReturnType<typeof startField>, value: string): Promise<void> {
  await field.fill(value);
  await field.blur();
}

test.describe('Cortar vídeo', () => {
  /**
   * Ao abrir, o vídeo inteiro está selecionado — e cortar tudo seria
   * recodificá-lo por nada. A página diz isso E desativa o botão: um botão
   * ativo ao lado da frase que pede para marcar alguma coisa é pior do que a
   * frase sozinha.
   */
  test('recusa cortar o vídeo inteiro, e explica por quê', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await expect(page.getByRole('alert')).toContainText('não há o que cortar');
    await expect(primary(page, 'Cortar o vídeo')).toBeDisabled();
  });

  test('marcar o início encurta a seleção e libera o corte', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    const before = await resultClock(page).innerText();

    await setField(startField(page), '1');

    await expect(resultClock(page)).not.toHaveText(before);
    await expect(page.getByRole('alert')).toBeHidden();
    await expect(primary(page, 'Cortar o vídeo')).toBeEnabled();
  });

  /**
   * O botão de marcar lê o `currentTime` do player. É o controle de tempo
   * principal da ferramenta — os campos numéricos são o ajuste fino.
   */
  test('marcar pelo player usa a posição atual', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await page.locator('video').evaluate((el: HTMLVideoElement) => {
      el.currentTime = 1.5;
    });
    // O clique entra no `poll` porque a marca lê o `playhead`, que só se move
    // no evento `timeupdate` — clicar cedo demais leria zero. Marcar é
    // idempotente: cada clique reescreve o início a partir da posição atual.
    await expect
      .poll(async () => {
        await page.getByRole('button', { name: 'Marcar início aqui' }).click();
        return Number(await startField(page).inputValue());
      })
      .toBeGreaterThan(1);
  });

  test('corta e baixa um vídeo de verdade', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await setField(endField(page), '1.5');

    await primary(page, 'Cortar o vídeo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(TRIMMED);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^gravacao-cortado\.(webm|mp4)$/);

    // Contêiner de verdade: assinatura EBML no WebM, "ftyp" no MP4. Um blob
    // vazio com o nome certo passaria em qualquer asserção mais frouxa.
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

  test('o botão volta quando a seleção muda, e não antes', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await setField(endField(page), '1.5');

    await primary(page, 'Cortar o vídeo').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(TRIMMED);
    await expect(primary(page, 'Cortar o vídeo')).toBeHidden();

    await setField(startField(page), '0.5');

    await expect(primary(page, 'Cortar o vídeo')).toBeVisible();
  });

  /** O fim nunca pode ficar antes do início — o componente empurra de volta. */
  test('um fim antes do início é corrigido em vez de aceito', async ({ page }) => {
    await openApp(page, PATH);
    await dropVideo(page);

    await setField(startField(page), '2');
    await setField(endField(page), '0.5');

    const start = Number(await startField(page).inputValue());
    const end = Number(await endField(page).inputValue());

    expect(end).not.toBe(0.5);
    expect(end).toBeGreaterThanOrEqual(start);
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
