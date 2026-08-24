import { expect, test, type Page } from '@playwright/test';
import { CLIP, openApp, primary, upload } from './helpers';

const PATH = '/pt/audio/velocidade';

const APPLIED = { timeout: 60_000 };
const READY = { timeout: 30_000 };

/**
 * A ARITMÉTICA está em `speed.spec.ts`, que mede frequência e duração num sinal
 * sintético — é lá que se prova que o tom se mantém ou acompanha. Aqui só o
 * navegador prova o resto: a nova duração aparece ANTES de processar, o modo
 * muda a explicação na tela, e o arquivo baixado é do formato pedido.
 */
const cell = (page: Page, label: string) =>
  page.locator('dl div', { hasText: label }).locator('dd');

async function dropClip(page: Page): Promise<void> {
  await openApp(page, PATH);
  await upload(page, CLIP);
  await expect(page.getByText('Original', { exact: true })).toBeVisible(READY);
}

test.describe('Velocidade do áudio', () => {
  /**
   * O número que decide a escolha aparece antes de qualquer processamento —
   * é o mesmo princípio do tamanho estimado no comprimir vídeo.
   */
  test('mostra a nova duração antes de aplicar', async ({ page }) => {
    await dropClip(page);

    const original = await cell(page, 'Original').innerText();
    const changed = await cell(page, 'Nova duração').innerText();

    expect(original).toMatch(/\d+:\d\d/);
    expect(changed).not.toBe(original);
    await expect(cell(page, 'Resultado')).toHaveText('—');
  });

  test('mover a régua muda a duração anunciada', async ({ page }) => {
    await dropClip(page);

    const before = await cell(page, 'Nova duração').innerText();

    const slider = page.locator('input[type=range]');
    await slider.fill('0.5');

    await expect(cell(page, 'Nova duração')).not.toHaveText(before);
  });

  /** Os dois modos são o mesmo caminho com outro número — e outra promessa. */
  test('trocar o modo do tom troca a explicação na tela', async ({ page }) => {
    await dropClip(page);

    await expect(page.getByText('A duração muda e o tom fica onde estava')).toBeVisible();

    await page.getByRole('radio', { name: 'Acompanha', exact: true }).click();

    await expect(page.getByText('como um disco tocado fora da rotação')).toBeVisible();
  });

  /** Velocidade 1 não é uma operação: é um arquivo recodificado por nada. */
  test('em 1x não há o que aplicar', async ({ page }) => {
    await dropClip(page);

    await page.locator('input[type=range]').fill('1');

    await expect(primary(page, 'Aplicar a velocidade')).toBeDisabled();
  });

  test('aplica e baixa um WAV de verdade', async ({ page }) => {
    await dropClip(page);
    await page.locator('input[type=range]').fill('2');

    await primary(page, 'Aplicar a velocidade').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(APPLIED);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('clip-velocidade.wav');

    // RIFF....WAVE: um WAV de verdade, não um blob renomeado.
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);

    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WAVE');
  });

  test('o botão volta quando a velocidade muda, e não antes', async ({ page }) => {
    await dropClip(page);
    await page.locator('input[type=range]').fill('2');

    await primary(page, 'Aplicar a velocidade').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(APPLIED);
    await expect(primary(page, 'Aplicar a velocidade')).toBeHidden();

    await page.locator('input[type=range]').fill('1.5');
    await expect(primary(page, 'Aplicar a velocidade')).toBeVisible();
  });

  test('rejeita um arquivo que não é áudio', async ({ page }) => {
    await openApp(page, PATH);
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
