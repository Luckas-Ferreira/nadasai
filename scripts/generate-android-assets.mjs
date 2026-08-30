// Gera os ícones, a tela de abertura e os gráficos de loja do app Android, a
// partir de `public/logo_nadasai.svg` — a mesma fonte de verdade que o
// `generate-og-cards.mjs` usa para os cards sociais e para os ícones do PWA.
//
// POR QUE ISTO EXISTE
//
// O `npx cap add android` escreve os ícones DE EXEMPLO do Capacitor (um "X"
// azul num quadrado com grade) e uma splash com o mesmo desenho, e nada no
// build reclama disso: o APK compila, instala e roda com a marca de outro
// produto na gaveta de aplicativos. O Play Console, por sua vez, RECUSA o
// envio sem ícone de 512 e sem gráfico de destaque — mas só na hora do envio,
// depois de o AAB estar pronto. Os dois defeitos são silenciosos até tarde
// demais, e é isso que este script fecha.
//
// POR QUE CHROMIUM, E POR QUE FORA DO BUILD
//
// Mesmo argumento do `generate-og-cards.mjs`: o Chromium já é devDependency,
// compõe a Nunito real nos tokens reais do `styles.css`, e é o único
// rasterizador de SVG+texto que este repositório tem sem instalar nada. E os
// PNGs são COMMITADOS — o `gradlew` não pode depender de baixar um navegador,
// e o Cloudflare Pages muito menos. Se este script nunca mais rodar, nada
// quebra: os arquivos continuam no lugar.
//
// A GEOMETRIA DO ÍCONE ADAPTATIVO É A PARTE QUE NÃO PERDOA
//
// O ícone adaptativo do Android tem TRÊS medidas, não uma: a tela é 108dp, a
// máscara do sistema mostra 72dp e a zona segura é 66dp. O que passa de 66dp
// pode ser cortado por um launcher que use círculo, squircle ou gota — e o
// corte só aparece no aparelho de outra pessoa. Por isso a marca é encaixada
// por ALTURA em `SAFE`, e não esticada para preencher a tela.
//
// SAÍDA
//
//   android/app/src/main/res/mipmap-*/ic_launcher_foreground.png  (adaptativo)
//   android/app/src/main/res/mipmap-*/ic_launcher.png             (legado, API<26)
//   android/app/src/main/res/mipmap-*/ic_launcher_round.png       (legado redondo)
//   android/app/src/main/res/drawable*/splash.png                 (abertura)
//   store/play/icon-512.png                                       (Play Console)
//   store/play/feature-graphic-{pt,en}.png                        (Play Console)

import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(ROOT, 'android/app/src/main/res');
const PLAY = join(ROOT, 'store/play');

/* ---------------------------------------------------------------- a marca -- */

const LOGO_SVG = readFileSync(join(ROOT, 'public/logo_nadasai.svg'), 'utf8');

/** A marca SEM o fundo, e recortada na própria caixa.
 *
 *  O arquivo original abre com dois `<rect>` de 339x339 (um #1E1E1E que o
 *  branco cobre em seguida) e sobra padding em volta do desenho. Para o
 *  ícone adaptativo isso é fatal duas vezes: o fundo branco chapado apagaria
 *  a camada de fundo do adaptativo — que é quem responde pelo paralaxe do
 *  launcher — e o padding embutido faria a marca encolher DENTRO da zona
 *  segura, ficando pequena na gaveta sem que nada explique por quê.
 *
 *  A caixa (46,22)-(290.5,319) é a união dos desenhos: os dois retângulos
 *  arredondados vão de x=46 a x=290.5 e de y=22 a y=319; o círculo, com
 *  metade do traço de 14, fica em 71..259 x 101..275, ou seja, dentro. */
const MARK_BOX = { x: 46, y: 22, w: 244.5, h: 297 };

const MARK_SVG = LOGO_SVG.replace(/<rect width="339" height="339"[^>]*\/>/g, '').replace(
  /viewBox="0 0 339 339"/,
  `viewBox="${MARK_BOX.x} ${MARK_BOX.y} ${MARK_BOX.w} ${MARK_BOX.h}"`,
);

if (MARK_SVG.includes('<rect')) throw new Error('[android] os rects de fundo não saíram — o logo mudou?');
if (!MARK_SVG.includes(`${MARK_BOX.w}`)) throw new Error('[android] o viewBox não foi trocado — o logo mudou?');

const MARK = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG, 'utf8').toString('base64')}`;

/* ------------------------------------------------------------ tipografia -- */

const FONTS = ['400', '600', '700'].map((weight) => ({
  weight,
  data: readFileSync(join(ROOT, `node_modules/@fontsource/nunito/files/nunito-latin-${weight}-normal.woff2`)).toString(
    'base64',
  ),
}));

const FACES = FONTS.map(
  (f) => `@font-face{font-family:Nunito;font-style:normal;font-weight:${f.weight};font-display:block;
src:url(data:font/woff2;base64,${f.data}) format('woff2')}`,
).join('\n');

/** Os tokens saem do `styles.css`, e não de hex repetido aqui: é o que impede
 *  o gráfico da loja de divergir da tela que ele anuncia. */
const STYLES = readFileSync(join(ROOT, 'src/styles.css'), 'utf8');
const token = (name, fallback) => (STYLES.match(new RegExp(`--${name}:\\s*([^;]+);`)) ?? [, fallback])[1].trim();

const INK = token('text', '#0f172a');
const MUTED = token('muted', '#475569');
const BASE = token('base', '#e9edf3');

/* -------------------------------------------------------------- páginas --- */

const page = (px, py, body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
${FACES}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${px}px;height:${py}px;font-family:Nunito,Arial,sans-serif}
${extra}
</style></head><body>${body}</body></html>`;

/** A camada de FRENTE do ícone adaptativo: fundo transparente, marca centrada
 *  e encaixada por altura na zona segura de 66/108. */
const SAFE = 66 / 108;
const foregroundHtml = (px) =>
  page(
    px,
    px,
    `<img src="${MARK}" alt="">`,
    `body{background:transparent;display:flex;align-items:center;justify-content:center}
     img{height:${Math.round(px * SAFE)}px;width:auto}`,
  );

/** Os ícones LEGADOS (API < 26, e o `minSdkVersion` é 24, então existem de
 *  verdade). Aqui a moldura é o próprio arquivo: o sistema antigo não recorta
 *  nada, então o quadrado arredondado e o círculo são desenhados. A marca vai
 *  maior do que no adaptativo justamente porque não há máscara para comer as
 *  bordas. */
const legacyHtml = (px, round) =>
  page(
    px,
    px,
    `<div class="tile"><img src="${MARK}" alt=""></div>`,
    `body{background:transparent}
     .tile{width:${px}px;height:${px}px;background:#fff;display:flex;align-items:center;justify-content:center;
       border-radius:${round ? '50%' : `${Math.round(px * 0.2)}px`}}
     img{height:${Math.round(px * (round ? 0.6 : 0.68))}px;width:auto}`,
  );

/** A tela de abertura. Ela responde por Android 7..11 (API 24-30); do 12 em
 *  diante o sistema IGNORA este drawable e desenha o ícone do app sobre a cor
 *  do tema — que é o que o `values-v31/styles.xml` declara.
 *
 *  A marca é dimensionada pelo LADO MENOR, nunca pela largura: o mesmo
 *  arquivo existe em retrato e em paisagem, e escalar pela largura faria a
 *  marca cobrir a tela inteira na horizontal. */
const splashHtml = (px, py) =>
  page(
    px,
    py,
    `<img src="${MARK}" alt="">`,
    `body{background:#fff;display:flex;align-items:center;justify-content:center}
     img{height:${Math.round(Math.min(px, py) * 0.26)}px;width:auto}`,
  );

/** O ícone do Play Console: 512x512, OPACO.
 *
 *  A loja aplica a própria máscara de cantos, então desenhar cantos aqui os
 *  duplicaria; e alfa num ícone de listagem aparece como buraco preto em
 *  algumas superfícies do Play. Fundo branco chapado, marca centrada. */
const storeIconHtml = () =>
  page(
    512,
    512,
    `<img src="${MARK}" alt="">`,
    `body{background:#fff;display:flex;align-items:center;justify-content:center}
     img{height:${Math.round(512 * 0.66)}px;width:auto}`,
  );

/** O gráfico de destaque: 1024x500, sem alfa.
 *
 *  O Play sobrepõe o botão de instalar e pode recortar as bordas em algumas
 *  superfícies, então nada de essencial encosta na margem — texto à esquerda,
 *  marca à direita, e a faixa de tom da identidade na borda, igual ao card
 *  social. */
const featureHtml = ({ title, tagline }) =>
  page(
    1024,
    500,
    `<div class="mid"><h1>${title}</h1><p>${tagline}</p></div><img class="mark" src="${MARK}" alt="">`,
    `body{background:#fff;color:${INK};display:flex;align-items:center;justify-content:space-between;
       padding:0 72px;position:relative;overflow:hidden}
     body::before{content:'';position:absolute;left:0;top:0;bottom:0;width:14px;background:#056981}
     body::after{content:'';position:absolute;right:-140px;top:-140px;width:460px;height:460px;border-radius:50%;
       background:${BASE};opacity:.9}
     .mid{position:relative;z-index:1;max-width:620px}
     h1{font-size:48px;font-weight:700;line-height:1.1;letter-spacing:-.03em}
     p{margin-top:20px;font-size:26px;line-height:1.35;font-weight:600;color:${MUTED}}
     .mark{position:relative;z-index:1;height:288px;width:auto;margin-right:8px}`,
  );

/* ------------------------------------------------------------- execução --- */

const { chromium } = await import('@playwright/test').catch(() => {
  console.error('[android] @playwright/test não encontrado. Rode: npm i && npx playwright install chromium');
  process.exit(1);
});

const browser = await chromium.launch();
const page_ = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });

let written = 0;
async function shoot(html, path, width, height, transparent = false) {
  await page_.setViewportSize({ width, height });
  await page_.setContent(html, { waitUntil: 'load' });
  await page_.evaluate(() => document.fonts.ready);
  // `omitBackground` é o que deixa o PNG com alfa de verdade. Sem ele o
  // Chromium pinta branco por baixo e a camada de frente do adaptativo vira um
  // quadrado branco opaco — que apaga o fundo e mata o paralaxe do launcher.
  await page_.screenshot({ path, type: 'png', omitBackground: transparent });
  written++;
}

// 1. Ícone adaptativo (API 26+) — a camada de frente, em 108dp por densidade.
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [dpi, scale] of Object.entries(DENSITIES)) {
  const fg = Math.round(108 * scale);
  await shoot(foregroundHtml(fg), join(RES, `mipmap-${dpi}/ic_launcher_foreground.png`), fg, fg, true);

  // 2. Ícones legados, no tamanho nominal de 48dp.
  const legacy = Math.round(48 * scale);
  await shoot(legacyHtml(legacy, false), join(RES, `mipmap-${dpi}/ic_launcher.png`), legacy, legacy, true);
  await shoot(legacyHtml(legacy, true), join(RES, `mipmap-${dpi}/ic_launcher_round.png`), legacy, legacy, true);
}

// 3. Tela de abertura, nos mesmos tamanhos que o Capacitor já declarava.
//    A lista é fixa e não derivada dos arquivos existentes de propósito: é ela
//    que diz quais qualificadores o app suporta, e ler do disco faria um
//    arquivo apagado por engano sumir em silêncio.
const SPLASHES = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920],
];
for (const [dir, w, h] of SPLASHES) {
  await shoot(splashHtml(w, h), join(RES, `${dir}/splash.png`), w, h);
}

// 4. Gráficos do Play Console.
mkdirSync(PLAY, { recursive: true });
await shoot(storeIconHtml(), join(PLAY, 'icon-512.png'), 512, 512);

const FEATURE = {
  pt: { title: 'Seus arquivos não saem<br>do seu dispositivo.', tagline: '57 ferramentas · zero upload · sem internet' },
  en: { title: 'Your files never leave<br>your device.', tagline: '57 tools · zero upload · no internet' },
};
for (const [lang, copy] of Object.entries(FEATURE)) {
  await shoot(featureHtml(copy), join(PLAY, `feature-graphic-${lang}.png`), 1024, 500);
}

await browser.close();

// 5. Os vetores de exemplo do Capacitor. Eles não são referenciados por nada —
//    o `mipmap-anydpi-v26/ic_launcher.xml` aponta para `@color/...` e para
//    `@mipmap/...` — mas continuam entrando no APK e aparecem em qualquer
//    busca por "ic_launcher", que é como um ícone de exemplo volta ao produto.
for (const dead of ['drawable/ic_launcher_background.xml', 'drawable-v24/ic_launcher_foreground.xml']) {
  const path = join(RES, dead);
  if (existsSync(path)) {
    rmSync(path);
    console.log(`[android] removido: res/${dead} (vetor de exemplo do Capacitor, sem referência)`);
  }
}

console.log(`[android] ${written} imagens escritas em android/app/src/main/res/ e store/play/.`);
