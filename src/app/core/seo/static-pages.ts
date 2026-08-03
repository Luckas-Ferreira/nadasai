/**
 * Every URL that is not a tool.
 *
 * Its own file, with no imports, for one reason: `scripts/generate-sitemap.mjs`
 * loads this and `tools.ts` directly from Node to build the sitemap, and a
 * module that imports Angular (or anything else) cannot be read that way.
 * route-map.ts imports it from here, so the two cannot drift.
 *
 * `privacidade` here is the POLICY page, not the privacy tool module.
 */
export interface StaticPage {
  readonly pt: string;
  readonly en: string;
  /** Sitemap priority. The home page leads; the legal pages trail. */
  readonly priority: number;
}

export const STATIC_PAGES: readonly StaticPage[] = [
  { pt: '', en: '', priority: 1.0 },
  { pt: 'faq', en: 'faq', priority: 0.7 },
  { pt: 'sobre', en: 'about', priority: 0.6 },
  { pt: 'privacidade', en: 'privacy', priority: 0.5 },
  { pt: 'termos', en: 'terms', priority: 0.5 },
];
