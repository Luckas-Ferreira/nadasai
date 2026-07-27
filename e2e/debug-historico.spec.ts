import { test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Probe de diagnóstico do editor de PDF — não é um teste de regressão.
 *
 * Responde três perguntas que só o DOM real responde:
 *   1. `page.render()` do pdf.js resolveu, ou rejeitou depois de já ter pintado?
 *      (é a diferença entre "canvas em branco" e "canvas pintado com o overlay
 *      preto por cima", que na tela parecem coisas diferentes e têm a mesma causa)
 *   2. A cor computada dos blocos é `transparent` ou preta?
 *   3. Qual é o erro completo por trás do `ignoring XObject` do worker?
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
  await page.waitForTimeout(6000);

  // ── 0. Promise.try: nativo, do zone.js, ou o nosso polyfill? ─────────────
  const promiseTry = await page.evaluate(() => {
    const P = Promise as unknown as { try?: (fn: (...a: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown> };
    let forwardsArgs: unknown = 'n/a';
    try {
      forwardsArgs = P.try ? P.try((...a: unknown[]) => a.length, 1, 2, 3) : 'ausente';
    } catch (e) {
      forwardsArgs = 'threw: ' + String(e);
    }
    return {
      ctorName: Promise.name,
      hasTry: typeof P.try,
      arity: P.try?.length,
      source: P.try ? String(P.try).slice(0, 120) : null,
      forwardsArgs,
    };
  });
  console.log('[PROBE] Promise.try:', JSON.stringify(await Promise.resolve(promiseTry), null, 2));
  const argCount = await page.evaluate(async () => {
    const P = Promise as unknown as { try?: (fn: (...a: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown> };
    return P.try ? await P.try((...a: unknown[]) => a.length, 1, 2, 3) : -1;
  });
  console.log('[PROBE] Promise.try recebe quantos args (esperado 3):', argCount);

  // ── 1. Canvas: dimensões e se realmente tem tinta ────────────────────────
  const canvases = await page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas[data-page]')).map((c) => {
      const ctx = c.getContext('2d', { willReadFrequently: true });
      let nonWhite = 0;
      let sampled = 0;
      if (ctx && c.width > 0 && c.height > 0) {
        const d = ctx.getImageData(0, 0, c.width, Math.min(c.height, 400)).data;
        for (let i = 0; i < d.length; i += 4 * 97) {
          sampled++;
          if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) nonWhite++;
        }
      }
      return { page: c.dataset['page'], w: c.width, h: c.height, sampled, nonWhite };
    });
  });
  console.log('[PROBE] canvases:', JSON.stringify(canvases));

  // ── 2. Blocos do overlay: cor computada ──────────────────────────────────
  const blocks = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
    const byColor: Record<string, number> = {};
    for (const el of els) {
      const c = getComputedStyle(el).color;
      byColor[c] = (byColor[c] ?? 0) + 1;
    }
    return {
      total: els.length,
      byColor,
      first5: els.slice(0, 5).map((el) => ({
        id: el.dataset['blockId'],
        color: getComputedStyle(el).color,
        fontSize: getComputedStyle(el).fontSize,
        lineHeight: getComputedStyle(el).lineHeight,
        text: (el.textContent ?? '').slice(0, 60),
      })),
    };
  });
  console.log('[PROBE] blocks:', JSON.stringify(blocks, null, 2));

  // ── 2b. Supersampling: pixels do raster por pixel de tela ────────────────
  const superSample = () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('canvas[data-page="1"]')!;
      const cssW = c.getBoundingClientRect().width;
      const zoomInput = document.querySelector<HTMLInputElement>('input[title*="Zoom" i], input[value$="%"]');
      return {
        backingW: c.width,
        cssW: Math.round(cssW),
        ratio: +(c.width / Math.max(1, cssW)).toFixed(2),
        zoom: zoomInput?.value ?? '?',
      };
    });

  console.log('[PROBE] nitidez no zoom inicial:', JSON.stringify(await superSample()));

  // Amplia (o zoom é Ctrl+roda) e espera o re-render debounced (400ms).
  await page.mouse.move(600, 400);
  await page.keyboard.down('Control');
  for (let i = 0; i < 15; i++) await page.mouse.wheel(0, -400);
  await page.keyboard.up('Control');
  await page.waitForTimeout(4000);
  console.log('[PROBE] nitidez após ampliar:', JSON.stringify(await superSample()));

  // ── 3. Banner de aviso ───────────────────────────────────────────────────
  const alerts = await page.locator('[role=alert]').allTextContents();
  console.log('[PROBE] alerts:', JSON.stringify(alerts));

  // ── 4. Console ───────────────────────────────────────────────────────────
  const interesting = logs.filter((l) => /error|XObject|render|wasm|Failed|404/i.test(l));
  console.log('[PROBE] console (' + logs.length + ' linhas, ' + interesting.length + ' relevantes):');
  for (const l of interesting.slice(0, 40)) console.log('   ' + l);

  await page.screenshot({ path: 'probe-historico.png' });
});
