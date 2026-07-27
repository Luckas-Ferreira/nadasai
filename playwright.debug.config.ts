import { defineConfig, devices } from '@playwright/test';

/**
 * Config só para os probes de diagnóstico (`e2e/debug-*.spec.ts`).
 *
 * Difere da principal em dois pontos, ambos deliberados: roda headless (a suíte
 * principal é headed de propósito, para se assistir as ferramentas rodando, mas
 * uma janela visível é fácil de fechar sem querer no meio de uma investigação) e
 * não sobe o servidor de produção da 4300, que só o 09-offline usa e custa um
 * build inteiro.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /debug-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],

  use: {
    baseURL: 'http://localhost:4271',
    headless: true,
    colorScheme: 'light',
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm start -- --port 4271',
      url: 'http://localhost:4271',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
