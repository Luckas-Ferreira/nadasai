// Aponta o preload de fonte para os arquivos com hash, em todas as páginas.
//
// O `src/index.html` declara `media/nunito-latin-400-normal.woff2`, que é o nome
// que o `ng serve` usa. No build, o Angular emite `media/nunito-latin-400-normal-STXQN3YV.woff2`
// — hash de conteúdo no nome. Um preload apontando para o nome sem hash não é um
// preload quebrado de forma barulhenta: o navegador busca, toma 404, avisa no
// console e segue baixando a fonte certa depois do CSS. Ou seja, custa um round
// trip e não entrega nenhum, que é o pior dos dois mundos.
//
// Por que derivado e não uma lista: o hash muda a cada mudança na fonte, e
// qualquer nome escrito à mão apodrece no primeiro deploy — em silêncio, que é o
// modo de falha que os outros scripts deste diretório também existem para
// evitar.
//
// Quais pesos: 400 e 600. O 400 carrega o corpo de texto de toda página; o 600 é
// o de todo heading e de todo rótulo de botão, e o `<h1>` costuma ser o elemento
// do LCP. 500 e 700 aparecem pouco acima da dobra e não pagam a banda que
// tirariam do resto — preload demais é o mesmo que preload nenhum, porque
// compete com o que estava na frente.
//
// Roda DEPOIS do `absolutize-assets.mjs` (as tags saem com `/` na frente, pelo
// mesmo motivo dos outros: o preload scanner não aplica o `<base>`) e ANTES do
// `generate-ngsw.mjs`, porque o manifesto guarda o hash de cada HTML.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join('dist', 'nadasai', 'browser');
const MEDIA = join(ROOT, 'media');
// Os TRÊS pesos que o design system define — `--font-weight-*: initial` apaga a
// escala do Tailwind e só normal/medium/semibold voltam, então não existe quarto
// peso para chegar atrasado e refluir a página. Preloadar todos custa ~48 kB e
// fecha a categoria inteira de CLS por fonte, em vez de empurrá-la para o peso
// que ficou de fora: com 400 e 600 pré-carregados, quem refluía era o 500
// (`font-medium`, 136 usos) e o 700 do `<strong>`.
const WEIGHTS = ['400', '500', '600'];

let files;
try {
  files = readdirSync(MEDIA);
} catch {
  console.warn('[preload-fonts] sem diretório media/ — nada a fazer.');
  process.exit(0);
}

// `nunito-latin-400-normal-<HASH>.woff2` — o `latin` exato, nunca `latin-ext`:
// o `-ext` só cobre acentuação rara e não vale um preload.
const hashed = WEIGHTS.map((w) => {
  const re = new RegExp(`^nunito-latin-${w}-normal-[A-Z0-9]+\\.woff2$`);
  return files.find((f) => re.test(f));
}).filter(Boolean);

if (hashed.length !== WEIGHTS.length) {
  console.warn(
    `[preload-fonts] achei ${hashed.length} de ${WEIGHTS.length} fontes esperadas. ` +
      'O nome de saída do @fontsource mudou? Seguindo sem preload.',
  );
  process.exit(0);
}

const tags = hashed
  .map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/media/${f}">`)
  .join('');

function htmlFiles(dir, found = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) htmlFiles(path, found);
    else if (e.name.endsWith('.html')) found.push(path);
  }
  return found;
}

let touched = 0;

for (const file of htmlFiles(ROOT)) {
  let html = readFileSync(file, 'utf8');

  // Tira o que veio do src/index.html (sem hash, e portanto 404) e qualquer
  // execução anterior deste script, para o passo ser idempotente.
  const cleaned = html.replace(/<link rel="preload" as="font"[^>]*>/g, '');

  // Antes da primeira folha de estilo: a fonte precisa estar em voo junto com o
  // CSS, não depois dele. Se não houver <link rel=stylesheet>, cai no </head>.
  const anchor = cleaned.includes('<link rel="stylesheet"') ? '<link rel="stylesheet"' : '</head>';
  if (!cleaned.includes(anchor)) continue;

  html = cleaned.replace(anchor, tags + anchor);
  writeFileSync(file, html);
  touched++;
}

console.log(`[preload-fonts] ${hashed.length} fontes pré-carregadas em ${touched} páginas.`);
