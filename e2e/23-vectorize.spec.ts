import { expect, test } from '@playwright/test';
import { expectDownload, openApp } from './helpers';

/**
 * A vetorização e o INSPETOR DE ZOOM.
 *
 * As duas garantias que só existem no navegador de verdade: um PNG recortado
 * atravessa o serviço sem ganhar fundo (era um `fillRect` branco antes do
 * `drawImage`, e nenhum teste de núcleo alcança essa linha), e o zoom REDESENHA
 * o SVG em vez de esticar o raster dele.
 */
test.describe('Vetorizar', () => {
  /** Um logo com curva, canto reto e diagonal, sobre fundo transparente. */
  async function uploadLogo(page: import('@playwright/test').Page): Promise<void> {
    const bytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext('2d')!;

      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.arc(110, 110, 70, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.moveTo(230, 40);
      ctx.lineTo(370, 40);
      ctx.lineTo(300, 175);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#059669';
      ctx.fillRect(60, 210, 280, 60);

      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });

    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  }

  test('vetoriza um recorte sem inventar fundo', async ({ page }) => {
    await openApp(page, '/pt/imagem/vetorizar');
    await uploadLogo(page);

    await page.getByRole('button', { name: 'Vetorizar', exact: true }).click();
    await expect(page.locator('app-compare-slider')).toBeVisible({ timeout: 60_000 });

    const svg = await page.evaluate(async () => {
      for (const el of Array.from(document.querySelectorAll('img'))) {
        const src = (el as HTMLImageElement).src;
        if (!src.startsWith('blob:')) continue;
        const text = await (await fetch(src)).text();
        if (text.startsWith('<svg')) return text;
      }
      return '';
    });

    expect(svg).toContain('<path');

    /**
     * A área transparente não pode virar forma. Um `<rect>` do tamanho do
     * viewBox — ou um path cobrindo os quatro cantos — é exatamente o retângulo
     * branco que a ferramenta devolvia; e um `<path>` só com uma cor, quando o
     * desenho tem três, é o outro sintoma (a silhueta estava no alfa e ninguém
     * lia o alfa, então a imagem inteira virava uma cor só).
     */
    expect(svg).not.toContain('<rect');
    const fills = new Set(svg.match(/fill="#[0-9a-f]{3,6}"/g) ?? []);
    expect(fills.size).toBeGreaterThanOrEqual(3);

    await expectDownload(page, /^logo-vetor\.svg$/);
  });

  /**
   * O ZOOM TEM DE REDESENHAR, e é o que este teste mede.
   *
   * A versão anterior ampliava com `transform: scale(2.2)`. Num `<img>` que
   * aponta para SVG, o navegador rasteriza no tamanho de LAYOUT e o transform
   * estica esse raster já pronto: a ferramenta cuja tese é "isto agora é curva"
   * mostrava, no botão "ver detalhes", o vetor borrado. Com a largura de layout
   * mudando, o desenho é refeito em cada nível — e é isso que `clientWidth`
   * prova, porque um transform não mexe nele.
   */
  test('o zoom redesenha o vetor em vez de esticar o raster', async ({ page }) => {
    await openApp(page, '/pt/imagem/vetorizar');
    await uploadLogo(page);

    await page.getByRole('button', { name: 'Vetorizar', exact: true }).click();
    await expect(page.locator('app-compare-slider')).toBeVisible({ timeout: 60_000 });

    const result = page.locator('app-compare-slider img').first();
    const base = await result.evaluate((el) => (el as HTMLImageElement).clientWidth);
    expect(base).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Aproximar' }).click();
    await page.getByRole('button', { name: 'Aproximar' }).click();

    await expect(page.getByRole('button', { name: 'Ajustar à moldura' })).toContainText('400%');

    const zoomed = await result.evaluate((el) => (el as HTMLImageElement).clientWidth);
    expect(zoomed).toBe(base * 4);

    // E nenhuma escala de CSS por trás: só deslocamento.
    const transform = await result.evaluate((el) => getComputedStyle(el).transform);
    expect(transform === 'none' || transform.startsWith('matrix(1, 0, 0, 1')).toBe(true);

    // Ampliado, arrastar move a imagem — sem isso não há como alcançar o canto
    // de um desenho em 4x, e o divisor passa a ter a alça como controle.
    await expect(page.getByText('Arraste para mover')).toBeVisible();

    // Longe do centro de propósito: ali fica a alça do divisor, que existe
    // justamente para continuar movendo o divisor enquanto o resto vira pan.
    const frame = page.locator('app-compare-slider > div');
    const box = (await frame.boundingBox())!;
    const startX = box.x + box.width * 0.3;
    const startY = box.y + box.height * 0.25;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 120, startY, { steps: 8 });
    await page.mouse.up();

    const moved = await result.evaluate((el) => getComputedStyle(el).transform);
    expect(moved).not.toBe(transform);

    // "Ajustar à moldura" volta ao começo, zoom e deslocamento juntos.
    await page.getByRole('button', { name: 'Ajustar à moldura' }).click();
    await expect(page.getByRole('button', { name: 'Ajustar à moldura' })).toContainText('100%');
    expect(await result.evaluate((el) => (el as HTMLImageElement).clientWidth)).toBe(base);
  });
});
