import { expect, test } from '@playwright/test';
import { openApp, primary } from './helpers';

const PATH = '/pt/audio/gravar';

/**
 * O GRAVADOR DE VOZ precisa de um microfone, e num runner não existe um — o
 * Chromium resolve isso com `--use-fake-device-for-media-stream`, que entrega
 * um tom sintético, e com `--use-fake-ui-for-media-stream`, que responde ao
 * pedido de permissão sem diálogo. É a mesma ideia que o `25-screen-recorder`
 * usa para responder ao seletor de fonte, e mora aqui em vez de no config
 * compartilhado pelo mesmo motivo: nenhuma outra suíte quer um microfone falso.
 */
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

const RECORDED = { timeout: 30_000 };

test.describe('Gravador de voz', () => {
  test('abre pronto para gravar, sem pedir arquivo', async ({ page }) => {
    await openApp(page, PATH);

    // A única ferramenta de áudio que não tem dropzone: ela CRIA o arquivo.
    await expect(page.locator('input[type=file]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Começar a gravar' })).toBeEnabled();
    await expect(page.getByText('0:00').first()).toBeVisible();
  });

  test('grava, para, e entrega um áudio com o que foi gravado', async ({ page }) => {
    await openApp(page, PATH);

    await page.getByRole('button', { name: 'Começar a gravar' }).click();
    await expect(page.getByText('Gravando')).toBeVisible(RECORDED);

    // Tempo suficiente para o cronômetro andar e o gravador emitir um pedaço.
    await expect(page.getByText('0:02')).toBeVisible(RECORDED);

    await page.getByRole('button', { name: 'Parar' }).click();

    await expect(page.locator('audio')).toBeVisible(RECORDED);
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gravar de novo' })).toBeVisible();
  });

  /**
   * A gravação entra na sessão por `load()`, então ela COMEÇA uma cadeia. É o
   * que separa esta ferramenta das outras seis do módulo, e o que faz gravar →
   * cortar → converter existir sem um upload no meio.
   */
  test('a gravação entra na cadeia e pode seguir para outra ferramenta', async ({ page }) => {
    await openApp(page, PATH);

    await page.getByRole('button', { name: 'Começar a gravar' }).click();
    await expect(page.getByText('0:02')).toBeVisible(RECORDED);
    await page.getByRole('button', { name: 'Parar' }).click();
    await expect(page.locator('audio')).toBeVisible(RECORDED);

    // A barra de arquivo aparece porque a sessão passou a ter um arquivo.
    await expect(page.getByText('gravacao.webm').first()).toBeVisible(RECORDED);
  });

  test('baixa a gravação com a extensão que o navegador escreveu', async ({ page }) => {
    await openApp(page, PATH);

    await page.getByRole('button', { name: 'Começar a gravar' }).click();
    await expect(page.getByText('0:02')).toBeVisible(RECORDED);
    await page.getByRole('button', { name: 'Parar' }).click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(RECORDED);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^gravacao\.(webm|m4a)$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);

    expect(Buffer.concat(chunks).byteLength).toBeGreaterThan(500);
  });

  /** Não há botão primário: gravar não é uma operação sobre um arquivo. */
  test('não oferece um botão de aplicar', async ({ page }) => {
    await openApp(page, PATH);

    await expect(primary(page, 'Aplicar')).toHaveCount(0);
  });
});
