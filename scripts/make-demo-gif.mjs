/**
 * Gera o GIF de divulgação: um PDF de verdade entra, a compressão roda, o
 * resultado sai — e o medidor de rede da barra do topo fica em ZERO o tempo
 * todo. É o argumento do produto numa imagem, e é a única prova que não exige
 * que ninguém acredite em nós.
 *
 * NÃO há ffmpeg nem dependência nova, e isso não é economia: os quadros vêm do
 * Playwright e o GIF é escrito pelo encoder LZW do PRÓPRIO produto
 * (`core/gif/`), rodando dentro de uma página do Chromium. É o mesmo caminho da
 * ferramenta vídeo-para-GIF, então um defeito no encoder aparece aqui também,
 * em vez de este script ter uma segunda implementação para discordar dela.
 *
 * Uso:
 *   npx ng serve --port 4210          # noutro terminal
 *   node scripts/make-demo-gif.mjs [entrada.pdf] [saida.gif]
 *
 * A ENTRADA PADRÃO É A FIXTURE DO E2E, e ela exagera o resultado: `scan.pdf` é
 * um gradiente sintético, que é o caso ideal do JPEG, e a tela termina em -99%.
 * O número é verdadeiro e a execução é real, mas não é o que a pessoa vai obter
 * com o documento dela — um escaneamento de verdade fica perto de -70%. Para
 * divulgação, passe um PDF real que você tenha o direito de publicar; um
 * demonstrativo bom demais para ser verdade é lido como demonstrativo falso, e
 * aí a discussão vira sobre isso em vez de sobre o medidor em zero.
 *
 * A porta sai de NADASAI_DEV_PORT e o padrão é 4210, NUNCA 4200 — nesta
 * máquina outro site responde nela, e o script capturaria o produto errado sem
 * dar erro nenhum.
 */

import { chromium } from '@playwright/test';
import * as esbuild from 'esbuild';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env['NADASAI_DEV_PORT'] || '4210';
const BASE = `http://localhost:${PORT}`;
const SCAN = process.argv[2] || join(ROOT, 'e2e', 'fixtures', 'assets', 'scan.pdf');
const OUT = process.argv[3] || join(ROOT, 'nadasai-demo.gif');

/** A janela da captura. Estreita de propósito: num GIF de 670px de largura, o
 *  medidor da barra do topo precisa continuar LEGÍVEL, e ele encolhe junto com
 *  tudo o mais. Uma janela de 1440 entrega um medidor de 8 pixels. */
const VIEW = { width: 1080, height: 700 };
const SCALE = 0.62;
const W = Math.round(VIEW.width * SCALE);
const H = Math.round(VIEW.height * SCALE);

const FRAME_MS = 110;
/** O último quadro segura antes de reiniciar, senão o resultado pisca e some. */
const HOLD_CS = 280;
const MAX_COLORS = 256;

/**
 * O atraso de cada quadro sai do RELÓGIO da captura, não de uma constante.
 * Tirar um screenshot custa mais que o intervalo pedido, então um delay fixo
 * faz o GIF tocar bem mais rápido do que a coisa aconteceu — o que, num vídeo
 * cujo assunto é "olha o tempo que isto leva no seu aparelho", é justamente a
 * informação que não pode estar errada. Centésimos de segundo é a unidade do
 * formato, não milissegundos.
 */
const delayFor = (ms) => Math.max(4, Math.min(40, Math.round(ms / 10)));

const log = (...a) => console.log(...a);

/* ------------------------------------------------------------------ *
 * 1. O encoder do produto, empacotado para rodar dentro da página.
 * ------------------------------------------------------------------ */

async function buildEncoder() {
  const out = await esbuild.build({
    stdin: {
      contents: `
        import { buildPalette, PaletteMapper, mapFrame } from './src/app/core/gif/palette';
        import { encodeGif } from './src/app/core/gif/encode';
        globalThis.__gif = { buildPalette, PaletteMapper, mapFrame, encodeGif };
      `,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    target: 'es2020',
    write: false,
  });
  return out.outputFiles[0].text;
}

/* ------------------------------------------------------------------ *
 * 2. A captura.
 * ------------------------------------------------------------------ */

async function capture(page) {
  const frames = [];
  const stamps = [];
  const shoot = async () => {
    frames.push(await page.screenshot({ type: 'png' }));
    stamps.push(Date.now());
  };

  const forMs = async (ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await shoot();
      await page.waitForTimeout(FRAME_MS);
    }
  };

  /** Filma ENQUANTO espera. A alternativa — esperar e depois filmar — perde
   *  exatamente a parte que interessa, que é o trabalho acontecendo. */
  const until = async (locator, timeoutMs, what) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      await shoot();
      if (await locator.isVisible().catch(() => false)) return;
      await page.waitForTimeout(FRAME_MS);
    }
    throw new Error(`tempo esgotado esperando: ${what}`);
  };

  log(`→ abrindo ${BASE}/en/pdf/compress`);
  await page.goto(`${BASE}/en/pdf/compress`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('input[type=file]').first().waitFor({ state: 'attached', timeout: 120_000 });
  // O splash cobre a tela por um instante e engole clique; esperar aqui é o que
  // impede o primeiro quadro de sair com a sobreposição por cima do medidor.
  await page.waitForTimeout(1500);

  log('→ estado vazio');
  await forMs(2600);

  log('→ soltando o PDF');
  await page.locator('input[type=file]').first().setInputFiles(SCAN);

  const run = page.getByRole('button', { name: 'Compress PDF', exact: true });
  await until(run, 90_000, 'primeira página renderizada');
  await forMs(2200);

  log('→ comprimindo');
  await run.click();

  const download = page.getByRole('button', { name: 'Download', exact: true });
  await until(download, 180_000, 'resultado pronto');

  log('→ segurando no resultado');
  await forMs(4200);

  return { frames, stamps };
}

/* ------------------------------------------------------------------ *
 * 3. Quadros → GIF, pelo encoder do produto.
 * ------------------------------------------------------------------ */

async function encode(browser, encoderJs, frames, delays) {
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ content: encoderJs });

  await page.evaluate(
    ({ w, h }) => {
      window.__W = w;
      window.__H = h;
      window.__rgba = [];
    },
    { w: W, h: H },
  );

  // Um quadro por vez. Mandar os ~110 PNGs num único evaluate é uma string de
  // dezenas de MB, e o que acontece é o protocolo estourar, não uma mensagem.
  for (let i = 0; i < frames.length; i++) {
    await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = window.__W;
      c.height = window.__H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, window.__W, window.__H);
      window.__rgba.push(ctx.getImageData(0, 0, window.__W, window.__H).data);
    }, frames[i].toString('base64'));

    if ((i + 1) % 25 === 0) log(`   ${i + 1}/${frames.length} quadros decodificados`);
  }

  return page.evaluate(
    ({ maxColors, delays }) => {
      const W = window.__W;
      const H = window.__H;
      const all = window.__rgba;

      // Paleta a partir de quadros ESPALHADOS no tempo. Tirada só do primeiro,
      // ela erra a tela do resultado inteira — que é justamente o quadro que
      // importa.
      const picks = [];
      const step = Math.max(1, Math.floor(all.length / 12));
      for (let i = 0; i < all.length; i += step) picks.push(all[i]);

      const per = 2500;
      const samples = new Uint8ClampedArray(picks.length * per * 4);
      let o = 0;
      for (const f of picks) {
        const px = f.length / 4;
        const stride = Math.max(1, Math.floor(px / per));
        for (let p = 0; p < per && p * stride < px; p++) {
          const s = p * stride * 4;
          samples[o++] = f[s];
          samples[o++] = f[s + 1];
          samples[o++] = f[s + 2];
          samples[o++] = 255;
        }
      }

      const palette = window.__gif.buildPalette(samples.subarray(0, o), maxColors);
      const mapper = new window.__gif.PaletteMapper(palette);

      const gifFrames = all.map((f, i) => ({
        indices: window.__gif.mapFrame(f, W, H, palette, mapper, false),
        delayCs: delays[i],
      }));

      const bytes = window.__gif.encodeGif(gifFrames, {
        width: W,
        height: H,
        palette: palette.rgb,
        loop: 0,
      });

      let s = '';
      const CH = 0x8000;
      for (let i = 0; i < bytes.length; i += CH) {
        s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      }
      return { b64: btoa(s), exact: palette.exact, colors: palette.rgb.length };
    },
    { maxColors: MAX_COLORS, delays },
  );
}

/* ------------------------------------------------------------------ */

const encoderJs = await buildEncoder();
log(`encoder do produto empacotado (${(encoderJs.length / 1024).toFixed(0)} kB)`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });

let frames;
let stamps;
try {
  ({ frames, stamps } = await capture(page));
} catch (err) {
  await browser.close();
  console.error('\nfalhou na captura:', err.message);
  console.error(`o servidor está no ar em ${BASE}?  npx ng serve --port ${PORT}`);
  process.exit(1);
}

const delays = stamps.map((t, i) => (i === stamps.length - 1 ? HOLD_CS : delayFor(stamps[i + 1] - t)));
const seconds = delays.reduce((a, b) => a + b, 0) / 100;

log(`\n${frames.length} quadros · ${W}x${H} · ${seconds.toFixed(1)}s`);

const { b64, exact, colors } = await encode(browser, encoderJs, frames, delays);
await browser.close();

const bytes = Buffer.from(b64, 'base64');
writeFileSync(OUT, bytes);

log(`paleta: ${colors} cores${exact ? ' (EXATA — sem perda)' : ' (agrupada em CIELAB)'}`);
log(`\n${OUT}`);
log(`${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
