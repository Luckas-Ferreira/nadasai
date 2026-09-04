// Gera as capturas de tela da ficha do Play, em português e em inglês.
//
// POR QUE ISTO EXISTE, E POR QUE ELE DIRIGE O APP DE VERDADE
//
// O Play exige no mínimo duas capturas por idioma e não aceita a ficha sem
// elas. O caminho fácil seria fotografar o emulador à mão — e é justamente o
// que apodrece: a captura vira um retrato de uma versão que já mudou, ninguém
// lembra qual tela era, e refazer as dezesseis significa repetir o passeio
// inteiro. Aqui as telas são uma LISTA, o app é dirigido de verdade (arquivo
// carregado, painel aberto, resultado na tela) e refazer é um comando.
//
// As capturas saem do app rodando em `ng serve`, e não do APK. A diferença
// entre os dois é `PACKAGED` (veja `core/platform/platform.ts`): ela troca o
// registro do service worker e liga os atalhos nativos de vídeo e de recorte —
// nenhum PIXEL da interface muda. O que se vê aqui é o que se vê no aparelho.
//
// AS MOLDURAS
//
// A captura crua de um telefone é uma tira alta que, na vitrine do Play,
// aparece do tamanho de um selo. A moldura existe para a primeira linha ser
// legível ali: a frase em cima, o aparelho embaixo. É a mesma decisão do card
// social — um layout só, parametrizado, porque dois divergem no primeiro
// ajuste.
//
// USO
//
//   npx ng serve --port 4210          (noutro terminal; NUNCA a 4200)
//   node scripts/generate-play-screenshots.mjs
//
// Saída: store/play/screenshots/{pt,en}/NN-tela.png, 1080x1920.

import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'store/play/screenshots');
const TMP = join(ROOT, 'store/play/.fixtures');
const BASE = process.env['NADASAI_URL'] ?? 'http://127.0.0.1:4210';

/** A tela do Play: 1080x1920 é a proporção 9:16 que a loja pede, no tamanho
 *  que ela mostra sem reamostrar. */
const CARD = { width: 1080, height: 1920 };

/** O telefone de dentro. 390x860 é o retrato lógico de um aparelho comum, e é
 *  a largura em que o `app-tool-page` vira FOLHA — ou seja, a captura mostra a
 *  interface de celular de verdade, e não a de desktop encolhida. */
const PHONE = { width: 390, height: 860 };

/* -------------------------------------------------------------- fixtures -- */

/** Um WAV de 16 bits, montado à mão.
 *
 *  A onda precisa ter FORMA: uma senoide constante desenha um retângulo cheio
 *  na tela do cortador, que é exatamente a captura que não explica nada. Então
 *  são batidas com decaimento sobre um acorde — o que a pessoa reconhece como
 *  música ao ver o desenho. */
function wav({ seconds = 11, rate = 44100, channels = 2 } = {}) {
  const frames = Math.floor(seconds * rate);
  const data = Buffer.alloc(frames * channels * 2);
  const CHORD = [220, 277.18, 329.63, 440];
  for (let i = 0; i < frames; i++) {
    const t = i / rate;
    // Uma batida a cada 0,5 s, com decaimento exponencial; a cada 4 compassos
    // a batida forte é mais alta, que é o que dá relevo à onda.
    const beat = t % 0.5;
    const bar = Math.floor(t / 0.5) % 8;
    const accent = bar === 0 ? 1 : bar % 2 === 0 ? 0.72 : 0.45;
    const env = accent * Math.exp(-beat * 7) * (t < seconds - 1 ? 1 : (seconds - t) / 1);
    let sample = 0;
    for (const f of CHORD) sample += Math.sin(2 * Math.PI * f * t) / CHORD.length;
    const v = Math.max(-1, Math.min(1, sample * env));
    for (let c = 0; c < channels; c++) {
      // O canal direito sai um pouco atrás: estéreo de verdade na tela.
      const vc = c === 0 ? v : v * 0.85;
      data.writeInt16LE(Math.round(vc * 32767), (i * channels + c) * 2);
    }
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** O documento de exemplo, em HTML — o Chromium o imprime em PDF de verdade.
 *
 *  O conteúdo é DELIBERADAMENTE fictício e genérico. Os PDFs que este
 *  repositório tem na raiz são documentos reais de alguém (por isso `/*.pdf`
 *  está no .gitignore), e uma captura de loja é a última superfície onde um
 *  CPF pode aparecer. */
const DOC_HTML = {
  pt: {
    title: 'Contrato de Prestação de Serviços',
    lead: 'Instrumento particular firmado entre as partes abaixo qualificadas, para a prestação dos serviços descritos na cláusula primeira.',
    sections: [
      ['Cláusula primeira — do objeto', 'A CONTRATADA prestará à CONTRATANTE serviços de consultoria técnica, compreendendo o levantamento de requisitos, a elaboração do plano de trabalho e o acompanhamento da execução, conforme o cronograma anexo.'],
      ['Cláusula segunda — do prazo', 'O prazo de vigência é de doze meses contados da assinatura, prorrogável por igual período mediante termo aditivo firmado por ambas as partes.'],
      ['Cláusula terceira — do preço', 'Pelos serviços a CONTRATANTE pagará o valor mensal ajustado, com vencimento no quinto dia útil do mês subsequente ao da prestação.'],
      ['Cláusula quarta — da confidencialidade', 'As partes obrigam-se a manter sigilo sobre toda informação a que tiverem acesso em razão deste contrato, obrigação que subsiste por cinco anos após o seu término.'],
      ['Cláusula quinta — da rescisão', 'Este contrato poderá ser rescindido por qualquer das partes, sem ônus, mediante aviso prévio de trinta dias, sem prejuízo das obrigações já vencidas.'],
    ],
    annex: 'Anexo I — Cronograma de execução',
    rows: [['Etapa', 'Entrega', 'Prazo'], ['1', 'Levantamento de requisitos', '30 dias'], ['2', 'Plano de trabalho', '45 dias'], ['3', 'Relatório parcial', '90 dias'], ['4', 'Relatório final', '180 dias']],
  },
  en: {
    title: 'Professional Services Agreement',
    lead: 'This agreement is entered into by the parties identified below for the provision of the services described in section one.',
    sections: [
      ['Section one — scope', 'The Provider shall deliver technical consulting services to the Client, comprising requirements gathering, preparation of the work plan and oversight of its execution, in accordance with the attached schedule.'],
      ['Section two — term', 'The term of this agreement is twelve months from the date of signature, renewable for an equal period by written amendment signed by both parties.'],
      ['Section three — fees', 'The Client shall pay the agreed monthly fee, due on the fifth business day of the month following the month in which the services were rendered.'],
      ['Section four — confidentiality', 'Each party shall keep confidential all information to which it gains access under this agreement, an obligation that survives for five years after termination.'],
      ['Section five — termination', 'Either party may terminate this agreement at no cost upon thirty days written notice, without prejudice to obligations already due.'],
    ],
    annex: 'Schedule I — Delivery timetable',
    rows: [['Phase', 'Deliverable', 'Due'], ['1', 'Requirements gathering', '30 days'], ['2', 'Work plan', '45 days'], ['3', 'Interim report', '90 days'], ['4', 'Final report', '180 days']],
  },
};

const FONTS = ['400', '600', '700'].map((weight) => ({
  weight,
  data: readFileSync(join(ROOT, `node_modules/@fontsource/nunito/files/nunito-latin-${weight}-normal.woff2`)).toString('base64'),
}));
const FACES = FONTS.map(
  (f) => `@font-face{font-family:Nunito;font-style:normal;font-weight:${f.weight};font-display:block;
src:url(data:font/woff2;base64,${f.data}) format('woff2')}`,
).join('\n');

function docHtml(lang) {
  const d = DOC_HTML[lang];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FACES}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Nunito,Georgia,serif;color:#111;font-size:11pt;line-height:1.55}
h1{font-size:19pt;font-weight:700;margin-bottom:6pt;letter-spacing:-.01em}
.lead{color:#333;margin-bottom:16pt}
h2{font-size:12pt;font-weight:700;margin:14pt 0 4pt}
p{text-align:justify;margin-bottom:6pt}
table{width:100%;border-collapse:collapse;margin-top:8pt;font-size:10pt}
th,td{border:1px solid #999;padding:5pt 7pt;text-align:left}
th{background:#eef2f7;font-weight:700}
.sign{margin-top:36pt;display:flex;gap:40pt}
.sign div{flex:1;border-top:1px solid #333;padding-top:5pt;font-size:9pt;color:#444}
</style></head><body>
<h1>${d.title}</h1><p class="lead">${d.lead}</p>
${d.sections.map(([h, p]) => `<h2>${h}</h2><p>${p}</p>`).join('')}
<div class="sign"><div>CONTRATANTE</div><div>CONTRATADA</div></div>
<h2 style="page-break-before:always">${d.annex}</h2>
<table>${d.rows.map((r, i) => `<tr>${r.map((c) => `<${i ? 'td' : 'th'}>${c}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>
</body></html>`;
}

/** A imagem de exemplo. Uma paisagem desenhada em CSS: ela precisa ter
 *  gradiente e detalhe para que "comprimir" e "cortar" mostrem alguma coisa —
 *  um retângulo chapado comprime a nada e não diz o que a ferramenta faz. */
const PHOTO_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0}
body{width:1600px;height:1200px;overflow:hidden;position:relative;
  background:linear-gradient(180deg,#0b3d5c 0%,#1b6f8f 38%,#3fa4b0 58%,#f2b263 78%,#f7d9a0 100%)}
.sun{position:absolute;left:1080px;top:250px;width:210px;height:210px;border-radius:50%;
  background:radial-gradient(circle,#fff6df 0%,#ffd688 55%,#ffb44d 100%);box-shadow:0 0 140px 60px rgba(255,196,110,.55)}
.hill{position:absolute;bottom:0;border-radius:50% 50% 0 0}
.h1{left:-200px;width:1300px;height:560px;background:linear-gradient(180deg,#0f5061,#093a48)}
.h2{left:700px;width:1400px;height:700px;background:linear-gradient(180deg,#12626f,#0b4553)}
.h3{left:280px;width:900px;height:420px;background:linear-gradient(180deg,#1b7c80,#115a63)}
.sea{position:absolute;left:0;bottom:0;width:1600px;height:200px;
  background:linear-gradient(180deg,rgba(255,255,255,.25),rgba(255,255,255,0)),#0a3f52}
.glint{position:absolute;height:4px;background:rgba(255,222,170,.65);border-radius:2px}
</style></head><body>
<div class="sun"></div><div class="hill h2"></div><div class="hill h1"></div><div class="hill h3"></div>
<div class="sea"></div>
${Array.from({ length: 26 }, (_, i) => `<div class="glint" style="left:${(i * 61) % 1500}px;bottom:${20 + ((i * 37) % 170)}px;width:${40 + ((i * 23) % 130)}px;opacity:${0.2 + ((i * 7) % 6) / 12}"></div>`).join('')}
</body></html>`;

/* ----------------------------------------------------------- as MOLDURAS -- */

const STYLES = readFileSync(join(ROOT, 'src/styles.css'), 'utf8');
const token = (name, fallback) => (STYLES.match(new RegExp(`--${name}:\\s*([^;]+);`)) ?? [, fallback])[1].trim();
const INK = token('text', '#0f172a');
const MUTED = token('muted', '#334155');

/** A altura do aparelho na moldura sai da PROPORÇÃO da captura, nunca de um
 *  número fixo: com um número fixo, mudar `PHONE` distorce as dezesseis
 *  imagens de uma vez e nada avisa. */
const SHOT_W = 690;
const SHOT_H = Math.round((SHOT_W * PHONE.height) / PHONE.width);

function frameHtml({ caption, shot }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FACES}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${CARD.width}px;height:${CARD.height}px;font-family:Nunito,Arial,sans-serif;overflow:hidden;
  background:linear-gradient(165deg,#ffffff 0%,#eef3f8 55%,#dfe9f1 100%);
  display:flex;flex-direction:column;align-items:center;position:relative}
/* A mesma faixa de tom da marca do card social e do gráfico de destaque. */
body::before{content:'';position:absolute;left:0;top:0;right:0;height:14px;background:#056981}
/* A frase mora numa FAIXA de altura fixa, e não empurra o aparelho.
   Com uma margem superior, a captura de uma linha comeca 64px acima da de
   duas, e as dezesseis imagens deixam de alinhar no carrossel do Play — que
   as mostra lado a lado, que e exatamente onde isso aparece. */
.cap{height:296px;flex:0 0 296px;padding:0 70px;display:flex;align-items:center;justify-content:center}
h1{text-align:center;font-size:56px;font-weight:700;line-height:1.14;
  letter-spacing:-.03em;color:${INK};max-width:1000px;
  /* Duas linhas no máximo: a terceira empurra o aparelho para fora da tela. */
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.phone{width:${SHOT_W}px;height:${SHOT_H}px;border-radius:34px;overflow:hidden;
  background:#fff;box-shadow:0 2px 0 rgba(15,23,42,.06),0 26px 70px rgba(15,23,42,.28),
  0 0 0 1px rgba(15,23,42,.10)}
.phone img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.foot{position:absolute;bottom:34px;font-size:25px;font-weight:600;color:${MUTED};
  display:flex;align-items:center;gap:12px}
.dot{width:12px;height:12px;border-radius:50%;background:#10b981}
</style></head><body>
<div class="cap"><h1>${caption}</h1></div>
<div class="phone"><img src="${shot}" alt=""></div>
<div class="foot"><span class="dot"></span><span>nadasai.com</span></div>
</body></html>`;
}

/* ---------------------------------------------------------------- telas --- */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cada tela é `{ file, path, caption, setup }`. `path` já vem sem o prefixo de
 *  idioma — quem o monta é o laço, para que uma tela nova não possa existir só
 *  em metade do produto. */
const SCREENS = [
  {
    file: '01-home',
    path: { pt: '', en: '' },
    caption: { pt: '57 ferramentas.<br>Nada sai do aparelho.', en: '57 tools.<br>Nothing leaves your device.' },
  },
  {
    file: '02-edit-pdf',
    path: { pt: 'pdf/editar', en: 'pdf/edit' },
    caption: { pt: 'Edite o texto de um PDF', en: 'Edit the text inside a PDF' },
    setup: async (page, lang, fx) => {
      await page.locator('input[type=file]').first().setInputFiles(fx.doc[lang]);
      // A rasterização da página é assíncrona e serializada atrás de um mutex;
      // esperar o canvas EXISTIR não basta, ele nasce em branco.
      await page.locator('canvas').first().waitFor({ timeout: 60_000 });
      await wait(4000);
    },
  },
  {
    file: '03-merge-pdf',
    path: { pt: 'pdf/juntar', en: 'pdf/merge' },
    caption: { pt: 'Junte, divida e organize páginas', en: 'Merge, split and reorder pages' },
    setup: async (page, lang, fx) => {
      await page.locator('input[type=file]').first().setInputFiles([fx.doc[lang], fx.doc[lang]]);
      await page.locator('img, canvas').first().waitFor({ timeout: 60_000 });
      await wait(4000);
    },
  },
  {
    file: '04-crop',
    path: { pt: 'imagem/cortar', en: 'image/crop' },
    caption: { pt: 'Corte e redimensione imagens', en: 'Crop and resize images' },
    setup: async (page, _lang, fx) => {
      await page.locator('input[type=file]').first().setInputFiles(fx.photo);
      await page.locator('.cropper-container, canvas, img').first().waitFor({ timeout: 30_000 });
      await wait(2500);
    },
  },
  {
    file: '05-compress',
    path: { pt: 'imagem/comprimir', en: 'image/compress' },
    caption: { pt: 'Comprima sem enviar para servidor nenhum', en: 'Compress without any server involved' },
    // O JPEG, e não o PNG, e a compressão RODADA.
    //
    // Com um PNG a ferramenta responde, corretamente, que não há qualidade a
    // negociar e que o arquivo só será reescrito — ou seja, a captura de uma
    // ferramenta chamada "comprimir" mostraria a tela em que ela não comprime,
    // e o campo "Comprimido" vazio. É o mesmo defeito que o grão da fixture do
    // e2e existe para evitar, um passo antes: sem rodar, não há economia na
    // tela, e é a economia que a captura precisa mostrar.
    setup: async (page, _lang, fx) => {
      await page.locator('input[type=file]').first().setInputFiles(fx.photoJpeg);
      await wait(2500);
      // O primário é o primeiro botão da barra de ação, e localizá-lo assim é
      // o que mantém esta linha fora do dicionário: por rótulo, ela precisaria
      // de uma tradução por idioma e quebraria no dia em que o texto mudasse.
      await page.locator('app-action-bar button').first().click();
      await wait(4000);
    },
  },
  {
    file: '06-cut-audio',
    path: { pt: 'audio/cortar', en: 'audio/cut' },
    caption: { pt: 'Corte áudio olhando para a onda', en: 'Cut audio with the waveform in front of you' },
    setup: async (page, _lang, fx) => {
      await page.locator('input[type=file]').first().setInputFiles(fx.clip);
      await page.locator('canvas').first().waitFor({ timeout: 60_000 });
      await wait(3000);
    },
  },
  {
    file: '07-password',
    path: { pt: 'privacidade/gerador-de-senha', en: 'privacy/password-generator' },
    caption: { pt: 'Senhas fortes, geradas no seu aparelho', en: 'Strong passwords, generated on your device' },
    setup: async () => wait(1500),
  },
  {
    file: '08-qr-code',
    path: { pt: 'privacidade/qr-code', en: 'privacy/qr-code' },
    caption: { pt: 'QR Code, EXIF, hash e criptografia', en: 'QR codes, EXIF, hashes and encryption' },
    setup: async () => wait(1500),
  },
];

/* ------------------------------------------------------------- execução --- */

const { chromium } = await import('@playwright/test').catch(() => {
  console.error('[shots] @playwright/test não encontrado. Rode: npm i && npx playwright install chromium');
  process.exit(1);
});

const browser = await chromium.launch({
  args: [
    // Sem isto o `decodeAudioData` do cortador de áudio nunca resolve no
    // headless, e a espera pelo canvas estoura sem dizer por quê.
    '--autoplay-policy=no-user-gesture-required',
    '--disable-features=IsolateOrigins',
  ],
});

// 1. As fixtures. Vão para uma pasta temporária dentro de store/ e são apagadas
//    no fim: um contrato de exemplo e uma paisagem sintética não são artefato
//    de loja, e commitá-los é como o repositório ganha binário sem querer.
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const fixtures = {
  doc: {},
  photo: join(TMP, 'paisagem.png'),
  photoJpeg: join(TMP, 'paisagem.jpg'),
  clip: join(TMP, 'trilha.wav'),
};

const maker = await browser.newPage();
for (const lang of ['pt', 'en']) {
  const path = join(TMP, lang === 'pt' ? 'contrato.pdf' : 'agreement.pdf');
  await maker.setContent(docHtml(lang), { waitUntil: 'load' });
  await maker.evaluate(() => document.fonts.ready);
  await maker.pdf({ path, format: 'A4', margin: { top: '22mm', bottom: '22mm', left: '20mm', right: '20mm' }, printBackground: true });
  fixtures.doc[lang] = path;
}
await maker.setViewportSize({ width: 1600, height: 1200 });
await maker.setContent(PHOTO_HTML, { waitUntil: 'load' });
await maker.screenshot({ path: fixtures.photo, type: 'png' });
// A mesma paisagem em JPEG de alta qualidade: é dela que "comprimir" tira uma
// economia real para mostrar na tela.
await maker.screenshot({ path: fixtures.photoJpeg, type: 'jpeg', quality: 96 });
await maker.close();
writeFileSync(fixtures.clip, wav());
console.log(`[shots] fixtures prontas em ${TMP}`);

// 2. As capturas.
const phone = await browser.newContext({
  viewport: PHONE,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  // O idioma da INTERFACE vem do prefixo da URL (veja `TranslationService`),
  // não do navegador — mas o `Accept-Language` ainda decide o formato de data e
  // de número que a página imprime, então ele acompanha.
  locale: 'pt-BR',
});
const page = await phone.newPage();

const framer = await browser.newPage({ viewport: CARD, deviceScaleFactor: 1 });

let written = 0;
const problems = [];

for (const lang of ['pt', 'en']) {
  mkdirSync(join(OUT, lang), { recursive: true });
  for (const screen of SCREENS) {
    const url = `${BASE}/${lang}/${screen.path[lang]}`.replace(/\/$/, '');
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
      if (screen.setup) await screen.setup(page, lang, fixtures);
      else await wait(1200);
    } catch (err) {
      // Uma tela que não montou vira AVISO e não captura: publicar uma moldura
      // com um spinner no meio é pior do que publicar sete capturas.
      problems.push(`${lang}/${screen.file}: ${err.message.split('\n')[0]}`);
      continue;
    }

    const shot = await page.screenshot({ type: 'png' });
    await framer.setContent(
      frameHtml({ caption: screen.caption[lang], shot: `data:image/png;base64,${shot.toString('base64')}` }),
      { waitUntil: 'load' },
    );
    await framer.evaluate(() => document.fonts.ready);
    await framer.screenshot({ path: join(OUT, lang, `${screen.file}.png`), type: 'png' });
    written++;
    console.log(`[shots] ${lang}/${screen.file}.png`);
  }
}

await browser.close();
if (!process.env['NADASAI_KEEP_FIXTURES']) rmSync(TMP, { recursive: true, force: true });

if (problems.length) {
  console.warn(`\n[shots] ${problems.length} tela(s) não capturada(s):`);
  for (const p of problems) console.warn(`  - ${p}`);
}
console.log(`\n[shots] ${written} capturas em ${OUT} (${CARD.width}x${CARD.height}).`);
if (written < 4) {
  console.error('[shots] menos de 4 capturas: o servidor está no ar em ' + BASE + '?');
  process.exit(1);
}
