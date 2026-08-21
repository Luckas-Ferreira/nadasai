import { expect, test, type Page } from '@playwright/test';
import { openApp, primary } from './helpers';

/**
 * A detecção em si é coberta em unidade por `silence.spec.ts`, com sinais
 * sintéticos e limiares controlados. O que só o navegador prova é o LAÇO DE
 * AJUSTE: mexer no limiar tem de mudar imediatamente quanto some, antes de
 * qualquer corte — é o que torna a ferramenta calibrável em vez de adivinhada.
 *
 * A fixture é gerada na página: um WAV com fala-pausa-fala, feito de um
 * oscilador. Nenhum binário entra no repositório, pela mesma regra que
 * `e2e/fixtures/generate.ts` já segue.
 */

/**
 * WAV de 6 s: tom alto em [0,2] e [4,6], e em [2,4] um zumbido baixo a
 * -50 dBFS.
 *
 * O zumbido não é enfeite: silêncio DIGITAL (zero absoluto) fica abaixo de
 * qualquer limiar, então com ele nenhum ajuste do controle mudaria nada e o
 * teste do limiar não testaria o limiar. Uma sala real tem piso de ruído, e é o
 * piso que faz -45 achar a pausa e -70 não achar.
 */
async function makeClip(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const base64 = await page.evaluate(() => {
    const rate = 22_050;
    const seconds = 6;
    const frames = rate * seconds;
    const data = new Float32Array(frames);

    const loud = (from: number, to: number) => {
      for (let i = Math.round(from * rate); i < Math.round(to * rate); i++) {
        data[i] = Math.sin((i / rate) * 2 * Math.PI * 440) * 0.6;
      }
    };
    loud(0, 2);
    loud(4, 6);

    // Piso de ruído a -50 dBFS na pausa: abaixo do limiar padrão (-45), acima
    // de -70. É o que dá ao controle algo para decidir.
    const floor = Math.pow(10, -50 / 20);
    for (let i = Math.round(2 * rate); i < Math.round(4 * rate); i++) {
      data[i] = Math.sin((i / rate) * 2 * Math.PI * 120) * floor;
    }

    // WAV PCM 16 bits, mono — escrito à mão para não depender de nada.
    const bytes = new ArrayBuffer(44 + frames * 2);
    const view = new DataView(bytes);
    const ascii = (at: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
    };

    ascii(0, 'RIFF');
    view.setUint32(4, 36 + frames * 2, true);
    ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    ascii(36, 'data');
    view.setUint32(40, frames * 2, true);

    for (let i = 0; i < frames; i++) {
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
    }

    let binary = '';
    const raw = new Uint8Array(bytes);
    for (let i = 0; i < raw.length; i++) binary += String.fromCharCode(raw[i]);
    return btoa(binary);
  });

  return { name: 'fala.wav', mimeType: 'audio/wav', buffer: Buffer.from(base64, 'base64') };
}

async function open(page: Page): Promise<void> {
  await openApp(page, '/pt/audio/remover-silencio');
  await page.locator('input[type=file]').first().setInputFiles(await makeClip(page));
  await expect(page.getByText('Da gravação removido')).toBeVisible({ timeout: 30_000 });
}

const removedPercent = (page: Page) =>
  page.getByText('Da gravação removido').locator('xpath=following-sibling::span');

test.describe('Remover silêncio', () => {
  test('encontra a pausa e mostra quanto sairia, antes de cortar', async ({ page }) => {
    await open(page);

    await expect(page.getByText('Cortes').locator('xpath=../dd')).toHaveText('1');
    await expect(removedPercent(page)).toHaveText(/[1-9]\d?%/);
  });

  /**
   * O laço de ajuste: um limiar muito baixo não acha nada, e a página diz isso
   * em vez de deixar o botão ativo para produzir uma cópia do original.
   */
  test('um limiar baixo demais não acha nada, e a página avisa', async ({ page }) => {
    await open(page);

    await page.getByLabel('Limiar').fill('-70');

    await expect(page.getByRole('alert')).toContainText('Nenhum silêncio');

    // Desabilitado, e não escondido: sumir com o botão deixaria a pergunta
    // "cadê a ação?" sem resposta. Ele fica visível ao lado do aviso que
    // explica por que não há o que fazer.
    await expect(primary(page, 'Remover o silêncio')).toBeDisabled();
  });

  /**
   * A duração mínima é o controle que separa pausa de respiro. Subi-la acima da
   * pausa da fixture faz o corte desaparecer.
   */
  test('a duração mínima descarta pausas curtas demais', async ({ page }) => {
    await open(page);

    await expect(page.getByText('Cortes').locator('xpath=../dd')).toHaveText('1');

    await page.getByLabel('Duração mínima').fill('3');

    await expect(page.getByText('Cortes').locator('xpath=../dd')).toHaveText('0');
  });

  test('corta e baixa um arquivo mais curto que o original', async ({ page }) => {
    await open(page);

    const before = await page.getByText('Original', { exact: true }).locator('xpath=../dd').innerText();
    const after = await page.getByText('Resultado', { exact: true }).locator('xpath=../dd').innerText();
    expect(after).not.toBe(before);

    await primary(page, 'Remover o silêncio').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^fala-sem-silencio\.wav$/);
  });

  test('escreve MP3 quando pedido', async ({ page }) => {
    await open(page);

    await page.getByRole('radio', { name: 'MP3', exact: true }).click();
    await primary(page, 'Remover o silêncio').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^fala-sem-silencio\.mp3$/);
  });

  test('rejeita um arquivo que não é áudio', async ({ page }) => {
    await openApp(page, '/pt/audio/remover-silencio');
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
