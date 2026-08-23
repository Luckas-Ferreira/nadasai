import { defineConfig, devices } from '@playwright/test';
import { DEV_PORT, DEV_URL, PREVIEW_PORT, PREVIEW_URL } from './e2e/ports';
import { previewNeeded } from './e2e/preview';

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

/** As portas moram em `e2e/ports.ts`, junto com os specs que as usam. */

/**
 * O servidor de preview só sobe quando algum spec o pede.
 *
 * Ele servia `dist/` para TODA execução, e o comando dele começava por
 * `npm run build`. Isso produziu três defeitos que se disfarçam de falha do
 * produto:
 *
 *  1. Um build de dois minutos antes de rodar um spec que não olha para o
 *     artefato.
 *  2. Esse build rodava AO MESMO TEMPO que o `ng serve` do outro servidor, e
 *     os dois dividem `.angular/cache` — daí um servidor de desenvolvimento
 *     corrompido, com todo teste falhando em `setInputFiles`.
 *  3. `npm run build && node …` é uma cadeia de shell. No Windows o
 *     Playwright mata o shell e o `node` neto sobrevive; com
 *     `reuseExistingServer`, a execução seguinte reaproveitava esse órfão,
 *     que serve um `dist/` antigo — e o `09-offline` reprovava por um
 *     arquivo que não existia mais.
 *
 * Agora o build é do `npm run e2e`, o comando é um processo só (o Playwright
 * consegue matá-lo) e o servidor recusa subir sobre um artefato velho.
 */
const NEEDS_PREVIEW = previewNeeded(process.argv);

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
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  /**
   * O VIEWPORT VEM DO DEVICE (1280x720), e não do `use` acima.
   *
   * O `use` do projeto é mesclado por cima do global, então o viewport que
   * estava declarado lá — 1440x900 — nunca se aplicava a execução nenhuma. A
   * linha morta saiu, e o do device fica de propósito: 720px de altura é a
   * janela de um notebook comum, e é nela que o rail precisa caber inteiro.
   */
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    /**
     * REUSAR ESTE É SEGURO, e reusar o outro não — a diferença é estrutural.
     *
     * O `ng serve` observa os arquivos e recompila, então um servidor que já
     * estava de pé nunca está desatualizado. O de preview serve um retrato
     * congelado do `dist/`: reusar um que ficou de execuções anteriores é
     * exatamente como se testa a versão errada do produto.
     */
    {
      command: `npm start -- --port ${DEV_PORT}`,
      url: DEV_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    ...(NEEDS_PREVIEW
      ? [
          {
            // Um processo só: sem `&&` e sem `npm`, o que o Playwright mata
            // no teardown é o próprio servidor, e não um shell que deixa o
            // filho vivo segurando a porta.
            command: `node e2e/preview-server.mjs ${PREVIEW_PORT}`,
            url: PREVIEW_URL,
            // Nunca reusar: um servidor nesta porta ou é órfão de outra
            // execução ou é de outra pessoa, e nos dois casos serve bytes que
            // ninguém conferiu. Falhar alto é melhor do que aprovar errado.
            reuseExistingServer: false,
            timeout: 60_000,
          },
        ]
      : []),
  ],
});
