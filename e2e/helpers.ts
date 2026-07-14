import { expect, type Page } from '@playwright/test';
import { join } from 'node:path';

export const PHOTO = join(__dirname, 'fixtures', 'assets', 'photo.png');
export const NOT_AN_IMAGE = join(__dirname, 'fixtures', 'assets', 'notes.txt');

/**
 * The dictionary is picked from navigator.language on first load, so pin EN in
 * storage before the app boots — otherwise every text assertion here is a
 * coin-flip against the machine's locale.
 */
export async function openApp(page: Page, path = '/'): Promise<void> {
  // Only seeds the first load: overwriting on every navigation would undo the
  // language the test just picked, and reloads would silently pass.
  await page.addInitScript(() => {
    if (!localStorage.getItem('imgwork.lang')) localStorage.setItem('imgwork.lang', 'en');
  });
  await page.goto(path);
  await expect(page.getByRole('link', { name: 'ImgWork' }).first()).toBeVisible();
}

/** The dropzone's input is `hidden`; setInputFiles drives it anyway. */
export async function upload(page: Page, file = PHOTO): Promise<void> {
  await page.locator('input[type=file]').first().setInputFiles(file);
}

/** Downloads go through file-saver, so assert on the browser event, not the disk. */
export async function expectDownload(page: Page, namePattern: RegExp): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);

  const name = download.suggestedFilename();
  expect(name).toMatch(namePattern);
  return name;
}

export const primary = (page: Page, label: string) => page.getByRole('button', { name: label, exact: true });
