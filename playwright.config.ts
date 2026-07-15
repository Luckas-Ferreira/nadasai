import { defineConfig, devices } from '@playwright/test';

/**
 * Headed by design: the point of this suite is to *watch* the tools run.
 * Single worker so one window drives the whole chain in order.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/fixtures/generate.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:4200',
    headless: false,
    // ThemeService falls back to the OS preference, so pin it or the theme
    // assertions depend on whatever machine runs the suite.
    colorScheme: 'dark',
    acceptDownloads: true,
    launchOptions: { slowMo: 250 },
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm start',
      url: 'http://localhost:4200',
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
      command: 'npm run build && node e2e/preview-server.mjs 4300',
      url: 'http://localhost:4300',
      reuseExistingServer: true,
      timeout: 240_000,
    },
  ],
});
