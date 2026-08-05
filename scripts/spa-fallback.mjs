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
// que existia antes do prerender nesses dois casos, sem tocar em nenhuma das 72
// páginas geradas — arquivo estático tem precedência, então cada rota real
// continua servindo o HTML próprio dela, com título e canonical próprios.
//
// Roda DEPOIS de `flatten-prerender.mjs`, e a ordem importa nos dois sentidos:
// aquele script precisa da raiz ainda sem `index.html` para não achatar o
// fallback, e este precisa que o achatamento já tenha acontecido para que o
// fallback seja o último recurso, e não o que atende as rotas reais.

// O que se copia é a HOME PRERENDERIZADA, não o shell vazio, e a diferença é a
// maior de todo o site.
//
// Medido no ar, em 4G lento com CPU 4x:
//
//     https://nadasai.com/     FCP 5132 ms   (shell: zero conteúdo no HTML)
//     https://nadasai.com/pt   FCP 1041 ms   (prerenderizada)
//
// Mesmos 250 KB, mesmas 22 requisições. A raiz era 5x mais lenta porque não
// tinha o que pintar: era preciso bootar o Angular, deixar o router resolver o
// redirect de `''` para `pt`, e só então baixar o chunk da home — os quatro
// níveis de corrente que o PageSpeed reclama. E a raiz é justamente a URL que
// as pessoas digitam, que os links de fora apontam e que o PSI testa.
//
// Servir `pt.html` ali resolve sem redirect e sem RTT extra: o HTML já traz o
// H1, o texto e os `modulepreload` da rota, e o markup que o router vai
// renderizar depois do boot é o MESMO, então não há troca visível de tela. Um
// redirect de borda seria a alternativa óbvia, e não funciona aqui: no Cloudflare
// Pages um arquivo existente tem precedência sobre `_redirects`, e existe um
// arquivo em `/`.
//
// Duas consequências que valem ser ditas em voz alta:
//
//   * `/` passa a declarar `canonical` para `/pt` — que é o correto, e é o que
//     o `x-default` do site já dizia;
//   * o fallback de SPA passa a servir a home no lugar do shell. Toda URL que
//     não casa com arquivo (as legadas que `app.routes.ts` redireciona, e os
//     erros de digitação) devolve a home com 200 e canonical para `/pt`, em vez
//     de um shell sem canonical nenhum. Para o crawler isso é melhor, não pior:
//     consolida em `/pt` em vez de deixar 200 vazios soltos.
//
// Não há hidratação neste app (não existe `provideClientHydration`), então o
// Angular descarta o markup do servidor e re-renderiza. É o que permite que o
// mesmo arquivo sirva de fallback para uma rota qualquer sem erro de mismatch.

import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = join('dist', 'imgwork', 'browser');
const home = join(dir, 'pt.html');
const shell = join(dir, 'index.csr.html');
const fallback = join(dir, 'index.html');

if (!existsSync(dir)) {
  // Nada a fazer: `npm run build` não chegou a produzir saída.
  process.exit(0);
}

// O shell continua sendo a rede de segurança: se o prerender da home falhar, um
// site que boota no cliente é muito melhor do que uma raiz em 404.
const source = existsSync(home) ? home : shell;

if (!existsSync(source)) {
  // Sem fonte e sem fallback é falha de verdade; sem fonte mas COM fallback
  // significa que o prerender está desligado e o Angular já escreveu o
  // index.html normal.
  if (existsSync(fallback)) process.exit(0);
  console.error(
    `[spa-fallback] não encontrei ${home}, ${shell} nem ${fallback}. ` +
      `O build mudou de formato — a raiz do site vai responder 404.`,
  );
  process.exit(1);
}

copyFileSync(source, fallback);

if (source === home) {
  console.log('[spa-fallback] pt.html -> index.html (raiz prerenderizada + fallback do SPA)');
} else {
  console.warn('[spa-fallback] pt.html não existe; caí no shell vazio. A raiz vai ficar lenta.');
}
