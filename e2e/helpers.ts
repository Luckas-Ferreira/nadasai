import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';

export const PHOTO = join(__dirname, 'fixtures', 'assets', 'photo.png');
export const PHOTO_TALL = join(__dirname, 'fixtures', 'assets', 'photo-tall.png');
export const NOT_AN_IMAGE = join(__dirname, 'fixtures', 'assets', 'notes.txt');

export const DOC_A = join(__dirname, 'fixtures', 'assets', 'doc-a.pdf');
export const DOC_B = join(__dirname, 'fixtures', 'assets', 'doc-b.pdf');
export const SCAN = join(__dirname, 'fixtures', 'assets', 'scan.pdf');
export const CLIP = join(__dirname, 'fixtures', 'assets', 'clip.wav');

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
