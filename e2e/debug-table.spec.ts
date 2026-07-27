import { test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Probe de tabelas: em layout de grade, o agrupador juntava células de colunas
 * diferentes numa linha só e esmagava a fonte para caber. Aqui se mede quantos
 * blocos cobrem uma linha da tabela e o que cada um contém.
 */
const DOCS = [
  { nome: 'historico', arquivo: 'historico.pdf', ancora: 'CPTA107' },
  { nome: 'centelha', arquivo: 'centelha.pdf', ancora: null },
];

for (const doc of DOCS) {
  test(`probe: tabela em ${doc.nome}`, async ({ page }) => {
    const pdf = join(__dirname, '..', doc.arquivo);
    test.skip(!existsSync(pdf), `coloque o arquivo em ${pdf}`);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/pt/pdf/editar');
    await page.locator('input[type=file]').first().setInputFiles(pdf);
    await page.waitForSelector('canvas[data-page]', { timeout: 60_000 });
    await page.waitForTimeout(5000);

    // Um bloco que junta colunas distintas fica largo demais e, para caber, com
    // a fonte muito menor que a mediana da página. As duas coisas se medem.
    const report = await page.evaluate((ancora) => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('[data-block-id]'));
      const sizes = els.map((el) => parseFloat(getComputedStyle(el).fontSize)).filter((n) => n > 0);
      const mediana = sizes.slice().sort((a, b) => a - b)[Math.floor(sizes.length / 2)];

      const esmagados = els
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < mediana * 0.7)
        .map((el) => ({
          texto: (el.textContent ?? '').slice(0, 70),
          px: +parseFloat(getComputedStyle(el).fontSize).toFixed(2),
        }));

      const naAncora = ancora
        ? els
            .filter((el) => (el.textContent ?? '').includes(ancora))
            .map((el) => ({ texto: (el.textContent ?? '').slice(0, 90), px: +parseFloat(getComputedStyle(el).fontSize).toFixed(2) }))
        : [];

      return {
        blocos: els.length,
        medianaPx: +mediana.toFixed(2),
        esmagados: esmagados.length,
        exemplosEsmagados: esmagados.slice(0, 5),
        naAncora,
      };
    }, doc.ancora);

    console.log(`[PROBE ${doc.nome}]`, JSON.stringify(report, null, 2));
    if (errors.length) console.log(`[PROBE ${doc.nome}] pageerrors:`, errors.slice(0, 3));

    if (doc.ancora) {
      // Reproduz o clique do usuário numa célula e fotografa a região.
      const zoomInput = page.locator('input[title="Zoom %"]');
      await zoomInput.fill('200');
      await zoomInput.press('Enter');
      await page.waitForTimeout(3000);

      const cell = page.locator('[data-block-id]', { hasText: doc.ancora }).first();
      await cell.scrollIntoViewIfNeeded();
      await page.waitForTimeout(2500);
      await cell.click();
      await page.waitForTimeout(600);

      const box = await cell.boundingBox();
      if (box) {
        await page.screenshot({
          path: `probe-tabela-${doc.nome}-celula.png`,
          clip: {
            x: Math.max(0, box.x - 140),
            y: Math.max(0, box.y - 90),
            width: 780,
            height: 200,
          },
        });
      }
      console.log(
        `[PROBE ${doc.nome}] célula clicada:`,
        JSON.stringify(await cell.evaluate((el) => ({
          texto: el.textContent,
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height),
          fontSize: getComputedStyle(el).fontSize,
        }))),
      );
    }

    await page.screenshot({ path: `probe-tabela-${doc.nome}.png` });
  });
}
