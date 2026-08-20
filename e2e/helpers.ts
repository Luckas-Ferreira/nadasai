import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';

export const PHOTO = join(__dirname, 'fixtures', 'assets', 'photo.png');
export const PHOTO_TALL = join(__dirname, 'fixtures', 'assets', 'photo-tall.png');
export const PHOTO_META = join(__dirname, 'fixtures', 'assets', 'photo-meta.png');
export const NOT_AN_IMAGE = join(__dirname, 'fixtures', 'assets', 'notes.txt');

export const DOC_A = join(__dirname, 'fixtures', 'assets', 'doc-a.pdf');
export const DOC_LONG = join(__dirname, 'fixtures', 'assets', 'doc-long.pdf');
export const DOC_B = join(__dirname, 'fixtures', 'assets', 'doc-b.pdf');
export const DOC_META = join(__dirname, 'fixtures', 'assets', 'doc-meta.pdf');
export const SCAN = join(__dirname, 'fixtures', 'assets', 'scan.pdf');
export const CLIP = join(__dirname, 'fixtures', 'assets', 'clip.wav');
export const CLIP_B = join(__dirname, 'fixtures', 'assets', 'clip-b.wav');

/**
 * The app is Portuguese-only, so there is nothing to pin: the language no longer
 * depends on the machine's locale or on storage, and these assertions are against
 * the one dictionary users actually see.
 */
export async function openApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('link', { name: 'Nada Sai' }).first()).toBeVisible();
}

/** The dropzone's input is `hidden`; setInputFiles drives it anyway. */
export async function upload(page: Page, file = PHOTO): Promise<void> {
  await page.locator('input[type=file]').first().setInputFiles(file);
}

/**
 * The same picture as PHOTO, but as a JPEG — needed since compression keeps the
 * input's format, so a lossy run cannot be exercised with a PNG at all.
 *
 * Encoded in the page rather than committed, for the reason `fixtures/generate.ts`
 * hand-rolls its PNG encoder: no binaries in the repo. Node has no JPEG writer,
 * the browser under test does, and the noise makes q=95 → q=75 a real saving.
 */
export async function uploadJpeg(page: Page, name = 'photo.jpg'): Promise<void> {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    const ctx = canvas.getContext('2d')!;
    const image = ctx.createImageData(canvas.width, canvas.height);

    // Deterministic LCG, same as the PNG fixture: no Math.random flake.
    let seed = 12345;
    const noise = (spread: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return ((seed >>> 8) % (spread * 2 + 1)) - spread;
    };

    for (let i = 0; i < image.data.length; i += 4) {
      const x = (i / 4) % canvas.width;
      const y = Math.floor(i / 4 / canvas.width);
      image.data[i] = Math.min(255, Math.max(0, 40 + ((x * 5) % 30) + noise(24)));
      image.data[i + 1] = Math.min(255, Math.max(0, 90 + noise(24)));
      image.data[i + 2] = Math.min(255, Math.max(0, 170 + ((y * 4) % 50) + noise(24)));
      image.data[i + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);

    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95),
    );

    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name, mimeType: 'image/jpeg', buffer: Buffer.from(bytes) });
}

/**
 * Uma imagem com TEXTO DE VERDADE, para o OCR ter o que ler.
 *
 * As fixtures do repositório são ruído determinístico — ótimo para provar que a
 * compressão comprime, inútil para provar que o reconhecimento reconhece: o
 * Tesseract devolveria a string vazia e o teste passaria sem ter exercido nada.
 * Desenhada na página em vez de commitada, pelo mesmo motivo que `uploadJpeg`
 * existe: nada de binário no repositório, e o navegador sob teste já tem um
 * rasterizador de fonte.
 *
 * Preto sobre branco, corpo grande e uma fonte comum: o objetivo é medir a
 * ferramenta, não a tolerância do Tesseract a scan ruim.
 */
export async function uploadTextImage(page: Page, text = 'NADA SAI', name = 'documento.png'): Promise<void> {
  const bytes = await page.evaluate(async (phrase) => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 300;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    ctx.font = '120px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(phrase, 40, canvas.height / 2);

    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, text);

  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name, mimeType: 'image/png', buffer: Buffer.from(bytes) });
}

/**
 * Pick the next tool from the home grid — how the chain continues.
 *
 * `continueEdit()` routes to the home, and the home belongs to no module, so it
 * has no rail: the grid is the navigation there. (Inside a module the rail lists
 * that module's tools and is still the fastest way between siblings.)
 *
 * Matched as "<title> " rather than exactly, because a card's accessible name is
 * its title AND its description — and the trailing space is what keeps
 * "Comprimir" from also matching "Comprimir PDF".
 */
export async function pickFromHome(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: new RegExp(`^${name} `) }).first().click();
}

/**
 * Downloads go through file-saver, so assert on the browser event, not the disk.
 *
 * `within` restringe onde procurar o botão. O padrão — a página inteira — basta
 * em toda ferramenta que apresenta o resultado só pela barra de ações. Cortar
 * áudio é a exceção: ele desenha um cartão de "pronto" com um "Baixar" próprio,
 * e enquanto ele está na tela a consulta solta acha dois botões e falha no modo
 * estrito, ou seja, pelo seletor e não pelo comportamento.
 */
export async function expectDownload(
  page: Page,
  namePattern: RegExp,
  within?: string,
): Promise<string> {
  const root = within ? page.locator(within) : page;

  // `exact`, e não por substring: "Baixar áudio convertido" e "Baixar Imagem
  // Censurada" também contêm "Baixar", então a consulta solta acha dois botões
  // em qualquer ferramenta cujo primário ainda esteja na tela — e falha por
  // ambiguidade de seletor, que é a falha que não diz nada sobre o produto.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    root.getByRole('button', { name: 'Baixar', exact: true }).click(),
  ]);

  const name = download.suggestedFilename();
  expect(name).toMatch(namePattern);
  return name;
}

export const primary = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true });

/**
 * Drag a redaction box across `app-region-overlay`, in fractions of the overlay
 * itself — the component maps pointer coordinates to percentages of its own box,
 * so the spec must not care how large the page or the photo rendered.
 *
 * Two intermediate moves rather than one: the overlay only builds a draft on
 * pointermove, and a down-then-up with no move in between is the degenerate
 * "click that wobbled" case it deliberately discards.
 */
export async function drawRegion(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  // Raw mouse events skip Playwright's actionability checks, so nothing here
  // waits for the splash screen to finish fading — and while it is up it sits on
  // top of the page and swallows every pointerdown. A locator click would have
  // retried past it; this cannot, so it waits explicitly.
  await page.locator('.splash-overlay').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});

  const overlay = page.locator('app-region-overlay > div');
  const box = await overlay.boundingBox();
  if (!box) throw new Error('region overlay is not laid out');

  const at = (f: { x: number; y: number }) => ({ x: box.x + box.width * f.x, y: box.y + box.height * f.y });
  const start = at(from);
  const end = at(to);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move((start.x + end.x) / 2, (start.y + end.y) / 2);
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}
