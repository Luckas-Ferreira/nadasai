import { expect, test, type Page } from '@playwright/test';
import { expectDownload, openApp, primary } from './helpers';

const PATH = '/pt/video/gravar-tela';

/** Gravar dois segundos e parar já produz um arquivo; mais tempo só custa relógio. */
const RECORD_MS = 2500;
const READY = { timeout: 45_000 };

/**
 * A única ferramenta do produto que não recebe arquivo: ela CRIA um.
 *
 * O seletor de fonte é do navegador, e é justamente por isso que este arquivo
 * precisa das flags abaixo — sem elas o `getDisplayMedia` abre um diálogo nativo
 * que o Playwright não alcança, e o teste trava esperando uma janela que ninguém
 * vai clicar. `--auto-select-desktop-capture-source` responde a esse diálogo com
 * a tela inteira, que é a resposta que uma pessoa daria.
 *
 * Ficam em `test.use` e não na `playwright.config.ts` de propósito: mexer nos
 * argumentos do navegador para a suíte inteira mudaria as condições dos outros
 * vinte e quatro arquivos para atender a um só.
 */
test.use({
  launchOptions: {
    args: [
      '--auto-select-desktop-capture-source=Entire screen',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  },
});

async function recordOnce(page: Page): Promise<void> {
  await primary(page, 'Escolher o que gravar').click();
  await expect(primary(page, 'Parar gravação')).toBeVisible(READY);

  await page.waitForTimeout(RECORD_MS);
  await primary(page, 'Parar gravação').click();

  await expect(page.getByRole('heading', { name: 'Gravação pronta' })).toBeVisible(READY);
}

test.describe('Gravador de tela', () => {
  test('oferece só os formatos que este navegador escreve, com WEBM já escolhido', async ({
    page,
  }) => {
    await openApp(page, PATH);

    const group = page.getByRole('radiogroup', { name: 'Formato' });
    const options = group.getByRole('radio');

    // O Chromium escreve os dois. Num navegador de um formato só o painel troca o
    // seletor por um texto — a asserção aqui é sobre ESTE navegador, e é por isso
    // que ela conta as opções em vez de fixar a lista.
    await expect(options).toHaveText(['WEBM', 'MP4']);
    await expect(options.first()).toHaveAttribute('aria-checked', 'true');
  });

  /**
   * A extensão do arquivo baixado é a prova, e a única que existe: não há
   * conversão depois da gravação, então o `.mp4` só aparece se a escolha chegou
   * ao `mimeType` com que o `MediaRecorder` foi construído.
   */
  test('grava no formato escolhido, e o nome do arquivo prova qual foi', async ({ page }) => {
    await openApp(page, PATH);

    await page.getByRole('radiogroup', { name: 'Formato' }).getByRole('radio', { name: 'MP4' }).click();
    await recordOnce(page);
    await expectDownload(page, /^gravacao-de-tela\.mp4$/, 'app-action-bar');
  });

  test('o padrão continua sendo WEBM', async ({ page }) => {
    await openApp(page, PATH);

    await recordOnce(page);
    await expectDownload(page, /^gravacao-de-tela\.webm$/, 'app-action-bar');
  });

  /**
   * A gravação começa uma cadeia em vez de continuar uma — é `load()`, não
   * `apply()` — e é isso que faz o par do módulo funcionar: gravar a tela e ir
   * direto tirar o áudio, sem passar pelo disco.
   */
  test('a gravação entra na sessão e alcança o extrator de áudio', async ({ page }) => {
    await openApp(page, PATH);

    await recordOnce(page);

    await page.getByRole('navigation', { name: 'Ferramentas' }).first()
      .getByRole('link', { name: 'Vídeo para áudio' }).click();

    await expect(page.locator('app-file-bar')).toContainText('gravacao-de-tela.webm');
  });
});
