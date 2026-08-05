// Completa os `modulepreload` que faltam para os imports diretos do main.
//
// O Angular emite uma tag por chunk que a rota vai precisar, e esquece
// exatamente uma: o chunk de helpers do esbuild (`__esm`, `__toESM`,
// `__commonJS`), que o `main-*.js` importa estaticamente e que praticamente
// todos os outros chunks importam também.
//
// O efeito é uma corrente serializada de dois níveis logo na abertura, e é a
// única que o PageSpeed ainda apontava depois do prerender da raiz:
//
//     documento (249 ms) -> main-ILHXVOBM.js (388 ms) -> chunk-C3GRVDOV.js (482 ms)
//
// São 1878 bytes custando um round trip inteiro, porque o navegador só descobre
// que precisa deles depois de baixar e parsear o main. Os outros oito imports
// diretos do main vêm com preload e chegam em paralelo; esse não.
//
// A regra aqui é derivada, nunca uma lista fixa: lê os imports estáticos do
// próprio `main-*.js` e garante que cada um tenha a tag. Os nomes carregam hash
// de conteúdo e mudam a cada build, então qualquer coisa escrita à mão
// apodreceria no primeiro deploy — e apodreceria em silêncio, que é o modo de
// falha que este arquivo existe para evitar.
//
// Roda depois do `absolutize-assets.mjs` (as tags saem já com `/` na frente, pelo
// mesmo motivo que as outras: o preload scanner não aplica o `<base>`) e antes do
// `generate-ngsw.mjs`, porque o manifesto guarda o hash de cada HTML.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join('dist', 'imgwork', 'browser');

const entry = readdirSync(ROOT).find((f) => /^main-[A-Z0-9]+\.js$/.test(f));
if (!entry) {
  console.warn('[preload-entry-chunks] não achei o main-*.js. O formato do build mudou?');
  process.exit(0);
}

// `from"./chunk-X.js"` e `import"./chunk-X.js"` — o segundo é import só por
// efeito colateral, que o esbuild emite e que conta igual para a corrente.
const imports = [
  ...new Set(
    [...readFileSync(join(ROOT, entry), 'utf8').matchAll(/(?:from|import)"\.\/(chunk-[A-Z0-9]+\.js)"/g)].map(
      (m) => m[1],
    ),
  ),
];

function htmlFiles(dir, found = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) htmlFiles(path, found);
    else if (e.name.endsWith('.html')) found.push(path);
  }
  return found;
}

let touched = 0;
let added = 0;

for (const file of htmlFiles(ROOT)) {
  const html = readFileSync(file, 'utf8');

  const missing = imports.filter((c) => !html.includes(`rel="modulepreload" href="/${c}"`));
  if (!missing.length) continue;

  const tags = missing.map((c) => `<link rel="modulepreload" href="/${c}">`).join('');

  // Antes do primeiro preload que já existe, para chegar tão cedo quanto ele.
  // Se a página não tem bloco nenhum, antes do próprio script de entrada.
  const anchor = html.includes('<link rel="modulepreload"')
    ? '<link rel="modulepreload"'
    : `<script src="/${entry}"`;

  if (!html.includes(anchor)) continue;

  writeFileSync(file, html.replace(anchor, tags + anchor));
  touched++;
  added += missing.length;
}

if (!touched) {
  console.log('[preload-entry-chunks] nada a fazer: todo import direto do main já tem preload.');
} else {
  console.log(`[preload-entry-chunks] ${added} tags adicionadas em ${touched} arquivos (${imports.length} imports diretos).`);
}
