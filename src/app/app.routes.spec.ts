import type { Route } from '@angular/router';
import { routes } from './app.routes';
import { TOOLS } from './core/tools/tools';

/**
 * Registering a tool touches five files and none of the links between them is
 * a compile error. This spec closes the two that are pure convention: that both
 * localized routes exist, and that each carries the metadata SeoService reads.
 *
 * It is written against the exported literal rather than a running router, so
 * it costs nothing and cannot be defeated by a redirect.
 */

/** Flattens the pt/en language groups into `pt/imagem/cortar`-style paths. */
function collectPaths(entries: readonly Route[], prefix = ''): string[] {
  const out: string[] = [];
  for (const route of entries) {
    const path = route.path ?? '';
    const full = prefix ? `${prefix}/${path}` : path;
    if (route.children?.length) out.push(...collectPaths(route.children, full));
    else if (!route.redirectTo) out.push(full);
  }
  return out;
}

function findRoute(entries: readonly Route[], target: string, prefix = ''): Route | null {
  for (const route of entries) {
    const path = route.path ?? '';
    const full = prefix ? `${prefix}/${path}` : path;
    if (route.children?.length) {
      const hit = findRoute(route.children, target, full);
      if (hit) return hit;
    } else if (!route.redirectTo && full === target) {
      return route;
    }
  }
  return null;
}

describe('app routes', () => {
  const paths = collectPaths(routes);

  it('has a route for every tool in BOTH languages', () => {
    for (const tool of TOOLS) {
      expect(paths).withContext(`missing pt route for ${tool.id}`).toContain(`pt/${tool.pathPt}`);
      expect(paths).withContext(`missing en route for ${tool.id}`).toContain(`en/${tool.pathEn}`);
    }
  });

  it('gives every tool route a title and a meta description', () => {
    // These are what SeoService puts in <title> and <meta name="description">.
    // A route without them silently inherits the generic sitewide copy.
    for (const tool of TOOLS) {
      for (const path of [`pt/${tool.pathPt}`, `en/${tool.pathEn}`]) {
        const route = findRoute(routes, path);
        expect(route).withContext(path).not.toBeNull();
        expect(route!.title).withContext(`${path} title`).toBeTruthy();
        expect(route!.data?.['metaDescription']).withContext(`${path} description`).toBeTruthy();
      }
    }
  });

  it('declares no duplicate paths', () => {
    const seen = new Map<string, number>();
    for (const path of paths) seen.set(path, (seen.get(path) ?? 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });
});
