/**
 * Despeja a geometria dos itens de texto de um PDF, em torno de um trecho.
 *
 *   node scripts/dump-pdf-text.mjs arquivo.pdf "CPTA107"
 *
 * As coordenadas saem normalizadas (0–1) no mesmo referencial do
 * `PdfLoaderService` — `y` é o TOPO do glifo, a 0.8 da altura acima da baseline
 * —, então dá para colar direto num caso do `paragraph-merger.spec.ts` sem
 * converter nada.
 *
 * Existe porque os defeitos de agrupamento do editor de PDF são todos
 * geométricos, e discutir geometria olhando a tela é adivinhação. Foi vendo
 * estes números que ficou claro que o código de uma disciplina e o nome dela
 * estão em baselines diferentes, e que o teste de "mesma linha" comparava
 * centros verticais. Roda em Node, sem browser e sem servidor.
 */
import { readFileSync } from 'node:fs';

const [, , file, needle] = process.argv;

if (!file) {
  console.error('uso: node scripts/dump-pdf-text.mjs <arquivo.pdf> [trecho]');
  process.exit(1);
}

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  const items = content.items
    .filter((i) => 'str' in i && i.str.trim())
    .map((i) => {
      const t = i.transform;
      const fontSize = Math.abs(t[3]);
      const vx = vp.transform[0] * t[4] + vp.transform[2] * t[5] + vp.transform[4];
      const vy = vp.transform[1] * t[4] + vp.transform[3] * t[5] + vp.transform[5];
      const fontHeight = (i.height || fontSize) * Math.abs(vp.transform[3]);
      return {
        s: i.str,
        x: (vx / vp.width).toFixed(4),
        y: ((vy - fontHeight * 0.8) / vp.height).toFixed(4),
        w: (((i.width || 0) * Math.abs(vp.transform[0])) / vp.width).toFixed(4),
        h: (fontHeight / vp.height).toFixed(4),
      };
    });

  const hit = needle ? items.findIndex((i) => i.s.includes(needle)) : 0;
  if (hit < 0) continue;

  console.log(`=== página ${p} de ${doc.numPages} (${Math.round(vp.width)}x${Math.round(vp.height)}) ===`);
  const slice = needle ? items.slice(Math.max(0, hit - 6), hit + 14) : items.slice(0, 40);
  for (const i of slice) {
    // A baseline é o que o agrupador usa para decidir "mesma linha".
    const baseline = (Number(i.y) + Number(i.h) * 0.8).toFixed(4);
    console.log(`y=${i.y} base=${baseline} x=${i.x} w=${i.w} h=${i.h}  ${JSON.stringify(i.s)}`);
  }
  if (needle) break;
}

process.exit(0);
