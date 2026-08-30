// Confere os limites de caractere da ficha do Play e a existência dos gráficos.
//
// POR QUE ISTO EXISTE
//
// O Play Console TRUNCA em silêncio no editor de listagem em algumas
// superfícies e RECUSA em outras, e a diferença aparece só na hora de salvar,
// depois de você ter colado quatro blocos em dois idiomas. Título de 31
// caracteres e descrição curta de 81 são os dois erros que todo mundo comete,
// porque o acento conta como um caractere e a contagem no editor de texto local
// é feita a olho.
//
// O outro erro que isto pega é de dimensão: o ícone TEM que ser 512x512 e o
// gráfico de destaque 1024x500, exatos. O Play não redimensiona, ele recusa.
//
// Rode: node scripts/check-listing.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Os limites do Play, em CARACTERES (não bytes) — o editor conta code units,
 *  então "ã" é um e um emoji fora do BMP é dois. */
const LIMITS = { 'TÍTULO DO APP': 30, 'APP TITLE': 30, 'DESCRIÇÃO CURTA': 80, 'SHORT DESCRIPTION': 80, 'DESCRIÇÃO COMPLETA': 4000, 'FULL DESCRIPTION': 4000 };

/** Recorta um bloco `--- NOME (limite) ---` até o próximo separador. */
function blocks(text) {
  const out = [];
  const re = /^--- (.+?) (?:\((\d+)\) )?-+$/gm;
  const marks = [...text.matchAll(re)];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    out.push({ name: marks[i][1].trim(), declared: marks[i][2] ? Number(marks[i][2]) : null, body: text.slice(start, end).trim() });
  }
  return out;
}

let failures = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failures++;
};

for (const file of ['pt-BR.txt', 'en-US.txt']) {
  const path = join(ROOT, 'store/listing', file);
  if (!existsSync(path)) {
    fail(`store/listing/${file} não existe`);
    continue;
  }
  console.log(`store/listing/${file}`);
  for (const block of blocks(readFileSync(path, 'utf8'))) {
    const limit = LIMITS[block.name.replace(/ \(.*/, '')] ?? block.declared;
    if (!limit) continue;
    if (block.declared && block.declared !== limit) {
      fail(`${block.name}: o cabeçalho diz ${block.declared} e o limite do Play é ${limit}`);
    }
    const n = [...block.body].length;
    if (n > limit) fail(`${block.name}: ${n} caracteres, o Play aceita ${limit}`);
    else if (n === 0) fail(`${block.name}: vazio`);
    else console.log(`  ✓ ${block.name}: ${n}/${limit}`);
  }
}

/** Dimensão de PNG lida do cabeçalho IHDR — 24 bytes bastam, sem dependência. */
function pngSize(path) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path} não é PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

console.log('store/play/');
const GRAPHICS = [
  ['icon-512.png', 512, 512],
  ['feature-graphic-pt.png', 1024, 500],
  ['feature-graphic-en.png', 1024, 500],
];
for (const [name, w, h] of GRAPHICS) {
  const path = join(ROOT, 'store/play', name);
  if (!existsSync(path)) {
    fail(`store/play/${name} não existe — rode: node scripts/generate-android-assets.mjs`);
    continue;
  }
  const size = pngSize(path);
  if (size.w !== w || size.h !== h) fail(`${name}: ${size.w}x${size.h}, o Play exige ${w}x${h}`);
  else console.log(`  ✓ ${name}: ${w}x${h}`);
}

/** As capturas de tela: o Play exige NO MÍNIMO 2 por idioma, com o lado menor
 *  a partir de 320px, e desde 2024 a ficha só concorre a destaque com 4 ou
 *  mais. Menos de 4 não impede o envio, então isto AVISA em vez de reprovar. */
const SHOTS = join(ROOT, 'store/play/screenshots');
for (const lang of ['pt', 'en']) {
  const dir = join(SHOTS, lang);
  if (!existsSync(dir)) {
    fail(`store/play/screenshots/${lang}/ não existe — rode: node scripts/generate-play-screenshots.mjs`);
    continue;
  }
  const pngs = readdirSync(dir).filter((f) => f.endsWith('.png'));
  if (pngs.length < 2) fail(`screenshots/${lang}: ${pngs.length} capturas, o Play exige 2`);
  else {
    for (const f of pngs) {
      const s = pngSize(join(dir, f));
      if (Math.min(s.w, s.h) < 320) fail(`screenshots/${lang}/${f}: ${s.w}x${s.h} — o lado menor tem de ter 320px`);
      if (Math.max(s.w, s.h) > 3840) fail(`screenshots/${lang}/${f}: ${s.w}x${s.h} — o lado maior passa de 3840px`);
    }
    console.log(`  ✓ screenshots/${lang}: ${pngs.length} capturas${pngs.length < 4 ? ' (4+ é o recomendado pelo Play)' : ''}`);
  }
}

if (failures) {
  console.error(`\n${failures} problema(s). A ficha não está pronta para envio.`);
  process.exit(1);
}
console.log('\nFicha pronta para envio.');
