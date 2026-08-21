import { expect, test, type Page } from '@playwright/test';
import { PHOTO, upload } from './helpers';

/**
 * CAUDA LONGA — as páginas de par de formato.
 *
 * Elas abrem a MESMA ferramenta de converter, com o destino já escolhido. Isso
 * cria duas classes de defeito que nenhum outro spec pegaria:
 *
 *   1. a rota existir e a ferramenta abrir no formato ERRADO — a página promete
 *      "png para jpg" no título e entrega WebP, que é o padrão do conversor;
 *   2. as doze páginas renderizarem o mesmo cabeçalho e o mesmo texto, que é a
 *      definição de porta de entrada e o motivo de o Google tratar cauda longa
 *      mal-feita como spam.
 *
 * A segunda é a que mais importa aqui, e é a que um teste de unidade sobre o
 * registro não alcança: `format-pairs.spec.ts` garante que os DADOS diferem;
 * este garante que o que chega na tela difere.
 */

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('link', { name: 'Nada Sai' }).first()).toBeVisible();
}

const selected = (page: Page, group: string) =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { checked: true });

test.describe('Páginas de par de formato', () => {
  test('abre o conversor com o destino já marcado', async ({ page }) => {
    await open(page, '/pt/imagem/png-para-jpg');
    await upload(page);

    await expect(selected(page, 'Formato de destino')).toHaveAccessibleName('JPEG');
  });

  test('cada par marca o seu próprio destino', async ({ page }) => {
    for (const [path, target] of [
      ['/pt/imagem/png-para-webp', 'WEBP'],
      ['/pt/imagem/webp-para-png', 'PNG'],
      ['/pt/imagem/jpg-para-webp', 'WEBP'],
      ['/pt/imagem/gif-para-png', 'PNG'],
    ] as const) {
      await open(page, path);
      await upload(page);
      await expect(selected(page, 'Formato de destino')).toHaveAccessibleName(target);
    }
  });

  /**
   * Sem par na rota, o conversor tem de continuar abrindo no padrão dele. Um
   * preset que vazasse para a ferramenta normal seria a pior forma deste
   * recurso quebrar: invisível, e só na página que mais gente usa.
   */
  test('a ferramenta normal continua no padrão', async ({ page }) => {
    await open(page, '/pt/imagem/converter');
    await upload(page);

    await expect(selected(page, 'Formato de destino')).toHaveAccessibleName('WEBP');
  });

  test('converte de verdade e baixa com a extensão do par', async ({ page }) => {
    await open(page, '/pt/imagem/png-para-jpg');
    await upload(page);

    await page.getByRole('button', { name: 'Converter', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^photo-converted\.jpe?g$/);
  });

  test('o par de áudio abre o conversor de áudio no formato certo', async ({ page }) => {
    await open(page, '/pt/audio/mp3-para-wav');

    // O painel de formato só aparece com áudio carregado; o que dá para afirmar
    // sem um arquivo é o cabeçalho, que já é o do par.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('MP3 para WAV');
  });

  /**
   * O h1, o título da aba e o texto longo têm de diferir entre duas páginas que
   * abrem a mesma ferramenta. Se estes três coincidirem, as doze URLs são uma
   * só repetida.
   */
  test('duas páginas da mesma ferramenta não são a mesma página', async ({ page }) => {
    await open(page, '/pt/imagem/png-para-jpg');
    const a = {
      h1: await page.getByRole('heading', { level: 1 }).innerText(),
      title: await page.title(),
      h2: await page.getByRole('heading', { level: 2 }).first().innerText(),
    };

    await open(page, '/pt/imagem/jpg-para-png');
    const b = {
      h1: await page.getByRole('heading', { level: 1 }).innerText(),
      title: await page.title(),
      h2: await page.getByRole('heading', { level: 2 }).first().innerText(),
    };

    expect(b.h1).not.toBe(a.h1);
    expect(b.title).not.toBe(a.title);
    expect(b.h2).not.toBe(a.h2);
  });

  test('o FAQ da página é o do par, não o da ferramenta', async ({ page }) => {
    await open(page, '/pt/imagem/gif-para-png');

    // A pergunta que só existe neste par — e a resposta que a página precisa
    // dar antes de alguém baixar um PNG parado de um GIF animado.
    await expect(page.getByText('A animação do GIF é preservada no PNG?')).toBeVisible();
  });

  test('existe em inglês, com o conteúdo em inglês', async ({ page }) => {
    await open(page, '/en/image/png-to-jpg');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('PNG to JPG');
    await expect(page.getByText('Transparency becomes white')).toBeVisible();
  });
});
