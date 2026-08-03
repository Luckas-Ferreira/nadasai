import { TOOLS, toolById } from '../tools/tools';
import type { TranslationKey } from '../services/translation.service';
import { buildGraph, type JsonLdContext } from './jsonld';
import { TOOL_CONTENT, toolsWithContent } from './tool-content';

/** A dictionary stub: every key maps to itself, so nodes stay inspectable. */
const dict = new Proxy({} as Record<TranslationKey, string>, {
  get: (_t, key) => String(key),
});

function ctx(overrides: Partial<JsonLdContext> = {}): JsonLdContext {
  return {
    url: 'https://nadasai.com/pt/privacidade/remover-exif',
    lang: 'pt',
    title: 'Título',
    description: 'Descrição',
    tool: toolById('remove-exif'),
    isHome: false,
    dict,
    faq: [],
    features: [],
    ...overrides,
  };
}

function nodes(graph: object): Record<string, unknown>[] {
  return (graph as { '@graph': Record<string, unknown>[] })['@graph'];
}

function typesIn(graph: object): string[] {
  return nodes(graph).map((n) => String(n['@type']));
}

describe('buildGraph', () => {
  it('always emits Organization, WebSite, WebPage and BreadcrumbList', () => {
    const types = typesIn(buildGraph(ctx()));
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
    expect(types).toContain('WebPage');
    expect(types).toContain('BreadcrumbList');
  });

  describe('FAQPage', () => {
    it('is NOT emitted when no FAQ is visible', () => {
      // The defect this replaces: five hardcoded questions about PDFs were
      // injected on all 72 URLs, including pages that render no FAQ at all.
      expect(typesIn(buildGraph(ctx({ faq: [] })))).not.toContain('FAQPage');
    });

    it('is emitted, with exactly the visible questions, when one is', () => {
      const faq = [{ q: 'Pergunta?', a: 'Resposta.' }];
      const graph = buildGraph(ctx({ faq }));
      const node = nodes(graph).find((n) => n['@type'] === 'FAQPage')!;

      expect(node).toBeDefined();
      const entities = node['mainEntity'] as Record<string, unknown>[];
      expect(entities.length).toBe(1);
      expect(entities[0]['name']).toBe('Pergunta?');
    });
  });

  describe('featureList', () => {
    it('is derived from TOOLS on the home page, so no module can be omitted', () => {
      const graph = buildGraph(ctx({ isHome: true, tool: null, url: 'https://nadasai.com/pt' }));
      const app = nodes(graph).find((n) => n['@id'] === 'https://nadasai.com/#application')!;
      const features = app['featureList'] as string[];

      expect(features.length).toBe(TOOLS.length);
      // The hardcoded list named no privacy tool and no audio tool.
      expect(features).toContain('nav.remove_exif');
      expect(features).toContain('nav.compress_audio');
    });

    it('only appears on the home page', () => {
      const graph = buildGraph(ctx());
      expect(nodes(graph).some((n) => n['@id'] === 'https://nadasai.com/#application')).toBe(false);
    });
  });

  describe('per-tool application node', () => {
    it('is emitted on a tool page with a stable @id', () => {
      const graph = buildGraph(ctx());
      const node = nodes(graph).find((n) => String(n['@id']).endsWith('#tool'))!;
      expect(node['@type']).toBe('SoftwareApplication');
      expect(node['name']).toBe('exif.title');
    });

    it('maps the module onto a schema.org category', () => {
      const privacy = nodes(buildGraph(ctx())).find((n) => String(n['@id']).endsWith('#tool'))!;
      expect(privacy['applicationCategory']).toBe('SecurityApplication');

      const pdf = nodes(buildGraph(ctx({ tool: toolById('merge-pdf') })))
        .find((n) => String(n['@id']).endsWith('#tool'))!;
      expect(pdf['applicationCategory']).toBe('BusinessApplication');

      const image = nodes(buildGraph(ctx({ tool: toolById('crop') })))
        .find((n) => String(n['@id']).endsWith('#tool'))!;
      expect(image['applicationCategory']).toBe('MultimediaApplication');
    });

    it('omits featureList when there is nothing to list', () => {
      const node = nodes(buildGraph(ctx())).find((n) => String(n['@id']).endsWith('#tool'))!;
      expect(node['featureList']).toBeUndefined();
    });
  });

  describe('breadcrumb', () => {
    it('ends at the current URL', () => {
      const node = nodes(buildGraph(ctx())).find((n) => n['@type'] === 'BreadcrumbList')!;
      const items = node['itemListElement'] as Record<string, unknown>[];
      expect(items[items.length - 1]['item']).toBe(ctx().url);
    });

    it('is two levels while there is no module hub route', () => {
      // Three levels would need a real middle URL. Emitting a position with no
      // `item`, or pointing it at the module's first tool, risks the whole
      // breadcrumb being discarded or asserting a hierarchy that is not real.
      const node = nodes(buildGraph(ctx())).find((n) => n['@type'] === 'BreadcrumbList')!;
      expect((node['itemListElement'] as unknown[]).length).toBe(2);
    });

    it('grows a middle level the moment a module href is supplied', () => {
      const node = nodes(buildGraph(ctx(), 'https://nadasai.com/pt/privacidade'))
        .find((n) => n['@type'] === 'BreadcrumbList')!;
      const items = node['itemListElement'] as Record<string, unknown>[];
      expect(items.length).toBe(3);
      expect(items[1]['name']).toBe('module.privacy');
      expect(items[2]['position']).toBe(3);
    });

    it('is home-only on the home page', () => {
      const node = nodes(buildGraph(ctx({ isHome: true, tool: null })))
        .find((n) => n['@type'] === 'BreadcrumbList')!;
      expect((node['itemListElement'] as unknown[]).length).toBe(1);
    });
  });

  describe('claims that must NOT be made', () => {
    it('declares no SearchAction — there is no crawlable search URL', () => {
      const site = nodes(buildGraph(ctx())).find((n) => n['@type'] === 'WebSite')!;
      expect(site['potentialAction']).toBeUndefined();
    });

    it('declares no ratings or reviews', () => {
      // Fabricated review markup is the most common cause of a manual action,
      // and it is the first thing anyone is tempted to add here.
      const json = JSON.stringify(buildGraph(ctx({ isHome: true, tool: null })));
      expect(json).not.toContain('aggregateRating');
      expect(json).not.toContain('"review"');
    });
  });

  it('gives every node a unique @id', () => {
    const ids = nodes(buildGraph(ctx({ isHome: true, tool: null })))
      .map((n) => n['@id'])
      .filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sets the locale from the language', () => {
    const pt = nodes(buildGraph(ctx())).find((n) => n['@type'] === 'WebPage')!;
    expect(pt['inLanguage']).toBe('pt-BR');

    const en = nodes(buildGraph(ctx({ lang: 'en' }))).find((n) => n['@type'] === 'WebPage')!;
    expect(en['inLanguage']).toBe('en-US');
  });
});

describe('TOOL_CONTENT', () => {
  it('has both languages, with matching question counts', () => {
    for (const id of toolsWithContent()) {
      const content = TOOL_CONTENT[id]!;
      expect(content.pt).withContext(`${id} pt`).toBeDefined();
      expect(content.en).withContext(`${id} en`).toBeDefined();
      expect(content.pt.faq.length).withContext(`${id} question count`).toBe(content.en.faq.length);
      expect(content.pt.faq.length).withContext(`${id} has questions`).toBeGreaterThan(0);
    }
  });

  it('has no empty question or answer', () => {
    for (const id of toolsWithContent()) {
      for (const lang of ['pt', 'en'] as const) {
        for (const entry of TOOL_CONTENT[id]![lang].faq) {
          expect(entry.q.trim().length).withContext(`${id}/${lang}`).toBeGreaterThan(0);
          expect(entry.a.trim().length).withContext(`${id}/${lang}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('only names tools that exist', () => {
    const known = new Set(TOOLS.map((t) => t.id));
    for (const id of toolsWithContent()) expect(known.has(id)).withContext(id).toBe(true);
  });

  it('covers the whole privacy module', () => {
    // Coverage elsewhere is still partial and those tools fall back to the
    // generic set; this pins the module the content was written for.
    const privacy = TOOLS.filter((t) => t.category === 'privacy').map((t) => t.id);
    const covered = new Set(toolsWithContent());
    const missing = privacy.filter((id) => !covered.has(id));
    expect(missing).toEqual([]);
  });
});
