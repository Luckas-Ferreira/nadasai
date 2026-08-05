import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * O HTML que o crawler recebe, medido SEM executar JavaScript.
 *
 * Isto existe porque o defeito que motivou o prerender era invisível de dentro
 * do navegador: com JS ligado, cada rota mostrava título, H1 e canonical
 * corretos — o `SeoService` os escrevia depois do bootstrap. Só que as 72 URLs
 * do sitemap serviam BYTE A BYTE o mesmo arquivo, com um único título genérico,
 * zero `<h1>` e nenhum canonical. O Google anunciava 72 páginas e recebia 72
 * páginas idênticas e vazias, que é exatamente como se produz "Duplicada — o
 * Google escolheu um canônico diferente".
 *
 * Por isso usa `request`, e não `page`: o contexto de requisição do Playwright
 * busca os bytes e não roda script nenhum — é o Googlebot antes do render, o
 * Bing, e os crawlers de IA, que nunca chegam a executar o app.
 *
 * Roda contra o build de produção na :4300, como o 09-offline, porque é o único
 * lugar onde o artefato real existe.
 */
test.use({ baseURL: 'http://localhost:4300' });

/** Uma por módulo, mais os dois idiomas e uma página institucional. */
const ROUTES = [
  { path: '/pt/pdf/juntar', lang: 'pt' },
  { path: '/pt/imagem/cortar', lang: 'pt' },
  { path: '/pt/audio/cortar', lang: 'pt' },
  { path: '/pt/privacidade/censurar-pdf', lang: 'pt' },
  { path: '/en/image/crop', lang: 'en' },
  { path: '/en/pdf/merge', lang: 'en' },
  { path: '/pt/sobre', lang: 'pt' },
];

const titleOf = (html: string): string => html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';

test.describe('O HTML que o crawler recebe', () => {
  test('cada rota nasce com título, canonical, hreflang e H1 próprios', async ({ request }) => {
    const titles = new Map<string, string>();

    for (const route of ROUTES) {
      const response = await request.get(route.path);
      expect(response.status(), `${route.path} não respondeu 200`).toBe(200);

      const html = await response.text();

      const title = titleOf(html);
      expect(title, `${route.path} veio sem <title>`).not.toBe('');
      titles.set(route.path, title);

      // O canonical precisa apontar para a própria URL. Um canonical fixo na
      // home — que é o que o index.html servido para tudo produzia — diz ao
      // Google que toda página é duplicata da home.
      expect(html, `${route.path} sem canonical próprio`).toContain(
        `<link rel="canonical" href="https://nadasai.com${route.path}"`,
      );

      // Conteúdo de verdade, não só <app-root></app-root>.
      expect(html, `${route.path} sem <h1> no HTML cru`).toMatch(/<h1[\s>]/);

      expect(html, `${route.path} sem hreflang`).toContain('hreflang=');
      expect(html, `${route.path} com lang errado no <html>`).toMatch(
        new RegExp(`<html[^>]*lang="${route.lang}`),
      );
    }

    // E o ponto central: os títulos são DIFERENTES entre si. Era esta a falha —
    // um título único repetido em 72 URLs.
    expect(new Set(titles.values()).size, `títulos repetidos: ${[...titles].join(' | ')}`).toBe(
      ROUTES.length,
    );
  });

  /**
   * Nenhuma referência de asset pode ser relativa.
   *
   * O Angular emite `href="chunk-XI2OKYKC.js"` contando com o `<base href="/">`.
   * O parser respeita esse base; o preload scanner — o parser especulativo que o
   * Chrome roda à frente — não. Em produção isso pedia 16 vezes
   * `/pt/imagem/chunk-*.js`, caía no fallback de SPA, recebia 25 KB de HTML com
   * status 200 por requisição e morria no MIME: 389 KB por visita, e a tag cujo
   * propósito é adiantar o download não adiantava nada.
   *
   * A asserção é sobre os BYTES, e não sobre o comportamento, de propósito. O
   * scanner só especula quando o parser fica para trás, o que depende de como o
   * HTML chega pela rede — em produção reproduz sempre, no servidor local nunca.
   * Um teste do comportamento passaria aqui e continuaria quebrado lá.
   */
  test('nenhum asset é referenciado por caminho relativo', async ({ request }) => {
    const offenders: string[] = [];

    for (const route of [...ROUTES, { path: '/' }]) {
      const html = await (await request.get(route.path)).text();
      const relatives = html.match(/\b(?:href|src)="(?:chunk-|main-|polyfills-|styles-)[^"]*/g) ?? [];
      relatives.forEach((r) => offenders.push(`${route.path}: ${r}`));
    }

    expect(offenders, 'assets relativos dependem do <base>, que o preload scanner ignora').toEqual([]);
  });

  /**
   * A raiz é um redirect no router, então o prerender não escreve arquivo para
   * ela e o Angular passa a chamar o shell de `index.csr.html`. Sem o postbuild
   * que o copia de volta, `nadasai.com/` responde 404 — e o fallback de SPA do
   * Cloudflare Pages, que atende as URLs legadas, some junto.
   */
  test('a raiz serve a home PRERENDERIZADA, e não 404 nem shell vazio', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).toContain('<app-root');

    // O shell vazio também tem <app-root>, e era exatamente ele que estava aqui:
    // a raiz media FCP 5132 ms contra 1041 ms em /pt, mesmo conteúdo e mesmos
    // bytes, só porque não havia o que pintar antes do boot + redirect + chunk.
    expect(html, 'a raiz voltou a ser o shell vazio').toMatch(/<h1[\s>]/);
    expect(html, 'a raiz precisa consolidar em /pt').toContain(
      '<link rel="canonical" href="https://nadasai.com/pt"',
    );
  });

  /**
   * O sitemap não pode ser uma lista de redirects.
   *
   * Enquanto o prerender gravava `pt/imagem/cortar/index.html`, o host só servia
   * a forma COM barra e as 72 URLs do sitemap respondiam 308 — e a página de
   * destino declarava como canônica justamente a URL que redirecionava. Para o
   * crawler isso é "Página com redirecionamento", e os hreflang apontavam todos
   * para redirects, que é o que invalida a anotação do cluster inteiro.
   *
   * `maxRedirects: 0` é o ponto do teste: seguir o redirect é exatamente o que
   * escondia o defeito, porque o conteúdo no fim dele sempre esteve correto.
   */
  test('toda URL do sitemap responde 200 sem redirect', async ({ request }) => {
    const xml = readFileSync('public/sitemap.xml', 'utf8');
    const paths = [...xml.matchAll(/<loc>https:\/\/nadasai\.com([^<]*)<\/loc>/g)].map((m) => m[1]);

    expect(paths.length, 'sitemap vazio ou com outra origem').toBeGreaterThan(0);

    const redirecting: string[] = [];
    for (const path of paths) {
      const response = await request.get(path || '/', { maxRedirects: 0 });
      if (response.status() !== 200) redirecting.push(`${path} -> ${response.status()}`);
    }

    expect(redirecting, `URLs do sitemap que não respondem 200`).toEqual([]);
  });

  /**
   * A forma COM barra é a que o Google resolveu e indexou durante o período em
   * que tudo redirecionava. Depois do achatamento ela não casa com arquivo
   * nenhum, então sem as regras de `public/_redirects` cairia no fallback de
   * SPA: 200 servindo o shell vazio, sem canonical e sem H1 — pior do que o
   * redirect que havia antes.
   */
  test('a forma com barra redireciona para a canônica', async ({ request }) => {
    for (const route of ROUTES) {
      const response = await request.get(`${route.path}/`, { maxRedirects: 0 });

      expect(response.status(), `${route.path}/ não redirecionou`).toBe(308);
      expect(response.headers()['location'], `${route.path}/ foi para o lugar errado`).toBe(
        route.path,
      );
    }
  });
});
