import { expect, test, type Page } from '@playwright/test';
import { PHOTO, openApp, primary, upload } from './helpers';

const PATH = '/pt/imagem/foto-3x4';

/**
 * A FOTO DE DOCUMENTO é medida FÍSICA, e é isso que este arquivo cobre: o
 * número de pixels que a página promete tem de mudar com o formato, e o número
 * de cópias tem de mudar com a folha. A aritmética da grade está em
 * `id-photo.spec.ts`; o que só o navegador prova é que ela chegou à tela e ao
 * arquivo baixado.
 *
 * O recorte em si é a cropper.js, a mesma do recortar imagem e do recortar
 * vídeo, e o `48-crop-video` já cobre a caixa com alças.
 */
const BUILT = { timeout: 60_000 };

const cell = (page: Page, label: string) =>
  page.locator('dl div', { hasText: label }).locator('dd');

async function dropPhoto(page: Page): Promise<void> {
  await openApp(page, PATH);
  await upload(page, PHOTO);
  await expect(page.locator('.cropper-crop-box')).toBeVisible({ timeout: 30_000 });
}

test.describe('Foto 3x4', () => {
  /**
   * 3x4 cm a 300 DPI são 354 x 472 pixels. Se algum dia isto virar proporção em
   * vez de medida, o número deixa de bater e a ferramenta perde a razão de
   * existir separada do recortar.
   */
  test('anuncia a medida física e os pixels que ela dá a 300 DPI', async ({ page }) => {
    await dropPhoto(page);

    await expect(cell(page, 'Tamanho')).toHaveText('30 × 40 mm');
    await expect(cell(page, 'Em pixels')).toHaveText('354 × 472');
  });

  /** O passaporte americano é em POLEGADAS: 2 x 2 pol = 50,8 mm = 600 px. */
  test('trocar o formato muda a medida e o tamanho em pixels', async ({ page }) => {
    await dropPhoto(page);

    await page.getByRole('radio', { name: '2 × 2 pol', exact: true }).click();

    await expect(cell(page, 'Tamanho')).toHaveText('50.8 × 50.8 mm');
    await expect(cell(page, 'Em pixels')).toHaveText('600 × 600');
  });

  test('a folha diz quantas cópias cabem, e a A4 cabe mais que a 10x15', async ({ page }) => {
    await dropPhoto(page);

    await page.getByRole('radio', { name: '10 × 15 cm', exact: true }).click();
    const small = Number((await cell(page, 'Cópias na folha').innerText()).match(/\d+/)![0]);

    await page.getByRole('radio', { name: 'A4', exact: true }).click();
    const big = Number((await cell(page, 'Cópias na folha').innerText()).match(/\d+/)![0]);

    expect(small).toBeGreaterThan(1);
    expect(big).toBeGreaterThan(small);
  });

  test('só a foto é uma cópia', async ({ page }) => {
    await dropPhoto(page);

    await page.getByRole('radio', { name: 'Só a foto', exact: true }).click();
    await expect(cell(page, 'Cópias na folha')).toHaveText('1');
  });

  /**
   * O PDF é o padrão porque carrega o TAMANHO FÍSICO dentro dele. Os bytes têm
   * de ser PDF de verdade, não um JPEG renomeado.
   */
  test('monta a folha em PDF e baixa', async ({ page }) => {
    await dropPhoto(page);

    await primary(page, 'Montar a folha').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(BUILT);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('photo-foto.pdf');

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);

    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  test('em JPG o download é uma imagem', async ({ page }) => {
    await dropPhoto(page);

    await page.getByRole('radio', { name: 'JPG', exact: true }).click();
    await primary(page, 'Montar a folha').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(BUILT);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('photo-foto.jpg');

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const head = Buffer.concat(chunks).subarray(0, 3);

    // Assinatura JPEG: FF D8 FF.
    expect([head[0], head[1], head[2]]).toEqual([0xff, 0xd8, 0xff]);
  });

  test('o botão volta quando o formato muda, e não antes', async ({ page }) => {
    await dropPhoto(page);

    await primary(page, 'Montar a folha').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(BUILT);
    await expect(primary(page, 'Montar a folha')).toBeHidden();

    await page.getByRole('radio', { name: '5 × 7 cm', exact: true }).click();
    await expect(primary(page, 'Montar a folha')).toBeVisible();
  });
});
