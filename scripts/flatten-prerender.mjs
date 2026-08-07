// Achata `rota/index.html` em `rota.html` depois do prerender.
//
// O Angular grava uma pasta por rota — `pt/imagem/cortar/index.html` — e um host
// estático só serve isso com barra no fim. O Cloudflare Pages então respondia
// **308** em TODAS as 72 URLs do sitemap:
//
//     /pt/imagem/cortar  ->  308  ->  /pt/imagem/cortar/
//
// E a página servida em `/pt/imagem/cortar/` declarava
// `<link rel="canonical" href="…/pt/imagem/cortar">` — a URL que acabara de
// redirecionar. O crawler via, então: URL do sitemap redireciona, chega no
// destino, e o canônico do destino aponta de volta para o redirect. Isso vira
// "Página com redirecionamento" / "o Google escolheu um canônico diferente", e
// os 216 hreflang do site apontavam todos para redirects — o modo de falha que
// invalida a anotação do cluster inteiro, o mesmo que route-map.ts existe para
// evitar.
//
// A correção NÃO é reescrever as URLs. É que a forma canônica do próprio
// Cloudflare Pages já é a sem barra e sem extensão — dá para medir no site:
//
//     /index.csr        ->  200
//     /index.csr.html   ->  308  ->  /index.csr
//
// Ou seja: com `pt/imagem/cortar.html` em disco, `/pt/imagem/cortar` responde
// 200 direto. E essa é exatamente a forma que o sitemap, o `SeoService`, o
// `route-map` e todo `routerLink` já emitem, e a que já está indexada e linkada
// de fora. Achatar corrige os 308 sem tocar em uma única URL.
//
// Roda no postbuild ANTES do spa-fallback: aqui a raiz ainda não tem
// `index.html` (o Angular chama o shell de `index.csr.html`), e é o spa-fallback
// que o copia depois. A raiz é pulada explicitamente mesmo assim — ela é o
// fallback de SPA, não uma rota, e achatá-la mataria as URLs legadas.

import { readdirSync, renameSync, rmdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join('dist', 'nadasai', 'browser');

if (!existsSync(ROOT)) {
  // Nada a fazer: `ng build` não chegou a produzir saída.
  process.exit(0);
}

/** Toda pasta que contém um `index.html`, das mais profundas para as mais rasas. */
function collect(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) collect(join(dir, entry.name), found);
  }

  // Depois da recursão, para que uma pasta só seja avaliada quando as filhas já
  // foram achatadas — é o que permite remover a pasta vazia no mesmo passo.
  if (dir !== ROOT && existsSync(join(dir, 'index.html'))) found.push(dir);
  return found;
}

let moved = 0;

for (const dir of collect(ROOT)) {
  const target = `${dir}.html`;

  if (existsSync(target)) {
    // `rota.html` e `rota/index.html` ao mesmo tempo deixa qual dos dois é
    // servido a critério do host. Falhar é melhor do que publicar o empate.
    console.error(`[flatten-prerender] conflito: ${relative(ROOT, target)} já existe.`);
    process.exit(1);
  }

  renameSync(join(dir, 'index.html'), target);
  moved++;

  // Só se ficou vazia: `pt/` continua existindo por causa de `pt/imagem/…`, e
  // rmdir em pasta com conteúdo lança em vez de apagar por engano.
  try {
    rmdirSync(dir);
  } catch {
    /* ainda tem sub-rotas dentro — esperado. */
  }
}

console.log(`[flatten-prerender] ${moved} rotas achatadas (rota/index.html -> rota.html)`);
