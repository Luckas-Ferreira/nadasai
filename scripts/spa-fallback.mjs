// Restaura o index.html da RAIZ depois da geração estática.
//
// Com prerender, o Angular escreve um arquivo por rota (`pt/pdf/juntar/index.html`
// e assim por diante) e passa a chamar o shell de `index.csr.html` — "client-side
// rendering". A raiz `/` não ganha arquivo nenhum, porque a rota `''` é um
// redirect para `/pt` e redirect não gera página.
//
// Isso quebra duas coisas no Cloudflare Pages, e nenhuma delas aparece em teste
// unitário:
//
//   1. `https://nadasai.com/` passa a responder 404 — a porta de entrada que as
//      pessoas digitam.
//   2. O fallback de SPA some junto. O Pages serve o `index.html` da raiz para
//      caminhos que não casam com arquivo algum, e é dele que dependem as URLs
//      legadas que `app.routes.ts` redireciona no cliente.
//
// Copiar o shell de volta para `index.html` devolve exatamente o comportamento
// que existia antes do prerender nesses dois casos, sem tocar em nenhuma das 73
// páginas geradas — arquivo estático tem precedência, então cada rota real
// continua servindo o HTML próprio dela, com título e canonical próprios.

import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = join('dist', 'imgwork', 'browser');
const shell = join(dir, 'index.csr.html');
const fallback = join(dir, 'index.html');

if (!existsSync(dir)) {
  // Nada a fazer: `npm run build` não chegou a produzir saída.
  process.exit(0);
}

if (!existsSync(shell)) {
  // Sem shell e sem fallback é falha de verdade; sem shell mas COM fallback
  // significa que o prerender está desligado e o Angular já escreveu o
  // index.html normal.
  if (existsSync(fallback)) process.exit(0);
  console.error(
    `[spa-fallback] não encontrei ${shell} nem ${fallback}. ` +
      `O build mudou de formato — a raiz do site vai responder 404.`,
  );
  process.exit(1);
}

copyFileSync(shell, fallback);
console.log('[spa-fallback] index.csr.html -> index.html (raiz e fallback do SPA)');
