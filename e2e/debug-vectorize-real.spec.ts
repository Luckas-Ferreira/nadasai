import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { openApp } from './helpers';

/**
 * PROBE — fora da suíte (`testIgnore: /debug-.*\.spec\.ts/`).
 *
 * Roda a vetorização no logotipo real solto na raiz do projeto e guarda o SVG
 * sobre branco, em 100% e ampliado. Um arquivo desses é de alguém, então ele não
 * entra no git (é por isso que a raiz é o lugar dele) e o probe pula se não
 * estiver lá — mesma regra dos probes de PDF.
 */
/** Qualquer PNG largado na raiz serve — `/*.png` está no .gitignore. */
const LOGO = (() => {
  const root = join(__dirname, '..');
  const png = readdirSync(root).find((f) => f.toLowerCase().endsWith('.png'));
  return png ? join(root, png) : '';
})();

test('vetoriza o logotipo real e guarda o resultado', async ({ page }) => {
  test.skip(!LOGO || !existsSync(LOGO), 'sem PNG na raiz do projeto');
  console.log('[probe] arquivo:', LOGO);

  await openApp(page, '/pt/imagem/vetorizar');
  await page.locator('input[type=file]').first().setInputFiles(LOGO);

  await page.getByRole('button', { name: 'Vetorizar', exact: true }).click();
  await expect(page.locator('app-compare-slider')).toBeVisible({ timeout: 120_000 });

  const stats = await page.locator('app-panel').last().innerText();
  console.log('[probe] painel:', stats.replace(/\n+/g, ' | '));

  const svg = await page.evaluate(async () => {
    for (const el of Array.from(document.querySelectorAll('img'))) {
      const src = (el as HTMLImageElement).src;
      if (!src.startsWith('blob:')) continue;
      const text = await (await fetch(src)).text();
      if (text.startsWith('<svg')) return text;
    }
    return '';
  });

  console.log('[probe] bytes', svg.length, 'paths', (svg.match(/<path/g) ?? []).length);

  await page.setContent(
    `<body style="margin:0;background:#fff"><div style="width:1024px">${svg.replace(
      /width="\d+" height="\d+"/,
      'width="1024"',
    )}</div></body>`,
  );
  await page.locator('svg').first().screenshot({ path: 'test-results/logo-real-svg.png' });

  // O MESMO pedaço, original em cima e vetor embaixo, no mesmo tamanho: é a
  // única comparação que vale, porque o defeito só aparece contra a referência.
  const original = await page.evaluate(async (path: string) => {
    const res = await fetch(path);
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.readAsDataURL(blob);
    });
  }, '/__probe-source.png').catch(() => '');

  const SCALE = 3072;
  const CROP = { x: 700, y: 1850, w: 1280, h: 420 };
  const pane = (inner: string, label: string): string =>
    `<div style="position:relative;width:${CROP.w}px;height:${CROP.h}px;overflow:hidden;background:#fff">
       <div style="position:absolute;left:${-CROP.x}px;top:${-CROP.y}px;width:${SCALE}px">${inner}</div>
       <span style="position:absolute;left:8px;top:6px;font:600 16px sans-serif;color:#64748b">${label}</span>
     </div>`;

  await page.setContent(
    `<body style="margin:0;background:#fff">
       ${pane(`<img src="${original}" style="width:${SCALE}px;height:${SCALE}px;display:block">`, 'ORIGINAL')}
       ${pane(svg.replace(/width="\d+" height="\d+"/, `width="${SCALE}" height="${SCALE}"`), 'VETOR')}
     </body>`,
  );
  await page.screenshot({ path: 'test-results/logo-real-crop.png', clip: { x: 0, y: 0, width: CROP.w, height: CROP.h * 2 } });
});
