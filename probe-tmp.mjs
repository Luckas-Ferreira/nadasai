import { readFileSync } from 'node:fs';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const file = process.argv[2], needle = process.argv[3];
const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 }).promise;

for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();
  const items = tc.items.filter(i => 'str' in i && i.str.trim()).map(i => {
    const t = i.transform;
    const fs = Math.abs(t[3]);
    const vx = vp.transform[0]*t[4] + vp.transform[2]*t[5] + vp.transform[4];
    const vy = vp.transform[1]*t[4] + vp.transform[3]*t[5] + vp.transform[5];
    const fh = (i.height || fs) * Math.abs(vp.transform[3]);
    return { s: i.str, x: +(vx/vp.width).toFixed(4), y: +((vy - fh*0.8)/vp.height).toFixed(4),
             w: +((i.width||0)*Math.abs(vp.transform[0])/vp.width).toFixed(4), h: +(fh/vp.height).toFixed(4) };
  });
  const hit = items.findIndex(i => i.s.includes(needle));
  if (hit < 0) continue;
  console.log(`=== página ${p} (${Math.round(vp.width)}x${Math.round(vp.height)}) ===`);
  for (const i of items.slice(Math.max(0, hit - 6), hit + 14)) {
    console.log(`y=${i.y.toFixed(4)} x=${i.x.toFixed(4)} w=${i.w.toFixed(4)} h=${i.h.toFixed(4)}  ${JSON.stringify(i.s)}`);
  }
  break;
}
process.exit(0);
