// Torna as referências de asset do build ABSOLUTAS no HTML gerado.
//
// O Angular emite `<link rel="modulepreload" href="chunk-XI2OKYKC.js">` e
// `<script src="main-ILHXVOBM.js">` relativos, contando com o `<base href="/">`
// que está no `<head>`. O parser respeita esse base — e o preload scanner, o
// parser ESPECULATIVO que o Chrome roda à frente para começar os downloads
// cedo, não respeita.
//
// Em `/pt/imagem/cortar` isso vira, medido em produção:
//
//     16 requisições para /pt/imagem/chunk-*.js
//     -> não existe -> fallback de SPA -> 25 KB de HTML com status 200
//     -> "Expected a JavaScript-or-Wasm module script but the server responded
//        with a MIME type of text/html"
//     -> 389 KB baixados à toa por visita, e o modulepreload não pré-carrega
//        nada: o parser depois pede os 17 chunks certos na raiz, do zero.
//
// Ou seja, a tag cujo propósito inteiro é adiantar o download fazia o oposto —
// gastava banda e não adiantava nada. Não é erro de configuração do host: o DOM
// resolve certo (`link.href` é `https://nadasai.com/chunk-…`), só a busca
// especulativa é que não. Diagnosticado pelo `initiator.type` no CDP: "other"
// (especulativo) nos 16 errados, "parser" nos 17 certos.
//
// Não reproduz no preview local, e é por isso que passou despercebido: o
// scanner só especula quando o parser fica para trás, o que depende de como o
// HTML chega pela rede — comprimido e em vários pedaços em produção, de uma vez
// no servidor local. Um teste que dependa disso é um teste que mente metade das
// vezes, então a garantia está no `21-prerender.spec.ts`, sobre os BYTES: nenhum
// href de asset pode ser relativo.
//
// Roda no postbuild depois do achatamento (os arquivos já estão no nome final) e
// obrigatoriamente ANTES do `generate-ngsw.mjs` — o manifesto guarda o hash de
// cada arquivo, então reescrever um HTML depois de gerá-lo faria o service
// worker rejeitar o próprio índice. É a mesma armadilha de ordem que deixou o
// app sem funcionar offline.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join('dist', 'imgwork', 'browser');

// Só os prefixos que o `outputHashing` do Angular emite na raiz. Restringir a
// eles é o que impede de sair prefixando caminho de conteúdo — um `src` dentro
// do markup da aplicação não é problema deste script.
const ASSET = /\b(href|src)="(chunk-|main-|polyfills-|styles-)/g;

function htmlFiles(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(path, found);
    else if (entry.name.endsWith('.html')) found.push(path);
  }
  return found;
}

let touched = 0;
let rewritten = 0;

for (const file of htmlFiles(ROOT)) {
  const before = readFileSync(file, 'utf8');
  let count = 0;
  const after = before.replace(ASSET, (_, attr, prefix) => {
    count++;
    return `${attr}="/${prefix}`;
  });

  if (!count) continue;
  writeFileSync(file, after);
  touched++;
  rewritten += count;
}

if (!touched) {
  // O Angular passou a emitir caminhos absolutos, ou os prefixos mudaram. Nos
  // dois casos este script virou ruído e alguém precisa olhar — mas o build
  // continua válido, então é aviso, não falha.
  console.warn('[absolutize-assets] nenhuma referência relativa encontrada. O formato do build mudou?');
} else {
  console.log(`[absolutize-assets] ${rewritten} referências absolutizadas em ${touched} arquivos.`);
}
