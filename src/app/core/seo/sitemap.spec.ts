import { TOOLS } from '../tools/tools';

/**
 * `public/sitemap.xml` is now GENERATED, by scripts/generate-sitemap.mjs on
 * prebuild, from this same TOOLS array. This spec is what still runs in a watch
 * loop, where no build has happened: it catches the case where a tool was added
 * and the generator was never run, so the committed file is stale.
 *
 * The Karma target serves `public/` as assets, so the file can just be fetched.
 */
describe('sitemap.xml', () => {
  let xml: string;

  beforeAll(async () => {
    xml = await (await fetch('/sitemap.xml')).text();
  });

  it('lists every tool in both languages', () => {
    for (const tool of TOOLS) {
      expect(xml)
        .withContext(`missing pt URL for ${tool.id}`)
        .toContain(`<loc>https://nadasai.com/pt/${tool.pathPt}</loc>`);
      expect(xml)
        .withContext(`missing en URL for ${tool.id}`)
        .toContain(`<loc>https://nadasai.com/en/${tool.pathEn}</loc>`);
    }
  });

  it('gives every tool URL a reciprocal alternate pair', () => {
    // A one-way hreflang makes Google discard the annotation for the whole
    // cluster, so a half-added entry is worse than a missing one.
    for (const tool of TOOLS) {
      expect(xml).toContain(`hreflang="pt" href="https://nadasai.com/pt/${tool.pathPt}"`);
      expect(xml).toContain(`hreflang="en" href="https://nadasai.com/en/${tool.pathEn}"`);
    }
  });

  it('has no duplicate <loc> entries', () => {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
  });
});
