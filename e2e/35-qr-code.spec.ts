import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

const PATH = '/pt/privacidade/qr-code';

/**
 * Gerar e LER, na mesma suíte e de propósito: o teste que importa é o de ida e
 * volta. Um QR gerado que não decodifica é o defeito clássico desta ferramenta —
 * a imagem parece um QR, os módulos estão pretos e quadrados, e nenhum leitor do
 * mundo real reconhece nada. Só passar a própria saída de volta pela entrada
 * separa "desenhou" de "codificou".
 */
test.describe('QR Code', () => {
  test('draws a code for the URL that was typed', async ({ page }) => {
    await openApp(page, PATH);

    await page.getByPlaceholder('https://exemplo.com.br').fill('https://nadasai.com/pt');

    // Módulos escuros no canvas: é a diferença entre um QR desenhado e uma tela
    // em branco do tamanho certo.
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    await expect
      .poll(async () =>
        canvas.evaluate((el: HTMLCanvasElement) => {
          const ctx = el.getContext('2d');
          if (!ctx || el.width === 0) return 0;
          const { data } = ctx.getImageData(0, 0, el.width, el.height);
          let dark = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i] < 100 && data[i + 3] > 8) dark++;
          return dark;
        }),
      )
      .toBeGreaterThan(500);
  });

  test('reads back the code it just generated', async ({ page }) => {
    await openApp(page, PATH);

    const CONTEUDO = 'https://nadasai.com/pt/privacidade/qr-code';
    await page.getByPlaceholder('https://exemplo.com.br').fill(CONTEUDO);

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // O PNG sai do próprio canvas da prévia: é literalmente o arquivo que o
    // botão de baixar entregaria.
    const bytes = await canvas.evaluate(
      async (el: HTMLCanvasElement) =>
        new Promise<number[]>((resolve) =>
          el.toBlob(async (blob) => resolve(Array.from(new Uint8Array(await blob!.arrayBuffer())))),
        ),
    );

    await page.getByRole('radio', { name: 'Ler QR Code' }).click();
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });

    await expect(page.getByText(CONTEUDO).first()).toBeVisible({ timeout: 30_000 });
  });

  test('says so when the image carries no code at all', async ({ page }) => {
    await openApp(page, PATH);
    await page.getByRole('radio', { name: 'Ler QR Code' }).click();

    const branco = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 200, 200);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });

    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'branco.png', mimeType: 'image/png', buffer: Buffer.from(branco) });

    // "Não achei" é resultado, e precisa ser dito: um leitor que fica em silêncio
    // é indistinguível de um leitor travado.
    await expect(page.getByText('Nenhum QR Code encontrado nesta imagem.')).toBeVisible({
      timeout: 30_000,
    });
  });
});
