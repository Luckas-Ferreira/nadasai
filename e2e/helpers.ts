import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';

export const PHOTO = join(__dirname, 'fixtures', 'assets', 'photo.png');
export const PHOTO_TALL = join(__dirname, 'fixtures', 'assets', 'photo-tall.png');
export const PHOTO_META = join(__dirname, 'fixtures', 'assets', 'photo-meta.png');
export const NOT_AN_IMAGE = join(__dirname, 'fixtures', 'assets', 'notes.txt');

export const DOC_A = join(__dirname, 'fixtures', 'assets', 'doc-a.pdf');
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

/** Downloads go through file-saver, so assert on the browser event, not the disk. */
export async function expectDownload(page: Page, namePattern: RegExp): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar' }).click(),
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
