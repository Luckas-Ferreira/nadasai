import { expect, test } from '@playwright/test';
import { DOC_A, PHOTO, drawRegion, expectDownload, openApp, primary, upload } from './helpers';

const IMAGE_PATH = '/pt/privacidade/censurar-imagem';
const PDF_PATH = '/pt/privacidade/censurar-pdf';

/** Rebuilding every page as a raster is the slow part. */
const READY = { timeout: 60_000 };

test.describe('Censurar imagem', () => {
  test('exports only after a box is drawn', async ({ page }) => {
    await openApp(page, IMAGE_PATH);
    await upload(page, PHOTO);

    // Nothing drawn is nothing to redact: the button exists but cannot run, so
    // pressing it could only produce a copy of the input.
    await expect(primary(page, 'Baixar Imagem Censurada')).toBeDisabled();

    await drawRegion(page, { x: 0.2, y: 0.3 }, { x: 0.6, y: 0.55 });
    await expect(page.getByText('1 Áreas censuradas')).toBeVisible();

    await primary(page, 'Baixar Imagem Censurada').click();
    await expectDownload(page, /^photo-redacted\.png$/);
  });

  test('undo and clear take the boxes back off', async ({ page }) => {
    await openApp(page, IMAGE_PATH);
    await upload(page, PHOTO);

    await drawRegion(page, { x: 0.1, y: 0.1 }, { x: 0.3, y: 0.3 });
    await drawRegion(page, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.7 });
    await expect(page.getByText('2 Áreas censuradas')).toBeVisible();

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect(page.getByText('1 Áreas censuradas')).toBeVisible();

    await page.getByRole('button', { name: 'Limpar Tudo' }).click();
    await expect(page.getByText('0 Áreas censuradas')).toBeVisible();
    await expect(primary(page, 'Baixar Imagem Censurada')).toBeDisabled();
  });
});

test.describe('Censurar PDF', () => {
  /**
   * The whole point of this tool is that the result is a raster: a black
   * rectangle drawn over a text layer leaves the text in the file, which is how
   * "redacted" documents leak. The filename is the cheap half of the proof; the
   * expensive half is pinned in pdf-redactor.service.spec.ts.
   */
  test('redacts a page and rebuilds the document', async ({ page }) => {
    await openApp(page, PDF_PATH);
    await upload(page, DOC_A);

    // The first page is rendered before anything can be drawn on it.
    // The host element is inline and has no box of its own; the layer inside it
    // is what covers the page.
    await expect(page.locator('app-region-overlay > div')).toBeVisible(READY);
    await expect(primary(page, 'Censurar e Reconstruir PDF')).toBeDisabled();

    await drawRegion(page, { x: 0.1, y: 0.05 }, { x: 0.9, y: 0.2 });
    await expect(page.locator('app-region-overlay > div > div')).toHaveCount(1);

    await primary(page, 'Censurar e Reconstruir PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar' })).toBeVisible(READY);

    await expectDownload(page, /^doc-a-redacted\.pdf$/);
  });

  /**
   * O zoom não existia, e sem ele não dá para mirar a tarja em texto miúdo — a
   * página vinha presa a `max-h-[60vh]` e a um raster de escala fixa.
   *
   * O que se assere não é o botão: é que a folha CRESCE na mesma proporção do
   * degrau, e que uma tarja desenhada antes acompanha, em vez de escorregar
   * para outro trecho do documento. As regiões são percentuais, então essa é
   * exatamente a garantia que uma conversão de coordenadas mal feita quebraria
   * — e o estrago aqui é censurar o lugar errado.
   */
  test('zooms the page in, and the boxes go with it', async ({ page }) => {
    await openApp(page, PDF_PATH);
    await upload(page, DOC_A);
    await expect(page.locator('app-region-overlay > div')).toBeVisible(READY);

    await drawRegion(page, { x: 0.2, y: 0.2 }, { x: 0.6, y: 0.4 });
    const box = page.locator('app-region-overlay > div > div');
    await expect(box).toHaveCount(1);

    const sheet = page.locator('app-redact-pdf img');
    const sheetBefore = await sheet.boundingBox();
    const boxBefore = await box.boundingBox();
    if (!sheetBefore || !boxBefore) throw new Error('page is not laid out');
    const rasterBefore = await sheet.evaluate((el) => (el as HTMLImageElement).naturalWidth);

    const zoomField = page.getByRole('textbox', { name: 'Zoom (%)' });
    await expect(zoomField).toHaveValue('100');
    await zoomField.fill('150');
    await zoomField.press('Enter');
    await expect(zoomField).toHaveValue('150');

    const sheetAfter = await sheet.boundingBox();
    const boxAfter = await box.boundingBox();
    if (!sheetAfter || !boxAfter) throw new Error('page is not laid out after zoom');

    // A folha cresceu meio degrau, que é o que 100% → 150% quer dizer.
    const grew = sheetAfter.height / sheetBefore.height;
    expect(grew).toBeGreaterThan(1.45);
    expect(grew).toBeLessThan(1.55);

    // E a tarja cresceu junto, no mesmo fator: ela continua sobre o mesmo
    // trecho do documento. Uma tarja em pixels teria ficado do tamanho de antes.
    expect(boxAfter.height / boxBefore.height).toBeCloseTo(grew, 1);
    expect(boxAfter.width / boxBefore.width).toBeCloseTo(grew, 1);

    // A metade que separa ampliar de esticar: a página é RE-RASTERIZADA numa
    // escala maior. Sem isto o zoom entrega o mesmo raster esticado, o texto
    // fica mole justamente quando se aproxima para mirar, e a ferramenta não
    // serve para o que se ampliou nela. É assíncrono — o CSS cresce na hora e a
    // imagem nova chega depois.
    await expect
      .poll(() => sheet.evaluate((el) => (el as HTMLImageElement).naturalWidth), READY)
      .toBeGreaterThan(rasterBefore);

    // Digitar no campo é o caminho de volta — e um valor absurdo satura em vez
    // de aplicar, senão a folha sai da tela e não há como trazê-la de volta.
    await zoomField.fill('9000');
    await zoomField.press('Enter');
    await expect(zoomField).toHaveValue('300');

    await zoomField.fill('100');
    await zoomField.press('Enter');
    const sheetReset = await sheet.boundingBox();
    expect(sheetReset?.height).toBeCloseTo(sheetBefore.height, 0);

    // Os botões param nas pontas em vez de seguirem contando.
    await expect(page.getByRole('button', { name: 'Aumentar zoom' })).toBeEnabled();
    await zoomField.fill('300');
    await zoomField.press('Enter');
    await expect(page.getByRole('button', { name: 'Aumentar zoom' })).toBeDisabled();
  });

  /**
   * Sem desfazer, um arrasto que saiu torto só se corrige com "Limpar Tudo" —
   * que joga fora todas as outras tarjas junto. O censurar-imagem já tinha o
   * par; aqui faltava.
   */
  test('undo takes back the last box, and goes to the page it was on', async ({ page }) => {
    await openApp(page, PDF_PATH);
    await upload(page, DOC_A);
    await expect(page.locator('app-region-overlay > div')).toBeVisible(READY);

    await drawRegion(page, { x: 0.1, y: 0.1 }, { x: 0.4, y: 0.25 });
    await drawRegion(page, { x: 0.5, y: 0.5 }, { x: 0.8, y: 0.65 });
    const boxes = page.locator('app-region-overlay > div > div');
    await expect(boxes).toHaveCount(2);

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect(boxes).toHaveCount(1);

    // A última tarja ficou na página 1. Desfazer a partir da página 2 tem de
    // levar de volta até ela — um desfazer que apaga algo fora da tela é
    // indistinguível de um botão quebrado.
    await page.getByRole('button', { name: 'Próxima página' }).click();
    await expect(boxes).toHaveCount(0);

    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect(page.locator('app-redact-pdf').getByText('1 / 2')).toBeVisible(READY);
    await expect(boxes).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Desfazer' })).toBeHidden();
  });

  test('keeps each page\'s boxes to itself', async ({ page }) => {
    await openApp(page, PDF_PATH);
    await upload(page, DOC_A);
    // The host element is inline and has no box of its own; the layer inside it
    // is what covers the page.
    await expect(page.locator('app-region-overlay > div')).toBeVisible(READY);

    await drawRegion(page, { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.3 });
    const boxes = page.locator('app-region-overlay > div > div');
    await expect(boxes).toHaveCount(1);

    // A box belongs to the page it was drawn on. Carrying it forward would
    // black out something the user never pointed at.
    await page.getByRole('button', { name: 'Próxima página' }).click();
    await expect(boxes).toHaveCount(0);
  });
});
