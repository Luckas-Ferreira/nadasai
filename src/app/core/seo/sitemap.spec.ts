import { TOOLS } from '../tools/tools';

/**
 * `public/sitemap.xml` is hand-maintained — there is no generator — so it is
 * the one place a new tool can go missing without anything failing. The Karma
 * target serves `public/` as assets, so the file can just be fetched.
 *
 * This is the cheap half of the fix. The durable half is a build-time generator
 * driven by the same TOOLS array; until that exists, this at least turns the
 * omission into a red test instead of a URL Google never hears about.
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
