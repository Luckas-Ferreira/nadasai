import { TOOLS } from '../tools/tools';
import { STATIC_PAGES } from './static-pages';

/**
 * The PT/EN URL pair for every route, DERIVED from TOOLS rather than listed.
 *
 * The hand-written map this replaces was missing 7 of the 28 tools — all six
 * privacy tools and compress-audio — a 25% failure rate on a five-step manual
 * checklist that CLAUDE.md itself flags as "a silent bug, not a compile error".
 * The checklist WAS the mitigation, and it did not work.
 *
 * The failure mode was worse than the omission. With no entry, SeoService fell
 * back to reusing the current path under the other prefix, so
 * /pt/privacidade/remover-exif advertised
 * hreflang="en" → /en/privacidade/remover-exif — a URL that does not exist and
 * redirects to /pt. Non-reciprocal hreflang makes Google discard the annotation
 * for the WHOLE cluster, so the 21 correct tools were at risk too.
 *
 * Deriving deletes step 3 of the registration checklist outright: a new tool
 * cannot be missing from here, because there is no "here" to add it to.
 */

export interface LangPair {
  readonly pt: string;
  readonly en: string;
}

function build(): ReadonlyMap<string, LangPair> {
  const map = new Map<string, LangPair>();

  const add = (pt: string, en: string): void => {
    // ONE object registered under BOTH spellings. Two literals could drift out
    // of step with each other; a shared reference cannot, and route-map.spec
    // asserts the identity to prove reciprocity structurally.
    const pair: LangPair = {
      pt: pt ? `/pt/${pt}` : '/pt',
      en: en ? `/en/${en}` : '/en',
    };
    map.set(pt, pair);
    map.set(en, pair);
  };

  for (const page of STATIC_PAGES) add(page.pt, page.en);
  for (const tool of TOOLS) add(tool.pathPt, tool.pathEn);

  return map;
}

const ROUTE_MAPPINGS = build();

/**
 * `null` means "no alternate exists" — and the caller must then emit NOTHING
 * rather than guessing. A path that is not in here is only reachable through
 * the `**` wildcard, which redirects, so silence is the correct answer.
 */
export function alternatesFor(cleanPath: string): LangPair | null {
  return ROUTE_MAPPINGS.get(cleanPath) ?? null;
}

/** Strips the language prefix and any trailing slash from a router URL. */
export function cleanPathOf(url: string): string {
  return url.split(/[?#]/)[0].replace(/^\/(pt|en)\/?/, '').replace(/\/+$/, '');
}
