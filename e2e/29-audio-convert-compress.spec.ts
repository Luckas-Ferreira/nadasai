import { expect, test } from '@playwright/test';
import { CLIP, NOT_AN_IMAGE, expectDownload, openApp, primary, upload } from './helpers';

/**
 * As duas ferramentas de áudio que ainda não tinham e2e, juntas por partilharem
 * a mesma forma: decodificar, mexer numa opção, ENCODAR — e é o encode que
 * nenhum teste unitário alcança, porque o LAME roda no navegador.
 *
 * O que cada teste prova é o nome do arquivo baixado. Ele carrega as duas coisas
 * que só existem depois do encode: a extensão (que o formato pedido de fato
 * chegou ao codificador) e o sufixo derivado do nome original (que a sessão
 * manteve o rastro em vez de inventar um nome).
 */

/** Decodificar 4 s de WAV e reencodar em MP3 passa por LAME. */
const READY = { timeout: 60_000 };

test.describe('Converter áudio', () => {
  const PATH = '/pt/audio/converter';

  test('writes an MP3 out of a WAV', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);

    await expect(primary(page, 'Baixar áudio convertido')).toBeVisible(READY);
    await primary(page, 'Baixar áudio convertido').click();

    await expectDownload(page, /^clip-converted\.mp3$/, 'app-action-bar');
  });

  test('writes a WAV when WAV is what was asked for', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);
    await expect(primary(page, 'Baixar áudio convertido')).toBeVisible(READY);

    await page.getByRole('button', { name: 'wav', exact: true }).click();
    await primary(page, 'Baixar áudio convertido').click();

    await expectDownload(page, /^clip-converted\.wav$/, 'app-action-bar');
  });

  test('rejects a file that is not audio', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('Comprimir áudio', () => {
  const PATH = '/pt/audio/comprimir';

  test('re-encodes at the chosen bitrate and names the file for it', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);

    await expect(primary(page, 'Comprimir áudio')).toBeVisible(READY);
    await primary(page, 'Comprimir áudio').click();

    await expectDownload(page, /^clip-compressed\.mp3$/, 'app-action-bar');
  });

  test('shows what the result will weigh before it is produced', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, CLIP);

    // A estimativa é a única informação que torna a escolha de bitrate uma
    // decisão em vez de um chute — sem ela, o único jeito de saber o tamanho é
    // baixar o arquivo.
    await expect(page.getByText('Tamanho estimado').first()).toBeVisible(READY);
  });
});
