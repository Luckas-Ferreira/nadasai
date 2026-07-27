import { test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Probe de exportação. Fecha o ciclo que faltava: edita um bloco, exporta e
 * **lê o PDF gerado** com o pdf.js para conferir que o texto está lá, no lugar e
 * num corpo plausível.
 *
 * Sem ler o resultado, o export parecia funcionar — o arquivo baixava, sem erro
 * no console. O bloco editado saía como um retângulo branco porque o texto era
 * desenhado a milhares de pontos abaixo do papel, e nada nessa jornada avisava.
 */
const PDF = join(__dirname, '..', 'centelha.pdf');
const MARCA = 'MARCADOR DE TESTE DE EXPORTACAO';

test('probe: o texto editado sobrevive ao export', async ({ page }) => {
  test.skip(!existsSync(PDF), `coloque o arquivo em ${PDF}`);

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/pt/pdf/editar');
  await page.locator('input[type=file]').first().setInputFiles(PDF);
  await page.waitForSelector('canvas[data-page]', { timeout: 60_000 });
  await page.waitForTimeout(4000);

  // Edita um parágrafo da primeira página.
  const id = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
    return els.find((el) => (el.textContent ?? '').length > 200)?.dataset['blockId'] ?? null;
  });
  test.skip(!id, 'nenhum parágrafo longo na primeira página');

  const bloco = page.locator(`[data-block-id="${id}"]`);
  await bloco.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await bloco.click();
  await page.waitForTimeout(400);
  await page.keyboard.press('Control+End');
  await bloco.pressSequentially(` ${MARCA}.`, { delay: 4 });
  await page.locator('.doc-scroll').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(600);

  const esperado = await page.evaluate((blockId) => {
    const el = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)!;
    return { corpoNaTela: getComputedStyle(el).fontSize, chars: (el.textContent ?? '').length };
  }, id);

  // Exporta e captura o arquivo.
  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.getByRole('button', { name: /Exportar PDF/i }).click(),
  ]).then(([d]) => d);

  const saida = join(__dirname, '..', 'probe-exportado.pdf');
  await download.saveAs(saida);
  console.log('[PROBE] baixado como:', download.suggestedFilename(), '| esperado na tela:', JSON.stringify(esperado));

  // ── Lê o PDF gerado ──────────────────────────────────────────────────────
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(saida)), verbosity: 0 }).promise;
  const pagina = await doc.getPage(1);
  const vp = pagina.getViewport({ scale: 1 });
  const conteudo = await pagina.getTextContent();

  const itens = conteudo.items.filter((i: any) => 'str' in i && i.str.trim());
  const alvo = itens.filter((i: any) => i.str.includes('MARCADOR') || i.str.includes('EXPORTACAO'));

  // Marcação vazada: o conteúdo do contenteditable é fatiado em linhas, e a
  // última fica com o </div> de fechamento pendurado.
  const comMarcacao = itens.filter((i: any) => /<\/?[a-z]+>/i.test(i.str)).map((i: any) => i.str);
  console.log('[PROBE] itens com marcação HTML vazada (esperado 0):', JSON.stringify(comMarcacao));

  // Nada pode ultrapassar a margem direita da página.
  const foraDaPagina = itens
    .filter((i: any) => i.transform[4] + (i.width ?? 0) > vp.width || i.transform[5] < 0 || i.transform[5] > vp.height)
    .map((i: any) => i.str.slice(0, 30));
  console.log('[PROBE] itens fora do papel (esperado 0):', JSON.stringify(foraDaPagina.slice(0, 5)));

  console.log(
    '[PROBE] no PDF exportado:',
    JSON.stringify(
      {
        paginas: doc.numPages,
        alturaPagina: Math.round(vp.height),
        itensDeTexto: itens.length,
        marcaEncontrada: alvo.length > 0,
        amostra: alvo.slice(0, 2).map((i: any) => ({
          texto: i.str.slice(0, 40),
          corpoPt: +Math.abs(i.transform[3]).toFixed(1),
          // Negativo ou acima da altura = desenhado fora do papel.
          yPt: +i.transform[5].toFixed(1),
          dentroDaPagina: i.transform[5] > 0 && i.transform[5] < vp.height,
        })),
      },
      null,
      2,
    ),
  );

  if (errors.length) console.log('[PROBE] pageerrors:', errors.slice(0, 3));

  // Prova visual: reabre o próprio arquivo exportado no editor e fotografa.
  await page.goto('/pt/pdf/editar');
  await page.locator('input[type=file]').first().setInputFiles(saida);
  await page.waitForSelector('canvas[data-page]', { timeout: 60_000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'probe-exportado.png' });
});
