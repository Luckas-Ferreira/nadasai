import { MODULES, TOOLS, type ToolDef, moduleById } from '../tools/tools';
import type { TranslationKey } from '../services/translation.service';
import type { FaqEntry } from './tool-content';

/**
 * Builds the schema.org graph for a page, as a PURE function so it can be
 * tested without a router or a DOM.
 *
 * Three defects in what this replaces, all of which the spec now pins:
 *
 *  - A FAQPage node with five hardcoded questions about PDFs was injected on
 *    EVERY url, including the privacy pages that render no FAQ at all. Google's
 *    policy requires FAQ markup to reproduce visible page content; a mismatch is
 *    ignored at best. Here the node is emitted only when `faq` is non-empty,
 *    and the caller fills that from the component that actually rendered.
 *  - The featureList was ten hardcoded strings naming no privacy tool and no
 *    audio tool. It is now derived from TOOLS, so it cannot go stale.
 *  - There was no BreadcrumbList at all.
 */

const DOMAIN = 'https://nadasai.com';

export interface JsonLdContext {
  /** Canonical absolute URL of this page. */
  readonly url: string;
  readonly lang: 'pt' | 'en';
  readonly title: string;
  readonly description: string;
  readonly tool: ToolDef | null;
  readonly isHome: boolean;
  readonly dict: Record<TranslationKey, string>;
  /** Q&A ACTUALLY ON SCREEN. Empty means no FAQPage node. */
  readonly faq: readonly FaqEntry[];
  /** Feature bullets for the per-tool node. */
  readonly features: readonly string[];
}

/** schema.org category per module — one blanket value described none of them. */
const CATEGORY_BY_MODULE: Record<string, string> = {
  image: 'MultimediaApplication',
  audio: 'MultimediaApplication',
  pdf: 'BusinessApplication',
  privacy: 'SecurityApplication',
};

function locale(lang: 'pt' | 'en'): string {
  return lang === 'en' ? 'en-US' : 'pt-BR';
}

function toolUrl(tool: ToolDef, lang: 'pt' | 'en'): string {
  return `${DOMAIN}/${lang}/${lang === 'en' ? tool.pathEn : tool.pathPt}`;
}

function organization(): object {
  return {
    '@type': 'Organization',
    '@id': `${DOMAIN}/#organization`,
    name: 'Nada Sai',
    url: DOMAIN,
    /**
     * Quadrado e raster, que é o que a documentação do Google pede para
     * `Organization.logo` — e o que estava aqui era o SVG de 339x339 declarado
     * como 1200x630, ou seja, a proporção de um card social no campo que espera
     * uma marca. As duas coisas erradas ao mesmo tempo: formato que o crawler
     * não rasteriza e dimensão que não confere com o arquivo.
     */
    logo: {
      '@type': 'ImageObject',
      url: `${DOMAIN}/og/logo-512.png`,
      width: 512,
      height: 512,
    },
  };
}

function website(ctx: JsonLdContext): object {
  return {
    '@type': 'WebSite',
    '@id': `${DOMAIN}/#website`,
    url: DOMAIN,
    name: 'Nada Sai',
    publisher: { '@id': `${DOMAIN}/#organization` },
    inLanguage: locale(ctx.lang),
    // No SearchAction: the command palette navigates in memory, there is no
    // crawlable ?q= results URL, and pointing `target` at one that does not
    // exist is a false claim in the markup.
  };
}

/**
 * Home -> Tool, two levels.
 *
 * NOT three. There is no module hub route, and schema.org requires an `item`
 * URL on every position except the last — a middle level with no URL risks the
 * whole breadcrumb being discarded, and pointing it at the module's first tool
 * would assert a hierarchy that does not exist. The `moduleHref` parameter is
 * here so the middle level becomes one line the day those routes are added.
 */
export function buildBreadcrumb(ctx: JsonLdContext, moduleHref: string | null = null): object {
  const items: object[] = [
    {
      '@type': 'ListItem',
      position: 1,
      name: ctx.lang === 'en' ? 'Home' : 'Início',
      item: `${DOMAIN}/${ctx.lang}`,
    },
  ];

  if (ctx.tool && moduleHref) {
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: ctx.dict[moduleById(ctx.tool.category).nameKey],
      item: moduleHref,
    });
  }

  if (ctx.tool) {
    items.push({
      '@type': 'ListItem',
      position: items.length + 1,
      name: ctx.dict[ctx.tool.titleKey],
      item: ctx.url,
    });
  }

  return {
    '@type': 'BreadcrumbList',
    '@id': `${ctx.url}#breadcrumb`,
    itemListElement: items,
  };
}

function globalApplication(ctx: JsonLdContext): object {
  return {
    '@type': 'SoftwareApplication',
    '@id': `${DOMAIN}/#application`,
    name: 'Nada Sai',
    url: DOMAIN,
    operatingSystem: 'Any (browser-based)',
    applicationCategory: ['UtilitiesApplication', 'MultimediaApplication', 'SecurityApplication'],
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    publisher: { '@id': `${DOMAIN}/#organization` },
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: ctx.description,
    // Derived, and therefore structurally incapable of omitting a module the
    // way the hardcoded list did.
    featureList: TOOLS.map((t) => ctx.dict[t.navKey]),
    // No aggregateRating and no review: there are no real ratings, and
    // fabricated review markup is the most common cause of a structured-data
    // manual action. Do not add them.
  };
}

function toolApplication(ctx: JsonLdContext, tool: ToolDef): object {
  const node: Record<string, unknown> = {
    '@type': 'SoftwareApplication',
    '@id': `${ctx.url}#tool`,
    name: ctx.dict[tool.titleKey],
    url: ctx.url,
    description: ctx.description,
    applicationCategory: CATEGORY_BY_MODULE[tool.category] ?? 'UtilitiesApplication',
    applicationSuite: 'Nada Sai',
    operatingSystem: 'Any (browser-based)',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    isPartOf: { '@id': `${DOMAIN}/#application` },
    publisher: { '@id': `${DOMAIN}/#organization` },
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
  if (ctx.features.length > 0) node['featureList'] = [...ctx.features];
  return node;
}

/** Honest only on the home page, which visibly lists every tool. */
function toolItemList(ctx: JsonLdContext): object {
  return {
    '@type': 'ItemList',
    '@id': `${ctx.url}#tools`,
    numberOfItems: TOOLS.length,
    itemListElement: TOOLS.map((tool, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: ctx.dict[tool.navKey],
      url: toolUrl(tool, ctx.lang),
    })),
  };
}

function faqPage(ctx: JsonLdContext): object {
  return {
    '@type': 'FAQPage',
    '@id': `${ctx.url}#faq`,
    mainEntity: ctx.faq.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

export function buildGraph(ctx: JsonLdContext, moduleHref: string | null = null): object {
  const graph: object[] = [
    organization(),
    website(ctx),
    {
      '@type': 'WebPage',
      '@id': `${ctx.url}#webpage`,
      url: ctx.url,
      name: ctx.title,
      description: ctx.description,
      isPartOf: { '@id': `${DOMAIN}/#website` },
      inLanguage: locale(ctx.lang),
      breadcrumb: { '@id': `${ctx.url}#breadcrumb` },
    },
    buildBreadcrumb(ctx, moduleHref),
  ];

  if (ctx.isHome) {
    graph.push(globalApplication(ctx), toolItemList(ctx));
  } else if (ctx.tool) {
    graph.push(toolApplication(ctx, ctx.tool));
  }

  // Emitted if and only if a FAQ is visible on this page.
  if (ctx.faq.length > 0) graph.push(faqPage(ctx));

  return { '@context': 'https://schema.org', '@graph': graph };
}

/** Exposed for the spec; MODULES is otherwise only read through the dict. */
export const MODULE_IDS = MODULES.map((m) => m.id);
