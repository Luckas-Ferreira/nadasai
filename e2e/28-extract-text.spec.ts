import { expect, test } from '@playwright/test';
import { NOT_AN_IMAGE, openApp, upload, uploadTextImage } from './helpers';

const PATH = '/pt/imagem/extrair-texto';

/**
 * O OCR baixa o worker do Tesseract e ~4 MB de traineddata na primeira execução,
 * e só então roda o reconhecimento. É a ferramenta mais lenta do módulo, e o
 * limite aqui é generoso de propósito: um teto apertado transformaria "a máquina
 * estava ocupada" em "o OCR quebrou".
 */
const OCR = { timeout: 90_000 };

test.describe('Extrair texto (OCR)', () => {
  test('reads the words that are actually in the image', async ({ page }) => {
    await openApp(page, PATH);
    // O reconhecimento dispara sozinho ao receber o arquivo: escolher a
    // ferramenta com uma imagem na mão já é o pedido.
    await uploadTextImage(page, 'NADA SAI');

    const textarea = page.locator('textarea');
    await expect(textarea).toHaveValue(/NADA/, OCR);

    // A precisão é um número lido do próprio reconhecimento, não um enfeite:
    // sem ele não há como saber se o resultado vazio é a imagem ou a ferramenta.
    await expect(page.getByText('Precisão do OCR').first()).toBeVisible();
  });

  test('hands the text over as a .txt named after the image', async ({ page }) => {
    await openApp(page, PATH);
    await uploadTextImage(page, 'NADA SAI');

    await expect(page.locator('textarea')).toHaveValue(/NADA/, OCR);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar .TXT' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^documento-txt\.txt$/);
  });

  test('rejects a file that is neither image nor PDF', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('textarea')).toHaveCount(0);
  });
});
