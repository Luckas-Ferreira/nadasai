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

  // A caixa dos blocos foi apertada de 6% para 1% de folga, agora que o corpo da
  // fonte é medido exatamente. Se algum texto passar da caixa, ele quebra numa
  // linha a mais e empurra o bloco todo — é o que esta contagem vigia.
  const overflow = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
    const estourando = els.filter((el) => el.scrollWidth > el.clientWidth + 1);
    return {
      total: els.length,
      estourandoNaLargura: estourando.length,
      exemplos: estourando.slice(0, 3).map((el) => (el.textContent ?? '').slice(0, 40)),
    };
  });
  console.log('[PROBE] blocos estourando a caixa (esperado 0):', JSON.stringify(overflow));

  // Estilo da superfície de leitura: os tokens do Tailwind v4 só existem se o
  // nome da variável casar, e um token inexistente não gera classe nenhuma —
  // falha silenciosa que deixaria o fundo transparente.
  console.log(
    '[PROBE] estilo do stage:',
    JSON.stringify(
      await page.evaluate(() => {
        const scroll = document.querySelector<HTMLElement>('.doc-scroll')!;
        const sheet = document.querySelector<HTMLElement>('canvas[data-page]')!.parentElement!;
        const cs = getComputedStyle(scroll);
        const cssSheet = getComputedStyle(sheet);
        return {
          fundo: cs.backgroundColor,
          bordaRaio: cs.borderRadius,
          bordaCor: cs.borderColor,
          folhaRaio: cssSheet.borderRadius,
          // O Tailwind v4 compõe box-shadow com quatro slots vazios (inset,
          // inset-ring, ring-offset, ring) antes do valor real. Só interessam as
          // camadas pintadas.
          folhaSombra: cssSheet.boxShadow
            .split(/,(?![^(]*\))/)
            .map((s) => s.trim())
            .filter((s) => !s.startsWith('rgba(0, 0, 0, 0)')),
          canvasRaio: getComputedStyle(document.querySelector('canvas[data-page]')!).borderRadius,
        };
      }),
    ),
  );

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

  // ── Justificado de verdade: mede a largura pintada de cada linha ─────────
  // A prova é geométrica. Numa linha justificada o texto ocupa a caixa inteira;
  // se o CSS estiver tratando a linha como "última", ela fica na largura natural.
  const multiline = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
    // Um bloco com várias linhas — só nele a justificação é observável.
    const target = els.find((el) => (el.textContent ?? '').length > 90 && el.getBoundingClientRect().height > 25);
    return target?.dataset['blockId'] ?? null;
  });

  if (multiline) {
    const lineWidths = async () =>
      page.evaluate((id) => {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
        const boxW = el.getBoundingClientRect().width;
        const range = document.createRange();
        const widths: number[] = [];
        for (const node of Array.from(el.childNodes)) {
          range.selectNodeContents(node);
          const rects = Array.from(range.getClientRects()).filter((r) => r.width > 1);
          for (const r of rects) widths.push(+(r.width / boxW).toFixed(3));
        }
        return { boxW: Math.round(boxW), fracoesDaCaixa: widths };
      }, multiline);

    await page.locator(`[data-block-id="${multiline}"]`).click();
    await page.waitForTimeout(300);
    await page.getByLabel('Alinhar à esquerda').click();
    await page.waitForTimeout(400);
    console.log('[PROBE] multilinha alinhado à esquerda:', JSON.stringify(await lineWidths()));

    await page.getByLabel('Justificar').click();
    await page.waitForTimeout(400);
    console.log('[PROBE] multilinha justificado:', JSON.stringify(await lineWidths()));

    console.log(
      '[PROBE] interno:',
      JSON.stringify(
        await page.evaluate((id) => {
          const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
          const cs = getComputedStyle(el);
          const firstChild = el.firstElementChild as HTMLElement | null;
          return {
            html: el.innerHTML.slice(0, 200),
            textAlign: cs.textAlign,
            textAlignLast: cs.textAlignLast,
            whiteSpace: cs.whiteSpace,
            filhoTag: firstChild?.tagName ?? null,
            filhoAlignLast: firstChild ? getComputedStyle(firstChild).textAlignLast : null,
            filhoW: firstChild ? Math.round(firstChild.getBoundingClientRect().width) : null,
          };
        }, multiline),
        null,
        2,
      ),
    );
  } else {
    console.log('[PROBE] nenhum bloco multilinha encontrado para medir justificação');
  }

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
