import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

/**
 * PROBE VISUAL — não faz parte da suíte (`testIgnore: /debug-.*\.spec\.ts/`).
 * Roda a vetorização num logo sintético com transparência e antialiasing e
 * guarda os PNGs para inspeção a olho.
 */
test('vetoriza um logo com transparência e guarda o antes/depois', async ({ page }) => {
  await openApp(page, '/pt/imagem/vetorizar');

  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;

    // Fundo TRANSPARENTE de propósito, e formas com curva, canto reto e
    // diagonal — os três casos que o traçado precisa acertar ao mesmo tempo.
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

    ctx.fillStyle = '#111827';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('Nada Sai', 78, 255);

    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });

  await page.getByRole('button', { name: 'Vetorizar', exact: true }).click();

  // O resultado troca a pré-visualização pelo comparador antes/depois.
  const compare = page.locator('app-compare-slider');
  await expect(compare).toBeVisible({ timeout: 60_000 });

  // Qual das <img> é o SVG não é posicional — busca pelo conteúdo.
  const svg = await page.evaluate(async () => {
    for (const el of Array.from(document.querySelectorAll('img'))) {
      const src = (el as HTMLImageElement).src;
      if (!src.startsWith('blob:')) continue;
      const text = await (await fetch(src)).text();
      if (text.startsWith('<svg')) return text;
    }
    return '';
  });

  console.log('[probe] bytes do SVG', svg.length);
  console.log('[probe] formas', (svg.match(/<path/g) ?? []).length);
  console.log('[probe] cabeça', svg.slice(0, 200));

  await page.screenshot({ path: 'test-results/vetorizar-tela.png', fullPage: false });

  // O inspetor: três passos de zoom (100% -> 800%) e o divisor no meio do "N".
  // É a imagem que prova a tese — mesmo tamanho na tela, raster borrado de um
  // lado e curva nítida do outro.
  const frame = page.locator('app-compare-slider > div');
  const box = (await frame.boundingBox())!;

  // Duplo clique amplia MANTENDO o ponto sob o cursor: três deles sobre a borda
  // do círculo levam a 800% com a borda ainda na tela, dos dois lados do divisor.
  const fx = box.x + (box.width - 400) / 2 + 168;
  const fy = box.y + (box.height - 300) / 2 + 52;
  for (let i = 0; i < 3; i++) await page.mouse.dblclick(fx, fy);
  await expect(page.getByRole('button', { name: 'Ajustar à moldura' })).toContainText('800%');
  await frame.screenshot({ path: 'test-results/vetorizar-zoom.png' });

  // O SVG sozinho, em cima de um xadrez, para julgar borda e transparência.
  await page.setContent(
    `<body style="margin:0;background:conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/24px 24px">
       <div style="display:flex;gap:8px;padding:8px">${svg}</div>
     </body>`,
  );
  await page.locator('svg').first().screenshot({ path: 'test-results/vetorizar-svg.png' });
});
