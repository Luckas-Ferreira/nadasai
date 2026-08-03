import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PHOTO, openApp, primary, upload } from './helpers';

const FILE_PATH = '/pt/privacidade/criptografar-arquivo';
const TEXT_PATH = '/pt/privacidade/criptografar-texto';

/** PBKDF2 at 100 000 iterations runs twice in the roundtrip, once per direction. */
const CRYPTO = { timeout: 30_000 };

const password = (page: import('@playwright/test').Page) => page.locator('input[type=password]');

test.describe('Criptografar arquivo', () => {
  /**
   * The one assertion that matters for this tool: the bytes that come back out
   * are the bytes that went in. A spec that only checked the .enc downloaded
   * would pass on an envelope nothing can ever open again — and there is no
   * recovery path, so that failure would reach a user as a lost file.
   */
  test('roundtrips a file through encrypt and decrypt', async ({ page }, testInfo) => {
    await openApp(page, FILE_PATH);
    await upload(page, PHOTO);

    await password(page).fill('senha-de-teste-longa');
    await primary(page, 'Criptografar Arquivo').click();
    await expect(page.getByText('Criptografado.')).toBeVisible(CRYPTO);

    const [encrypted] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar' }).click(),
    ]);
    expect(encrypted.suggestedFilename()).toBe('photo.png.enc');

    const envelope = testInfo.outputPath('photo.png.enc');
    await encrypted.saveAs(envelope);

    // The envelope is not the file: if this passed, the tool would be handing
    // back the plaintext under a new extension.
    expect(readFileSync(envelope).subarray(0, 10).toString('latin1')).toBe('NADASAI_V2');

    await page.reload();
    await upload(page, envelope);
    // No mode to pick: a .enc file is here to be opened, and the tool says so
    // by flipping the switch itself.
    await expect(page.getByRole('radio', { name: 'Descriptografar', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await password(page).fill('senha-de-teste-longa');
    await primary(page, 'Descriptografar Arquivo').click();
    await expect(page.getByText('Descriptografado.')).toBeVisible(CRYPTO);

    const [decrypted] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar' }).click(),
    ]);

    // The original name is carried inside the envelope's metadata, not derived
    // from the .enc filename — that is what survives a rename in transit.
    expect(decrypted.suggestedFilename()).toBe('photo.png');

    const restored = testInfo.outputPath('restored.png');
    await decrypted.saveAs(restored);
    expect(readFileSync(restored).equals(readFileSync(PHOTO))).toBe(true);
  });

  test('reports a wrong password rather than writing a broken file', async ({ page }, testInfo) => {
    await openApp(page, FILE_PATH);
    await upload(page, PHOTO);
    await password(page).fill('a-senha-certa');
    await primary(page, 'Criptografar Arquivo').click();
    await expect(page.getByText('Criptografado.')).toBeVisible(CRYPTO);

    const [encrypted] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar' }).click(),
    ]);
    const envelope = testInfo.outputPath('wrong-pass.enc');
    await encrypted.saveAs(envelope);

    await page.reload();
    await upload(page, envelope);
    await password(page).fill('a-senha-errada');
    await primary(page, 'Descriptografar Arquivo').click();

    // AES-GCM's tag cannot tell a wrong password from a corrupt file, so the
    // message deliberately covers both.
    await expect(page.getByRole('alert')).toBeVisible(CRYPTO);
    await expect(page.getByRole('button', { name: 'Baixar' })).toHaveCount(0);
  });
});

test.describe('Criptografar texto', () => {
  test('roundtrips a message through the armored block', async ({ page }) => {
    const message = 'Mensagem secreta com acento: coração 123';

    await openApp(page, TEXT_PATH);
    await page.locator('textarea').fill(message);
    await password(page).fill('senha-de-teste-longa');
    await primary(page, 'Criptografar Mensagem').click();

    const armored = page.locator('pre');
    await expect(armored).toBeVisible(CRYPTO);
    const block = (await armored.innerText()).trim();
    expect(block).not.toContain('coração');

    await page.getByRole('radio', { name: 'Descriptografar', exact: true }).click();
    await page.locator('textarea').fill(block);
    await password(page).fill('senha-de-teste-longa');
    await primary(page, 'Descriptografar Mensagem').click();

    await expect(page.locator('pre')).toHaveText(message, CRYPTO);
  });
});
