// Pré-carrega o chunk do dicionário DESTA página, e só dele.
//
// Os dois dicionários viravam um único chunk dentro do `translation.service.ts`
// — 123 kB brutos / 43,8 kB gz que todo visitante baixava, metade num idioma
// que ele nunca ia ler. Separá-los em `core/i18n/{en,pt}.ts` carregados por
// `import()` corta isso pela metade, mas cria uma corrente serializada no lugar:
// o navegador só descobre que precisa do dicionário depois de baixar e parsear
// o `main-*.js`, e o inicializador de `app.config.ts` segura o bootstrap até ele
// chegar. Sem este script, o split trocaria bytes por um round trip inteiro na
// frente do primeiro pixel — que é o pior negócio possível numa página cujo LCP
// já estava em 915 ms.
//
// Como o idioma de cada arquivo gerado é conhecido em tempo de build (a rota é
// `/en/...` ou `/pt/...`), a tag certa vai em cada página e a errada não vai em
// nenhuma. É o único lugar do build em que essa informação existe de graça.
//
// O chunk é identificado pelo CONTEÚDO e nunca por uma lista fixa: os nomes
// carregam hash e mudam a cada build. Se a marca não for achada, o script avisa
// e sai sem escrever — perder o preload é uma regressão de latência, escrever a
// tag errada é um 404 em toda página.
//
// Roda depois do `absolutize-assets.mjs` (as tags saem com `/` na frente: o
// preload scanner não aplica o `<base>`) e antes do `generate-ngsw.mjs`, que
// guarda o hash de cada HTML.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join('dist', 'nadasai', 'browser');

/**
 * Uma chave que só o dicionário tem — sem aspas em volta de propósito, porque o
 * esbuild reescreve o literal com aspas duplas e um padrão com aspas simples
 * não casa nada. É a diferença entre este script funcionar e ele avisar que não
 * achou os chunks, que foi o que aconteceu na primeira tentativa.
 */
const KEY_MARK = 'common.upload_btn';

/** Distingue os dois pelo VALOR, já que a chave é a mesma nos dois arquivos. */
const VALUES = {
  pt: 'Escolher arquivo',
  en: 'Choose file',
};

const chunks = {};
for (const file of readdirSync(ROOT).filter((f) => f.endsWith('.js'))) {
  const body = readFileSync(join(ROOT, file), 'utf8');
  for (const lang of ['pt', 'en']) {
    if (body.includes(VALUES[lang]) && body.includes(KEY_MARK)) {
      if (chunks[lang]) {
        console.warn(`[preload-dictionary] mais de um chunk parece o dicionário ${lang}; não vou adivinhar.`);
        process.exit(0);
      }
      chunks[lang] = file;
    }
  }
}

if (!chunks.pt || !chunks.en) {
  console.warn(
    `[preload-dictionary] não achei os dois chunks (pt=${chunks.pt ?? '?'}, en=${chunks.en ?? '?'}). ` +
      'O dicionário mudou de forma? Saindo sem escrever.',
  );
  process.exit(0);
}

function htmlFiles(dir, found = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) htmlFiles(path, found);
    else if (e.name.endsWith('.html')) found.push(path);
  }
  return found;
}

/**
 * O idioma sai do caminho do arquivo gerado, que é o espelho da rota depois do
 * achatamento: `en/image/crop.html`, `pt/imagem/cortar.html`, `en.html`. Tudo
 * que não começa por `en` é português — inclusive `index.html`, que é o
 * fallback de SPA e é servido para qualquer URL sem arquivo.
 */
function languageOf(file) {
  const parts = relative(ROOT, file).split(sep);
  return parts[0] === 'en' || parts[0] === 'en.html' ? 'en' : 'pt';
}

let touched = 0;

for (const file of htmlFiles(ROOT)) {
  const html = readFileSync(file, 'utf8');
  const chunk = chunks[languageOf(file)];

  if (html.includes(`rel="modulepreload" href="/${chunk}"`)) continue;

  const anchor = html.includes('<link rel="modulepreload"')
    ? '<link rel="modulepreload"'
    : '<script src="/main-';

  if (!html.includes(anchor)) continue;

  writeFileSync(file, html.replace(anchor, `<link rel="modulepreload" href="/${chunk}">${anchor}`));
  touched++;
}

console.log(
  `[preload-dictionary] ${touched} páginas pré-carregam o próprio dicionário (pt=${chunks.pt}, en=${chunks.en}).`,
);
