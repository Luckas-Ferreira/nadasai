import { test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Probe de digitação: a caixa de um bloco vem da bbox do PDF, dimensionada para
 * o texto original. Ao digitar mais, o excesso aparecia enquanto o bloco estava
 * selecionado e sumia ao clicar fora — parecia que o editor comia o texto.
 * Aqui se mede se a caixa cresce e se o texto sobrevive à desseleção.
 */
const PDF = join(__dirname, '..', 'centelha.pdf');

test('probe: digitar além da caixa do bloco', async ({ page }) => {
  test.skip(!existsSync(PDF), `coloque o arquivo em ${PDF}`);

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/pt/pdf/editar');
  await page.locator('input[type=file]').first().setInputFiles(PDF);
  await page.waitForSelector('canvas[data-page]', { timeout: 60_000 });
  await page.waitForTimeout(4000);

  // Um parágrafo multilinha, que é onde o transbordo aparece.
  const id = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
    const alvo = els.find((el) => (el.textContent ?? '').length > 200);
    return alvo?.dataset['blockId'] ?? null;
  });
  if (!id) {
    console.log('[PROBE] nenhum parágrafo longo encontrado');
    return;
  }

  const geometria = () =>
    page.evaluate((blockId) => {
      const el = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)!;
      const caixa = el.parentElement!;
      return {
        caixaAlturaPct: +caixa.style.height.replace('%', ''),
        transbordoY: el.scrollHeight - el.clientHeight,
        overflow: getComputedStyle(el).overflow,
        chars: (el.textContent ?? '').length,
      };
    }, id);

  const bloco = page.locator(`[data-block-id="${id}"]`);
  await bloco.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  const alturaOriginal = (await geometria()).caixaAlturaPct;

  // Selecionar e sair sem digitar não pode mexer na geometria. O transbordo em
  // repouso é o espaço do descendente da última linha, não texto escapando.
  for (let i = 0; i < 3; i++) {
    await bloco.click();
    await page.waitForTimeout(250);
    await page.locator('.doc-scroll').click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(250);
  }
  const aposCliquesVazios = (await geometria()).caixaAlturaPct;
  console.log(
    '[PROBE] 3 ciclos de clicar/sair sem digitar:',
    JSON.stringify({ alturaOriginal, aposCliquesVazios, cresceuSozinho: aposCliquesVazios !== alturaOriginal }),
  );

  await bloco.click();
  await page.waitForTimeout(400);

  console.log('[PROBE] antes de digitar:', JSON.stringify(await geometria()));

  // Digita bastante no fim do bloco, como o usuário fez.
  await bloco.click();
  await page.keyboard.press('Control+End');
  await bloco.pressSequentially(
    ' texto extra que o usuario digitou depois, longo o bastante para estourar a caixa original do bloco e forcar mais de uma linha nova.',
    { delay: 4 },
  );
  await page.waitForTimeout(600);

  const digitado = await geometria();
  console.log('[PROBE] digitando (selecionado):', JSON.stringify(digitado));

  // Clica fora: é aqui que o texto sumia.
  await page.locator('.doc-scroll').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(800);

  const depois = await page.evaluate((blockId) => {
    const el = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)!;
    const caixa = el.parentElement!;
    const rectTexto = el.getBoundingClientRect();
    const rectCaixa = caixa.getBoundingClientRect();
    return {
      caixaAlturaPct: +caixa.style.height.replace('%', ''),
      overflow: getComputedStyle(el).overflow,
      chars: (el.textContent ?? '').length,
      contemOTexto: (el.textContent ?? '').includes('forcar mais de uma linha nova'),
      // Se o conteúdo pintado couber na caixa, nada foi recortado.
      textoCabeNaCaixa: rectTexto.bottom <= rectCaixa.bottom + 2,
      recortado: el.scrollHeight - el.clientHeight,
    };
  }, id);
  console.log('[PROBE] após clicar fora:', JSON.stringify(depois, null, 2));

  if (errors.length) console.log('[PROBE] pageerrors:', errors.slice(0, 3));
  await page.screenshot({ path: 'probe-digitacao.png' });
});
