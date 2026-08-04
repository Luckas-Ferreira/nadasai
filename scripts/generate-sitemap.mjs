import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';

/**
 * Writes public/sitemap.xml from the same TOOLS array the app routes off.
 *
 * The file used to be maintained by hand, which made it the one place a new
 * tool could go missing with nothing failing — the same class of bug that had
 * the hreflang map missing 7 of 28 tools. sitemap.spec.ts turned the omission
 * into a red test; this removes the step that was being forgotten.
 *
 * Runs on prebuild, alongside the two asset fetchers. It is deterministic:
 * same TOOLS in, same bytes out, so it never shows up as noise in a diff.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://nadasai.com';

/**
 * The eight tools the sitemap leads with. Not a quality ranking — priority is a
 * hint about crawl order within one site, and these are the entry points people
 * actually search for.
 */
const FEATURED = new Set([
  'remove-bg',
  'edit-pdf',
  'merge-pdf',
  'compress-pdf',
  'cut-audio',
  'merge-audio',
  'convert-audio',
  'compress-audio',
]);

/**
 * The date of the last commit that touched the site, as YYYY-MM-DD.
 *
 * `<lastmod>` was the one field this file did not emit, and it is the only one
 * of the three the Google actually reads — `changefreq` and `priority` have been
 * publicly ignored since 2023. Without it the sitemap carried no signal that it
 * had changed at all, so a re-submit in Search Console re-showed the previous
 * processing instead of re-fetching: after the privacy module shipped, GSC kept
 * reporting the 66 URLs of the build before it.
 *
 * Derived from git rather than from `new Date()` on purpose. The generator runs
 * on every prebuild and its determinism is the reason it never shows up as noise
 * in a diff (see the header above); a wall-clock date would rewrite all 72
 * entries on every build and, worse, would claim a change that did not happen.
 * Google discards lastmod it finds inconsistent, which is the same as omitting
 * it — but with the extra churn.
 *
 * Returns null when git is unavailable, and the field is then left out entirely.
 * An absent lastmod is documented behaviour; an invented one is a lie the
 * crawler learns to distrust across the whole file.
 */
function lastCommitDate() {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'src', 'public'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    // Sem git (tarball, clone raso sem histórico) — seguir sem o campo.
    return null;
  }
}

/**
 * Loads a TypeScript module from Node without a loader hook.
 *
 * `transpileModule` compiles one file with no type information, so it cannot
 * tell a type-only import from a value one and leaves every import in place.
 * The two modules read here use their imports for types alone, so the imports
 * are stripped rather than resolved — which is also why they must stay free of
 * runtime dependencies.
 */
async function loadTsModule(relativePath) {
  const source = readFileSync(join(ROOT, relativePath), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });

  const withoutImports = outputText.replace(/^\s*import[^;]*;$/gm, '');
  return import(`data:text/javascript;base64,${Buffer.from(withoutImports, 'utf8').toString('base64')}`);
}

function urlEntry({ loc, pt, en, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${loc}</loc>`,
    `    <xhtml:link rel="alternate" hreflang="pt" href="${pt}" />`,
    `    <xhtml:link rel="alternate" hreflang="en" href="${en}" />`,
    // x-default points at Portuguese: it is the primary market, and a
    // self-referential x-default per language would be two claims about the
    // same cluster.
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${pt}" />`,
    ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority.toFixed(1)}</priority>`,
    '  </url>',
  ].join('\n');
}

/**
 * Both halves of a PT/EN pair, which is what makes the hreflang reciprocal.
 *
 * Every URL is the extension-less, slash-less form, and that is not cosmetic:
 * it is the form Cloudflare Pages serves 200 for once the build is flattened
 * (`scripts/flatten-prerender.mjs`), the form the canonical and the hreflang
 * declare, and the form every routerLink emits. A sitemap listing a URL that
 * 308s is a sitemap of redirects, which is what this was.
 */
function pair({ ptPath, enPath, lastmod, changefreq, priority, comment }) {
  const pt = ptPath ? `${ORIGIN}/pt/${ptPath}` : `${ORIGIN}/pt`;
  const en = enPath ? `${ORIGIN}/en/${enPath}` : `${ORIGIN}/en`;

  return [
    comment ? `\n  <!-- ${comment} -->` : '',
    urlEntry({ loc: pt, pt, en, lastmod, changefreq, priority }),
    urlEntry({ loc: en, pt, en, lastmod, changefreq, priority }),
  ]
    .filter(Boolean)
    .join('\n');
}

async function main() {
  const { TOOLS } = await loadTsModule('src/app/core/tools/tools.ts');
  const { STATIC_PAGES } = await loadTsModule('src/app/core/seo/static-pages.ts');

  const lastmod = lastCommitDate();

  const blocks = [
    ...STATIC_PAGES.map((page) =>
      pair({
        ptPath: page.pt,
        enPath: page.en,
        lastmod,
        changefreq: page.pt === '' ? 'weekly' : 'monthly',
        priority: page.priority,
        comment: page.pt === '' ? 'Home' : page.en,
      }),
    ),
    ...TOOLS.map((tool) =>
      pair({
        ptPath: tool.pathPt,
        enPath: tool.pathEn,
        lastmod,
        changefreq: 'monthly',
        priority: FEATURED.has(tool.id) ? 0.9 : 0.8,
        comment: tool.id,
      }),
    ),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Generated by scripts/generate-sitemap.mjs from core/tools/tools.ts. Do not edit by hand. -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...blocks,
    '',
    '</urlset>',
    '',
  ].join('\n');

  const target = join(ROOT, 'public', 'sitemap.xml');
  const previous = (() => {
    try {
      return readFileSync(target, 'utf8');
    } catch {
      return '';
    }
  })();

  if (previous === xml) {
    console.log(`sitemap.xml is up to date (${STATIC_PAGES.length * 2 + TOOLS.length * 2} URLs).`);
    return;
  }

  writeFileSync(target, xml);
  console.log(`sitemap.xml written: ${STATIC_PAGES.length * 2 + TOOLS.length * 2} URLs.`);
}

await main();
