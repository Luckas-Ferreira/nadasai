// Gera os cards de compartilhamento (og:image) em public/og/, um por ferramenta
// por língua, mais o card padrão e o logo quadrado da Organization.
//
// POR QUE ISTO EXISTE
//
// O `og:image` apontava para `logo_nadasai.svg`. Nenhum crawler social renderiza
// SVG — nem Facebook, nem X, nem LinkedIn, nem WhatsApp, nem Slack, nem Discord,
// nem Telegram. Todos aceitam a tag, nenhum desenha a imagem. Então cada uma das
// 74 URLs compartilhada em qualquer lugar aparecia sem imagem, e o
// `twitter:card: summary_large_image` — que EXIGE imagem grande — degradava para
// nada. Pior: as tags declaravam `og:image:width=1200` / `height=630` e o arquivo
// é 339x339, então a única informação que o crawler tinha era falsa.
//
// POR QUE PLAYWRIGHT, E POR QUE FORA DO BUILD
//
// Desenhar texto em PNG sem um rasterizador de fonte é o problema difícil aqui —
// o encoder PNG à mão de `e2e/fixtures/generate.ts` resolve bytes, não tipografia.
// O Chromium já está no repositório como devDependency e compõe a Nunito real,
// com o kerning real, nos tokens reais do `styles.css`. É o rasterizador mais
// fiel disponível e não custa dependência nova.
//
// Mas ele NÃO roda no `prebuild`: o Cloudflare Pages faz `npm ci && npm run
// build`, e baixar um Chromium ali seria minutos de build e uma forma nova de
// quebrar o deploy. Os PNGs são COMMITADOS, como `favicon.png` já é, e este
// script é manual (`npm run og`). Se ele nunca mais rodar, nada quebra: os
// arquivos continuam no lugar. O que muda é que um tool novo herda o card
// padrão até alguém rodar de novo — degradação, não falha.
//
// SAÍDA EM public/og/ E NÃO NA RAIZ, de propósito: o grupo `assets` do
// `ngsw-config.json` lista `/*.png`, que casa só com a raiz. Um card por
// ferramenta na raiz entraria no prefetch do service worker e somaria ~2 MB à
// primeira visita — para imagens que só um crawler vai buscar.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'og');
const WIDTH = 1200;
const HEIGHT = 630;

/** Lê um literal de objeto do fonte TS sem carregar o Angular junto.
 *
 * `translation.service.ts` importa `@angular/core` e usa decorator, então o
 * `transpileModule` que `generate-sitemap.mjs` usa não serve aqui — ele deixaria
 * referências de runtime que este processo não tem. Os dicionários são literais
 * planos de string, então recortar o bloco e avaliar é suficiente e é estável:
 * se o formato mudar, isto lança em vez de gerar card errado em silêncio. */
function objectLiteral(source, name) {
  const start = source.indexOf(`const ${name}`);
  if (start < 0) throw new Error(`[og] não achei "const ${name}" — o formato do dicionário mudou?`);
  const open = source.indexOf('{', start);
  const end = source.indexOf('\n}', open);
  return (0, eval)(`(${source.slice(open, end + 2)})`);
}

const i18nSource = readFileSync(join(ROOT, 'src/app/core/services/translation.service.ts'), 'utf8');
const DICT = { en: objectLiteral(i18nSource, 'EN'), pt: objectLiteral(i18nSource, 'PT') };

/** TOOLS e MODULES saem do fonte por regex de campo, e não por eval: o array tem
 *  tipos (`readonly ToolDef[]`, `satisfies`) que não sobrevivem a um eval cru. */
function parseTools(source) {
  // Normaliza CRLF antes de qualquer coisa: o repositório é editado no Windows e
  // um `\r` invisível fazia o split não casar e o parser devolver zero.
  const body = source.replace(/\r\n/g, '\n').slice(source.replace(/\r\n/g, '\n').indexOf('export const TOOLS'));
  const tools = [];
  for (const block of body.split(/\n  \{\n/).slice(1)) {
    const field = (n) => (block.match(new RegExp(`${n}: '([^']*)'`)) ?? [])[1];
    const id = field('id');
    if (!id) continue;
    tools.push({
      id,
      pathPt: field('pathPt'),
      pathEn: field('pathEn'),
      category: field('category'),
      navKey: field('navKey'),
      titleKey: field('titleKey'),
      descKey: field('descKey'),
      tone: field('tone'),
    });
    if (block.includes('] as const') || block.includes('];')) break;
  }
  return tools;
}

const toolsSource = readFileSync(join(ROOT, 'src/app/core/tools/tools.ts'), 'utf8');
const TOOLS = parseTools(toolsSource);
if (TOOLS.length < 30) throw new Error(`[og] só ${TOOLS.length} ferramentas lidas — o parser quebrou.`);

/** Os pares tom->cor vivem em styles.css. Ler de lá em vez de repetir aqui é o
 *  que impede o card de divergir da página que ele anuncia. */
const stylesSource = readFileSync(join(ROOT, 'src/styles.css'), 'utf8');
function tone(name) {
  const fg = (stylesSource.match(new RegExp(`--tone-${name}-fg:\\s*([^;]+);`)) ?? [])[1];
  const bg = (stylesSource.match(new RegExp(`--tone-${name}-bg:\\s*([^;]+);`)) ?? [])[1];
  return { fg: (fg ?? '#1e3a8a').trim(), bg: (bg ?? '#e0e7ff').trim() };
}

const LOGO = readFileSync(join(ROOT, 'public/logo_nadasai.svg'), 'utf8');
const LOGO_DATA = `data:image/svg+xml;base64,${Buffer.from(LOGO, 'utf8').toString('base64')}`;

const FONT_FILES = ['400', '600', '700'].map((w) => ({
  weight: w,
  data: readFileSync(join(ROOT, `node_modules/@fontsource/nunito/files/nunito-latin-${w}-normal.woff2`)).toString(
    'base64',
  ),
}));

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** O card. Um layout só, parametrizado — dois layouts divergem no primeiro
 *  ajuste e ninguém percebe até ver os dois lado a lado num feed. */
function cardHtml({ title, subtitle, badge, toneName, showLogo = true }) {
  const t = tone(toneName);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONT_FILES.map(
  (f) => `@font-face{font-family:Nunito;font-style:normal;font-weight:${f.weight};font-display:block;
src:url(data:font/woff2;base64,${f.data}) format('woff2')}`,
).join('\n')}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${WIDTH}px;height:${HEIGHT}px;font-family:Nunito,Arial,sans-serif;
  background:#fff;color:#0f172a;display:flex;flex-direction:column;justify-content:space-between;
  padding:72px 80px;position:relative;overflow:hidden}
/* A faixa de tom identifica o módulo sem precisar escrever o nome dele. */
body::before{content:'';position:absolute;left:0;top:0;bottom:0;width:16px;background:${t.fg}}
body::after{content:'';position:absolute;right:-160px;top:-160px;width:520px;height:520px;
  border-radius:50%;background:${t.bg};opacity:.55}
.top{display:flex;align-items:center;gap:16px;position:relative;z-index:1}
.top img{width:52px;height:52px}
.brand{font-size:34px;font-weight:700;letter-spacing:-.02em}
.mid{position:relative;z-index:1}
.badge{display:inline-flex;align-items:center;gap:10px;background:${t.bg};color:${t.fg};
  font-size:22px;font-weight:600;padding:10px 20px;border-radius:999px;margin-bottom:24px}
h1{font-size:76px;font-weight:700;line-height:1.05;letter-spacing:-.03em;
  /* 2 linhas no máximo: a 3ª some sob o rodapé e o card sai cortado. */
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
p{font-size:30px;line-height:1.35;color:#475569;margin-top:22px;max-width:940px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.foot{display:flex;align-items:center;gap:14px;font-size:24px;font-weight:600;color:#475569;
  position:relative;z-index:1}
.dot{width:12px;height:12px;border-radius:50%;background:#10b981}
</style></head><body>
<div class="top">${showLogo ? `<img src="${LOGO_DATA}" alt="">` : ''}<span class="brand">Nada Sai</span></div>
<div class="mid">
  ${badge ? `<div class="badge">${escapeHtml(badge)}</div>` : ''}
  <h1>${escapeHtml(title)}</h1>
  ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
</div>
<div class="foot"><span class="dot"></span><span>nadasai.com</span></div>
</body></html>`;
}

/** O logo da Organization no JSON-LD. Quadrado e raster, que é o que a
 *  documentação do Google pede — o SVG de 339x339 estava declarado 1200x630. */
function logoHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}body{width:512px;height:512px;background:#fff;display:flex;
align-items:center;justify-content:center}img{width:512px;height:512px}
</style></head><body><img src="${LOGO_DATA}" alt=""></body></html>`;
}

const { chromium } = await import('@playwright/test').catch(() => {
  console.error('[og] @playwright/test não encontrado. Rode: npm i && npx playwright install chromium');
  process.exit(1);
});

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });

let written = 0;
async function shoot(html, file, size) {
  if (size) await page.setViewportSize(size);
  await page.setContent(html, { waitUntil: 'load' });
  // `font-display: block` + esta espera: sem ela o screenshot sai com a fonte
  // de fallback e o card inteiro perde a identidade tipográfica.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, file), type: 'png' });
  written++;
}

// 1. Card padrão por língua — é o que serve home, /sobre, /faq, /termos e o
//    fallback de SPA.
for (const lang of ['pt', 'en']) {
  await shoot(
    cardHtml({
      title: DICT[lang]['hero.title'],
      subtitle: DICT[lang]['hero.badge'],
      badge: null,
      toneName: 'sky',
    }),
    `default-${lang}.png`,
    { width: WIDTH, height: HEIGHT },
  );
}

// 2. Um card por ferramenta por língua.
const MODULE_KEY = { image: 'module.image', pdf: 'module.pdf', audio: 'module.audio', privacy: 'module.privacy' };
for (const tool of TOOLS) {
  for (const lang of ['pt', 'en']) {
    const d = DICT[lang];
    await shoot(
      cardHtml({
        title: d[tool.navKey] ?? tool.id,
        subtitle: d[tool.descKey] ?? '',
        badge: d[MODULE_KEY[tool.category]] ?? tool.category,
        toneName: tool.tone,
      }),
      `${tool.id}-${lang}.png`,
      { width: WIDTH, height: HEIGHT },
    );
  }
}

// 3. Logo quadrado para Organization.logo.
await shoot(logoHtml(), 'logo-512.png', { width: 512, height: 512 });

/**
 * 4. Ícones do PWA, na RAIZ de public/ e não em og/.
 *
 * O manifesto declarava um único ícone SVG com `sizes: "any"`. O Chrome no
 * Android exige ao menos um PNG de 192 e um de 512 para considerar o app
 * instalável — com só SVG, o prompt de instalação simplesmente não aparece, e
 * não há erro em lugar nenhum que diga isso.
 *
 * O `maskable` é um arquivo separado, e não o mesmo com outro `purpose`: o
 * sistema operacional RECORTA um maskable na forma dele (círculo, squircle,
 * gota), então o desenho precisa caber na zona segura de 80%. Declarar o ícone
 * normal como maskable é o erro que corta as bordas do logo em metade dos
 * aparelhos Android.
 *
 * Na raiz porque o grupo `assets` do `ngsw-config.json` casa `/*.png` — é o que
 * os deixa disponíveis offline, que é justamente quando o ícone importa.
 */
async function shootTo(html, path, size) {
  await page.setViewportSize(size);
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, type: 'png' });
  written++;
}

/** `scale` < 1 deixa a margem que o recorte do sistema pode comer. */
function iconHtml(px, scale = 1) {
  const inner = Math.round(px * scale);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}body{width:${px}px;height:${px}px;background:#fff;display:flex;
align-items:center;justify-content:center}img{width:${inner}px;height:${inner}px}
</style></head><body><img src="${LOGO_DATA}" alt=""></body></html>`;
}

const PUBLIC = join(ROOT, 'public');
await shootTo(iconHtml(192), join(PUBLIC, 'icon-192.png'), { width: 192, height: 192 });
await shootTo(iconHtml(512), join(PUBLIC, 'icon-512.png'), { width: 512, height: 512 });
await shootTo(iconHtml(512, 0.6), join(PUBLIC, 'icon-maskable-512.png'), { width: 512, height: 512 });

await browser.close();

console.log(`[og] ${written} imagens escritas em public/og/ (${TOOLS.length} ferramentas x 2 línguas + 2 padrão + logo).`);
