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
   * A raiz é um redirect no router, então o prerender não escreve arquivo para
   * ela e o Angular passa a chamar o shell de `index.csr.html`. Sem o postbuild
   * que o copia de volta, `nadasai.com/` responde 404 — e o fallback de SPA do
   * Cloudflare Pages, que atende as URLs legadas, some junto.
   */
  test('a raiz continua servindo o shell, e não 404', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('<app-root');
  });
});
