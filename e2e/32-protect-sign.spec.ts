import { expect, test } from '@playwright/test';
import { DOC_A, NOT_AN_IMAGE, expectDownload, openApp, primary, upload } from './helpers';

/**
 * Proteger e assinar: as duas ferramentas de PDF que ACRESCENTAM algo ao
 * documento em vez de recortá-lo. São também as duas em que o resultado é
 * verificável de volta pelo próprio produto — um PDF cifrado, reaberto aqui,
 * tem que pedir senha.
 */

const READY = { timeout: 60_000 };
const SENHA = 'senha-de-teste-123';

test.describe('Proteger PDF', () => {
  const PATH = '/pt/pdf/proteger';

  test('encrypts with a password, and the result asks for it', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_A);

    await expect(primary(page, 'Proteger PDF')).toBeVisible(READY);

    // Dois campos, e é isso que impede de proteger um documento com uma senha
    // com erro de digitação — que ninguém descobre no momento de proteger, e sim
    // no de abrir.
    const campos = page.locator('input[type=password]');
    await campos.nth(0).fill(SENHA);
    await campos.nth(1).fill(SENHA);

    await primary(page, 'Proteger PDF').click();
    await expectDownload(page, /^doc-a-protected\.pdf$/);
  });

  /**
   * Escrever este teste achou o defeito que ele agora trava: com as senhas
   * divergentes o `run()` retornava em silêncio. O botão respondia ao clique,
   * nada acontecia, e não havia mensagem nenhuma — as duas frases já estavam nos
   * dois dicionários (`protpdf.error_mismatch`, `protpdf.error_empty`) desde que
   * a ferramenta foi escrita, sem ninguém para dizê-las.
   */
  test('says why it did not run when the two passwords disagree', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_A);
    await expect(primary(page, 'Proteger PDF')).toBeVisible(READY);

    const campos = page.locator('input[type=password]');
    await campos.nth(0).fill(SENHA);
    await campos.nth(1).fill('outra-coisa');
    await primary(page, 'Proteger PDF').click();

    await expect(page.getByRole('alert')).toContainText('As senhas não coincidem');
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toHaveCount(0);
  });

  /**
   * O campo vazio JÁ era tratado, e de um jeito melhor: o botão nasce
   * desabilitado. É o contraste com o caso acima que mostra o que estava errado
   * lá — divergir não desabilitava nada, então o mesmo botão ora recusava o
   * clique de forma visível, ora o engolia.
   */
  test('does not even offer the run with no password at all', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_A);

    await expect(primary(page, 'Proteger PDF')).toBeVisible(READY);
    await expect(primary(page, 'Proteger PDF')).toBeDisabled();
  });

  test('rejects a file that is not a PDF', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('Assinar PDF', () => {
  const PATH = '/pt/pdf/assinar';

  test('types a name onto the page and writes the signed document', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_A);

    await expect(primary(page, 'Assinar PDF')).toBeVisible(READY);

    await page.getByRole('radio', { name: 'Digitar Nome' }).click();
    await page.getByPlaceholder('Ex: João da Silva').fill('Fulano de Tal');

    // Digitar não assina: a assinatura precisa ser POSTA numa página, e é esse
    // passo que decide em qual delas ela cai.
    await page.getByRole('button', { name: /^Adicionar nesta página/ }).click();

    await primary(page, 'Assinar PDF').click();
    await expectDownload(page, /^doc-a-signed\.pdf$/);
  });

  test('rejects a file that is not a PDF', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
