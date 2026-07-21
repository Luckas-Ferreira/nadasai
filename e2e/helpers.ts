import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';

export const PHOTO = join(__dirname, 'fixtures', 'assets', 'photo.png');
export const PHOTO_TALL = join(__dirname, 'fixtures', 'assets', 'photo-tall.png');
export const NOT_AN_IMAGE = join(__dirname, 'fixtures', 'assets', 'notes.txt');

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
