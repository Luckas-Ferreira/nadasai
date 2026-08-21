import { FORMAT_PAIRS, pairById, pairFromUrl } from './format-pairs';
import { TOOLS } from '../tools/tools';
import { alternatesFor, cleanPathOf } from './route-map';
import { routes } from '../../app.routes';
import type { Route } from '@angular/router';

const LANGS = ['pt', 'en'] as const;

function childrenOf(prefix: string): readonly Route[] {
  return routes.find((r) => r.path === prefix)?.children ?? [];
}

const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * As páginas de par de formato são cauda longa PROGRAMÁTICA, e a palavra
 * perigosa dessa expressão é a segunda: gerar URLs é fácil, e gerar URLs com o
 * mesmo texto dentro é fabricar portas de entrada, que o Google trata como tal.
 *
 * Este spec trava as duas coisas que apodrecem sozinhas — a mecânica (rota,
 * hreflang, unicidade) e o piso de conteúdo. É o mesmo par de obrigações que
 * `tool-article.spec.ts` já impõe às ferramentas, pelo mesmo motivo.
 */
describe('FORMAT_PAIRS', () => {
  it('aponta cada par para uma ferramenta que existe', () => {
    for (const pair of FORMAT_PAIRS) {
      expect(TOOLS.some((t) => t.id === pair.tool))
        .withContext(`${pair.id} aponta para "${pair.tool}"`)
        .toBe(true);
    }
  });

  it('não repete id nem caminho', () => {
    const ids = FORMAT_PAIRS.map((p) => p.id);
    expect(new Set(ids).size).withContext(`ids: ${ids.join(', ')}`).toBe(ids.length);

    const paths = FORMAT_PAIRS.flatMap((p) => [p.pathPt, p.pathEn]);
    expect(new Set(paths).size).withContext(`caminhos: ${paths.join(', ')}`).toBe(paths.length);
  });

  /**
   * Um caminho de par que termine igual ao de uma ferramenta faria
   * `toolFromUrl` casar a ferramenta errada — a busca dele é por sufixo, para
   * atravessar os redirects legados.
   */
  it('nenhum caminho de par colide com o de uma ferramenta', () => {
    const toolPaths = TOOLS.flatMap((t) => [t.pathPt, t.pathEn]);

    for (const pair of FORMAT_PAIRS) {
      for (const path of [pair.pathPt, pair.pathEn]) {
        expect(toolPaths).withContext(`${pair.id}: ${path}`).not.toContain(path);
      }
    }
  });

  it('registra as duas rotas, com título e descrição próprios', () => {
    for (const lang of LANGS) {
      const children = childrenOf(lang);

      for (const pair of FORMAT_PAIRS) {
        const path = lang === 'pt' ? pair.pathPt : pair.pathEn;
        const route = children.find((r) => r.path === path);

        expect(route).withContext(`${lang}/${path} sem rota`).toBeDefined();
        expect(route?.title).withContext(`${lang}/${path} sem título`).toBe(pair[lang].title);
        expect(route?.data?.['pairId']).withContext(`${lang}/${path} sem pairId`).toBe(pair.id);
        expect(route?.data?.['metaDescription'])
          .withContext(`${lang}/${path} sem descrição`)
          .toBe(pair[lang].description);
      }
    }
  });

  /**
   * Um título repetido é a falha que o prerender já teve uma vez, em 72 URLs de
   * uma vez só. Aqui ela custaria mais: doze páginas que só existem para casar
   * com buscas diferentes, todas anunciando a mesma coisa.
   */
  it('dá título e descrição únicos a cada URL', () => {
    for (const lang of LANGS) {
      const titles = FORMAT_PAIRS.map((p) => p[lang].title);
      expect(new Set(titles).size).withContext(`títulos ${lang}`).toBe(titles.length);

      const descriptions = FORMAT_PAIRS.map((p) => p[lang].description);
      expect(new Set(descriptions).size).withContext(`descrições ${lang}`).toBe(descriptions.length);

      const h1s = FORMAT_PAIRS.map((p) => p[lang].h1);
      expect(new Set(h1s).size).withContext(`h1 ${lang}`).toBe(h1s.length);
    }
  });

  it('entra no mapa de hreflang, nos dois sentidos', () => {
    for (const pair of FORMAT_PAIRS) {
      const fromPt = alternatesFor(cleanPathOf(`/pt/${pair.pathPt}`));
      const fromEn = alternatesFor(cleanPathOf(`/en/${pair.pathEn}`));

      expect(fromPt).withContext(`${pair.id} sem alternates em pt`).not.toBeNull();
      // O MESMO objeto sob as duas grafias — é o que torna a reciprocidade
      // estrutural em vez de uma coincidência entre dois literais.
      expect(fromPt).withContext(`${pair.id}: pt e en apontam para pares diferentes`).toBe(fromEn);
      expect(fromPt?.pt).toBe(`/pt/${pair.pathPt}`);
      expect(fromPt?.en).toBe(`/en/${pair.pathEn}`);
    }
  });

  it('resolve o par a partir de qualquer uma das duas URLs', () => {
    for (const pair of FORMAT_PAIRS) {
      expect(pairFromUrl(`/pt/${pair.pathPt}`)).toBe(pair);
      expect(pairFromUrl(`/en/${pair.pathEn}`)).toBe(pair);
      expect(pairById(pair.id)).toBe(pair);
    }

    expect(pairFromUrl('/pt/imagem/converter')).toBeNull();
    expect(pairById('nao-existe')).toBeNull();
  });

  describe('conteúdo', () => {
    it('tem as duas línguas com a mesma forma', () => {
      for (const pair of FORMAT_PAIRS) {
        expect(pair.en.sections.length)
          .withContext(`${pair.id}: contagem de seções`)
          .toBe(pair.pt.sections.length);
        expect(pair.en.faq.length).withContext(`${pair.id}: contagem de perguntas`).toBe(
          pair.pt.faq.length,
        );
      }
    });

    it('traz pelo menos duas seções e três perguntas por língua', () => {
      for (const pair of FORMAT_PAIRS) {
        for (const lang of LANGS) {
          expect(pair[lang].sections.length).withContext(`${pair.id}/${lang}`).toBeGreaterThanOrEqual(2);
          expect(pair[lang].faq.length).withContext(`${pair.id}/${lang}`).toBeGreaterThanOrEqual(3);
        }
      }
    });

    /**
     * O piso existe para que "programática" não vire "vazia". 200 palavras é
     * pouco para um artigo e é muito para um texto de encher — é onde a conta
     * só fecha escrevendo algo que vale para ESTE par.
     */
    it('tem pelo menos 200 palavras de texto próprio por língua', () => {
      for (const pair of FORMAT_PAIRS) {
        for (const lang of LANGS) {
          const c = pair[lang];
          const words =
            wordCount(c.sub) +
            c.sections.reduce((n, s) => n + wordCount(s.h) + s.p.reduce((m, p) => m + wordCount(p), 0), 0) +
            c.faq.reduce((n, f) => n + wordCount(f.q) + wordCount(f.a), 0);

          expect(words).withContext(`${pair.id}/${lang} tem ${words} palavras`).toBeGreaterThanOrEqual(200);
        }
      }
    });

    /**
     * As duas línguas dentro de 25% uma da outra. O FAQ das ferramentas já
     * chegou a ter o inglês ~20% mais curto em TODAS as entradas, e é o tipo de
     * decadência que ninguém vê olhando uma página de cada vez.
     */
    it('não deixa uma língua encolher em relação à outra', () => {
      for (const pair of FORMAT_PAIRS) {
        const size = (lang: 'pt' | 'en'): number =>
          pair[lang].faq.reduce((n, f) => n + wordCount(f.a), 0);

        const pt = size('pt');
        const en = size('en');
        const ratio = Math.min(pt, en) / Math.max(pt, en);

        expect(ratio).withContext(`${pair.id}: pt=${pt} en=${en}`).toBeGreaterThan(0.75);
      }
    });

    /**
     * O par existe para casar com uma busca. Se o h1 não nomeia os dois
     * formatos, a página não responde à busca que a justifica.
     */
    it('nomeia os dois formatos no h1', () => {
      for (const pair of FORMAT_PAIRS) {
        const [from, to] = pair.id.split('-to-');

        for (const lang of LANGS) {
          const h1 = pair[lang].h1.toLowerCase().replace(/\s/g, '');
          expect(h1).withContext(`${pair.id}/${lang}: h1 sem "${from}"`).toContain(from);
          expect(h1).withContext(`${pair.id}/${lang}: h1 sem "${to}"`).toContain(to);
        }
      }
    });
  });
});
