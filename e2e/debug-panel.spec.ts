import { test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Probe do painel de edição: estrutura, alinhamento manual e OCR condicional. */
const PDF = join(__dirname, '..', 'historico.pdf');

test('probe: painel de edição do PDF', async ({ page }) => {
  test.skip(!existsSync(PDF), `coloque o arquivo em ${PDF}`);

  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

  await page.goto('/pt/pdf/editar');
  await page.locator('input[type=file]').first().setInputFiles(PDF);
  await page.waitForSelector('canvas[data-page]', { timeout: 60_000 });
  await page.waitForTimeout(4000);

  const panels = () => page.locator('[panel] h2').allTextContents();
  console.log('[PROBE] painéis (nada selecionado):', JSON.stringify(await panels()));

  const emptyState = await page.locator('[panel]').getByText('Clique num bloco de texto').isVisible();
  console.log('[PROBE] estado vazio do painel de bloco visível:', emptyState);

  // ── Seleciona um bloco e inspeciona os controles ─────────────────────────
  await page.locator('[data-block-id]').first().click();
  await page.waitForTimeout(600);
  console.log('[PROBE] painéis (bloco selecionado):', JSON.stringify(await panels()));

  const alignButtons = page.locator('[aria-label="Alinhar à esquerda"], [aria-label="Centralizar"], [aria-label="Alinhar à direita"], [aria-label="Justificar"]');
  console.log('[PROBE] botões de alinhamento:', await alignButtons.count());

  const pressedBefore = await page.locator('[aria-pressed="true"][aria-label*="linh"], [aria-pressed="true"][aria-label="Centralizar"], [aria-pressed="true"][aria-label="Justificar"]').getAttribute('aria-label');
  console.log('[PROBE] alinhamento detectado automaticamente:', pressedBefore);

  const blockId = await page.locator('[data-block-id]').first().getAttribute('data-block-id');
  const alignOf = () =>
    page.evaluate(
      (id) => getComputedStyle(document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!).textAlign,
      blockId,
    );
  console.log('[PROBE] text-align do bloco antes:', await alignOf());

  await page.getByLabel('Centralizar').click();
  await page.waitForTimeout(400);
  console.log('[PROBE] text-align após clicar em Centralizar:', await alignOf());

  await page.getByLabel('Alinhar à direita').click();
  await page.waitForTimeout(400);
  console.log('[PROBE] text-align após clicar em Alinhar à direita:', await alignOf());

  await page.getByLabel('Justificar').click();
  await page.waitForTimeout(400);
  console.log('[PROBE] text-align após clicar em Justificar:', await alignOf());

  // ── OCR: este documento é 100% digital, o painel não deve existir ────────
  const ocrPanel = await page.locator('[panel]').getByText('Reconhecimento de texto').count();
  console.log('[PROBE] painel de OCR presente (esperado 0 em PDF digital):', ocrPanel);

  const interesting = logs.filter((l) => /error|pageerror/i.test(l));
  console.log(`[PROBE] console: ${logs.length} linhas, ${interesting.length} erros`);
  for (const l of interesting.slice(0, 10)) console.log('   ' + l);

  await page.screenshot({ path: 'probe-panel.png' });
});

test('probe: o painel de OCR aparece num PDF digitalizado', async ({ page }) => {
  const scan = join(__dirname, '..', 'assets', 'scan.pdf');
  test.skip(!existsSync(scan), `sem ${scan}`);

  await page.goto('/pt/pdf/editar');
  await page.locator('input[type=file]').first().setInputFiles(scan);
  await page.waitForSelector('canvas[data-page]', { timeout: 60_000 });
  await page.waitForTimeout(3000);

  console.log('[PROBE] painéis:', JSON.stringify(await page.locator('[panel] h2').allTextContents()));
  console.log(
    '[PROBE] painel de OCR presente (esperado 1):',
    await page.locator('[panel]').getByText('Reconhecimento de texto').count(),
  );
  console.log(
    '[PROBE] texto contextual:',
    JSON.stringify((await page.locator('[panel] p').allTextContents()).map((t) => t.trim()).filter(Boolean)),
  );
});
