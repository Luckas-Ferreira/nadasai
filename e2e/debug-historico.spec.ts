import { test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Probe de diagnóstico do editor de PDF — não é um teste de regressão.
 *
 * Responde o que só o DOM real responde:
 *   1. `page.render()` do pdf.js resolveu, ou rejeitou depois de já ter pintado?
 *      (é a diferença entre "canvas em branco" e "canvas pintado com o overlay
 *      preto por cima", que na tela parecem coisas diferentes e têm a mesma causa)
 *   2. A cor computada dos blocos é `transparent` ou preta?
 *   3. Quantas amostras de raster por pixel de tela, antes e depois do zoom?
 *   4. A rasterização sob demanda está mesmo limitando a janela e descartando
 *      o que sai dela?
 */
const PDF = join(__dirname, '..', 'historico.pdf');

test('probe: estado do editor com o histórico acadêmico', async ({ page }) => {
  test.skip(!existsSync(PDF), `coloque o arquivo em ${PDF}`);

  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto('/pt/pdf/editar');
  await page.locator('input[type=file]').first().setInputFiles(PDF);
  await page.waitForSelector('canvas[data-page]', { timeout: 60_000 });
  await page.waitForTimeout(4000);

  // Um canvas nunca desenhado fica em 300×150, o padrão do elemento. É assim
  // que se distingue "ainda não rasterizado / descartado" de "rasterizado".
  const canvasState = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas[data-page]')).map((c) => ({
        page: Number(c.dataset['page']),
        w: c.width,
        rasterizado: c.width > 300,
      })),
    );

  const sharpness = () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas[data-page="1"]')!;
      const cssW = c.getBoundingClientRect().width;
      return { backingW: c.width, cssW: Math.round(cssW), ratio: +(c.width / Math.max(1, cssW)).toFixed(2) };
    });

  console.log('[PROBE] após carregar:', JSON.stringify(await canvasState()));
  console.log('[PROBE] nitidez no zoom inicial:', JSON.stringify(await sharpness()));

  // ── Blocos do overlay: cor computada ─────────────────────────────────────
  const blocks = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
    const byColor: Record<string, number> = {};
    for (const el of els) {
      const c = getComputedStyle(el).color;
      byColor[c] = (byColor[c] ?? 0) + 1;
    }
    return { total: els.length, byColor };
  });
  console.log('[PROBE] blocos:', JSON.stringify(blocks));

  // ── Rola até o fim: as últimas páginas rasterizam, as primeiras são descartadas ──
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.overflow-auto')!;
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(4000);
  console.log('[PROBE] após rolar ao fim:', JSON.stringify(await canvasState()));

  // ── Volta ao topo: a página 1 é rasterizada de novo ──────────────────────
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.overflow-auto')!;
    el.scrollTop = 0;
  });
  await page.waitForTimeout(4000);
  console.log('[PROBE] após voltar ao topo:', JSON.stringify(await canvasState()));

  // ── Zoom (Ctrl+roda) e re-rasterização debounced ─────────────────────────
  await page.mouse.move(600, 400);
  await page.keyboard.down('Control');
  for (let i = 0; i < 15; i++) await page.mouse.wheel(0, -400);
  await page.keyboard.up('Control');
  await page.waitForTimeout(4000);
  console.log('[PROBE] nitidez após ampliar:', JSON.stringify(await sharpness()));
  console.log('[PROBE] canvas após ampliar:', JSON.stringify(await canvasState()));

  const alerts = await page.locator('[role=alert]').allTextContents();
  console.log('[PROBE] alertas:', JSON.stringify(alerts));

  const interesting = logs.filter((l) => /error|XObject|render|wasm|Failed|404/i.test(l));
  console.log(`[PROBE] console: ${logs.length} linhas, ${interesting.length} relevantes`);
  for (const l of interesting.slice(0, 20)) console.log('   ' + l);

  await page.screenshot({ path: 'probe-historico.png' });
});
