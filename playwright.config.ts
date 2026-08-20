import { defineConfig, devices } from '@playwright/test';
import { DEV_PORT, DEV_URL, PREVIEW_PORT, PREVIEW_URL } from './e2e/ports';

/**
 * Headed by design: the point of this suite is to *watch* the tools run.
 * Single worker so one window drives the whole chain in order.
 *
 * Em CI não existe tela, e `headless: false` num runner do Actions não é lento:
 * é uma falha de "Missing X server". Por isso as duas propriedades que só fazem
 * sentido para quem está olhando — a janela e o `slowMo` — caem quando `CI` está
 * definido, que é o padrão de todo runner. Nada mais muda: mesmos specs, mesmo
 * worker único, mesma ordem.
 */
const CI = !!process.env['CI'];

/** As portas moram em `e2e/ports.ts`, junto com os dois specs que as usam. */

export default defineConfig({
  testDir: './e2e',
  // Os probes de diagnóstico rodam pela playwright.debug.config.ts: eles leem um
  // PDF real solto na raiz, que só existe na máquina de quem está depurando.
  testIgnore: /debug-.*\.spec\.ts/,
  globalSetup: './e2e/fixtures/generate.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: DEV_URL,
    headless: CI,
    // ThemeService falls back to the OS preference, so pin it or the theme
    // assertions depend on whatever machine runs the suite.
    colorScheme: 'dark',
    acceptDownloads: true,
    launchOptions: { slowMo: CI ? 0 : 250 },
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: `npm start -- --port ${DEV_PORT}`,
      url: DEV_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    /**
     * The production build, for 09-offline.
     *
     * `ng serve` does not emit ngsw-worker.js, so under the dev server there is
     * no service worker at all — the offline suite would be asserting against
     * the one condition it exists to prove. It needs the real artifact, served
     * the way a static host serves it.
     */
    {
      command: `npm run build && node e2e/preview-server.mjs ${PREVIEW_PORT}`,
      url: PREVIEW_URL,
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});
