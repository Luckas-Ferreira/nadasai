import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PHOTO, openApp, primary, upload } from './helpers';

const PATH = '/pt/privacidade/hash-de-arquivo';

const sha256 = createHash('sha256').update(readFileSync(PHOTO)).digest('hex');
const md5 = createHash('md5').update(readFileSync(PHOTO)).digest('hex');

test.describe('Hash de arquivo', () => {
  /**
   * Node computes the same digests independently. A spec that only checked the
   * shape of the output — 64 hex characters — would pass on a hand-rolled MD5
   * that is subtly wrong, which is exactly the risk of shipping one.
   */
  test('computes the same digests node does', async ({ page }) => {
    await openApp(page, PATH);
    // Dropping a file runs it: there is nothing to configure beforehand, so a
    // button in between would only be a step to click through.
    await upload(page, PHOTO);

    await expect(page.getByText(sha256, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(md5, { exact: true })).toBeVisible();
  });

  test('verifies a pasted digest and rejects a wrong one', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, PHOTO);
    await expect(page.getByText(sha256, { exact: true })).toBeVisible({ timeout: 30_000 });

    const expected = page.getByPlaceholder('Cole o hash esperado para verificar…');
    await expected.fill(sha256.toUpperCase());
    // Upper case on purpose: a checksum pasted from a vendor page is as likely
    // to be upper as lower, and a case-sensitive compare would call it a
    // mismatch — the one outcome that makes a user distrust a good file.
    await expect(page.getByText(/Igual — integridade do arquivo verificada/)).toBeVisible();

    await expected.fill(sha256.replace(/.$/, (c) => (c === '0' ? '1' : '0')));
    await expect(page.getByText(/Diferente — o arquivo pode ter sido alterado/)).toBeVisible();
  });

  test('hashes typed text without a file', async ({ page }) => {
    await openApp(page, PATH);
    await page.getByRole('radio', { name: 'De Texto', exact: true }).click();
    await page.locator('textarea').fill('abc');


    // The canonical SHA-256 of "abc" — pinned rather than recomputed, because a
    // vector both sides derive the same wrong way proves nothing.
    await expect(
      page.getByText('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', { exact: true }),
    ).toBeVisible();
  });
});
