import { test, expect } from '@playwright/test';
import { join } from 'node:path';

const PDF = join(__dirname, '..', '[AL] Edital Centelha 3  28-05-2026.pdf');

test('edit-pdf: clicking a text block should show visible dark text (not white)', async ({ page }) => {
  await page.goto('/pt/edit-pdf');

  // Upload the PDF
  await page.locator('input[type=file]').first().setInputFiles(PDF);

  // Wait for the PDF to load and render (canvas elements appear)
  await page.waitForSelector('canvas[data-page]', { timeout: 30_000 });

  // Wait a bit more for rendering to settle
  await page.waitForTimeout(2000);

  // Take a screenshot of initial state (before any click)
  await page.screenshot({ path: 'e2e-debug-before-click.png', fullPage: false });

  // Find the first text overlay block (dashed border = unselected native block)
  const firstBlock = page.locator('[data-block-id]').first();
  await firstBlock.waitFor({ timeout: 10_000 });

  // Inspect its current (pre-click) style
  const colorBefore = await firstBlock.evaluate((el) => {
    return window.getComputedStyle(el).color;
  });
  console.log('[DEBUG] Color BEFORE click:', colorBefore);

  // Click the block to select it
  await firstBlock.click();
  await page.waitForTimeout(500);

  // Take a screenshot after clicking
  await page.screenshot({ path: 'e2e-debug-after-click.png', fullPage: false });

  // Inspect computed style AFTER click
  const colorAfter = await firstBlock.evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      color: cs.color,
      background: cs.background,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      inlineStyle: el.getAttribute('style'),
      className: el.className,
    };
  });
  console.log('[DEBUG] After click computed style:', JSON.stringify(colorAfter, null, 2));

  // The text color must NOT be white (255, 255, 255)
  // It should be dark (close to black)
  expect(colorAfter.color).not.toBe('rgb(255, 255, 255)');
  expect(colorAfter.color).not.toBe('rgba(0, 0, 0, 0)');

  // Parse the RGB values
  const match = colorAfter.color.match(/\d+/g);
  if (match) {
    const [r, g, b] = match.map(Number);
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    console.log('[DEBUG] Text luminance:', luminance, '(should be < 128 for dark text)');
    // For a white-background PDF, text should be dark
    // Luminance > 200 means it's near-white = invisible on white background
    expect(luminance).toBeLessThan(200);
  }
});
