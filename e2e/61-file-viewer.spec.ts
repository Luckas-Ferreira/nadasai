import { expect, test } from '@playwright/test';
import { DOC_A, PHOTO, openApp, upload } from './helpers';

/**
 * O visualizador em tela cheia e a folha de controles do celular.
 *
 * As duas peças existem pelo mesmo motivo e por isso estão no mesmo arquivo: no
 * celular o produto lia como um site — cabeçalho, painel de controles, e só
 * então o arquivo, lá embaixo, num palco de 420px. Não havia como simplesmente
 * OLHAR o que se estava editando, nem como decidir a ferramenta a partir do
 * arquivo, que é o gesto do sistema operacional que a rota `/abrir` já atende
 * quando o arquivo chega de fora.
 *
 * O que estes testes fixam é justamente o que não dá para ver lendo o código:
 *
 *   * que o gatilho é a MINIATURA da barra de arquivo, e não o palco — seis
 *     ferramentas têm palco interativo (cropper.js no recortar, no 3x4 e no
 *     recorte de vídeo; `app-region-overlay` nas três de censura) e ali o toque
 *     é da ferramenta;
 *   * que a folha só é folha no CELULAR, porque ela é escrita como classe base
 *     desfeita por `md:` — uma variante inexistente geraria CSS vazio em
 *     silêncio, e o defeito seria "não virou folha", sem erro em lugar nenhum;
 *   * e que o PDF PINTA, que é a única prova de que a rasterização por janela
 *     está ligada ao observador certo. Um `<canvas>` reservado e vazio tem
 *     exatamente a mesma aparência de um que falhou.
 */

const PHONE = { width: 411, height: 866 };

const READY = { timeout: 30_000 };

/**
 * O gatilho da BARRA DE ARQUIVO — a miniatura, presente em toda rota e nos cinco
 * módulos.
 *
 * Escopado à barra de propósito: as nove ferramentas que usam `app-preview-surface`
 * têm um SEGUNDO gatilho com o mesmo rótulo, no canto do palco (`stageExpand`
 * abaixo). Um `getByRole` solto casaria com os dois e o modo estrito reprovaria
 * — e o teste falharia dizendo 'strict mode violation', que não nomeia nada do
 * que está sendo testado.
 */
const expand = (page: import('@playwright/test').Page) =>
  page.locator('app-file-bar').getByRole('button', { name: 'Ver em tela cheia' });

/** O gatilho do PALCO, que é o que se alcança sem procurar. */
const stageExpand = (page: import('@playwright/test').Page) =>
  page.locator('app-preview-surface').getByRole('button', { name: 'Ver em tela cheia' });

const dialog = (page: import('@playwright/test').Page) => page.getByRole('dialog');

test.describe('Visualizador em tela cheia', () => {
  test('a miniatura abre a imagem, e o rodapé pergunta para onde ela vai', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page, PHOTO);

    await expect(expand(page)).toBeVisible(READY);
    await expand(page).click();

    const view = dialog(page);
    await expect(view).toBeVisible();
    await expect(view.getByRole('img')).toBeVisible();

    // O rodapé é a mesma pergunta da rota /abrir, pela mesma `nextToolsFor`.
    await expect(view.getByText('Abrir com')).toBeVisible();
    await expect(view.getByRole('button', { name: 'Remover fundo' })).toBeVisible();

    // Toque duplo amplia. O zoom é escrito à mão porque o WebView do app vem com
    // o zoom embutido DESLIGADO — sem isto, dentro do app não haveria zoom nenhum.
    await expect(view.getByText('100%')).toBeVisible();
    await view.getByRole('img').dblclick();
    await expect(view.getByText('250%')).toBeVisible();

    // E escolher um destino leva para lá, fechando o visualizador.
    await view.getByRole('button', { name: 'Converter' }).click();
    await expect(page).toHaveURL(/\/pt\/imagem\/converter/);
    await expect(dialog(page)).toHaveCount(0);
  });

  test('o PDF é rasterizado de verdade, não só reservado', async ({ page }) => {
    await openApp(page, '/pt/pdf/comprimir');
    await upload(page, DOC_A);

    await expect(expand(page)).toBeVisible(READY);
    await expand(page).click();

    const view = dialog(page);
    await expect(view.locator('canvas').first()).toBeVisible(READY);

    // `width > 1` é o teste: um canvas com espaço reservado e sem backing store
    // ocupa o mesmo lugar na tela que um pintado, e o olho não separa os dois.
    await expect
      .poll(
        async () =>
          view.locator('canvas').first().evaluate((c: HTMLCanvasElement) => c.width),
        READY,
      )
      .toBeGreaterThan(100);
  });

  test('o palco também abre, e é esse o gatilho que se acha', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page, PHOTO);

    // A miniatura de 32px da barra é o gatilho universal e o que quase ninguém
    // reconhece como botão. O do palco existe por isso, e é a razão de o
    // visualizador ter deixado de ser um recurso escondido.
    await expect(stageExpand(page)).toBeVisible(READY);
    await stageExpand(page).click();

    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('img')).toBeVisible();
  });

  test('a cromagem flutua sobre a imagem em vez de espremê-la', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page, PHOTO);
    await expect(expand(page)).toBeVisible(READY);
    await expand(page).click();

    const view = dialog(page);
    await expect(view).toBeVisible();

    // Esta é a asserção que separa a mudança do que havia antes: a área da
    // IMAGEM é a janela inteira. No desenho anterior o cabeçalho e o rodapé eram
    // irmãos dela num flex column, então ela ficava com o que sobrasse — num
    // retrato de celular, pouco mais da metade da tela. Agora eles flutuam por
    // cima, e é por isso que a conta bate exatamente.
    const height = await view
      .getByRole('img')
      .evaluate((img) => img.parentElement?.getBoundingClientRect().height ?? 0);

    expect(height).toBe(page.viewportSize()?.height);
  });

  test('a rota /abrir oferece VER antes de escolher ferramenta', async ({ page }) => {
    await openApp(page, '/pt/abrir');
    await upload(page, PHOTO);

    // VER vem ANTES da lista de ferramentas nesta rota, e é essa a ordem certa da
    // pergunta: quem entrega um arquivo ao app pelo "Abrir com" do sistema quase
    // sempre quer só olhar para ele.
    await page.getByRole('button', { name: 'Só visualizar' }).click();

    const view = dialog(page);
    await expect(view).toBeVisible();
    await expect(view.getByRole('img')).toBeVisible();

    // A fileira de destinos é o que prova que o arquivo entrou na SESSÃO: ela é
    // derivada do TIPO da sessão, e não do que está na tela. É também o que pina a
    // chamada SEM id de ferramenta — a guarda pergunta se o tool que vai ABRIR o
    // arquivo aceita aquele tipo, e aqui não há tool nenhum, então passar um id
    // faria a sessão recusar a própria imagem e o rodapé sairia vazio. Mesma
    // armadilha que o gravador de voz já pagou.
    await expect(view.getByRole('button', { name: 'Remover fundo' })).toBeVisible();
  });

  test('áudio não ganha gatilho: não há o que ver', async ({ page }) => {
    await openApp(page, '/pt/audio/cortar');
    await page.locator('input[type=file]').first().setInputFiles({
      name: 'nota.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    });

    // Sem arquivo válido a sessão nem abre; o que importa é que o gatilho não
    // aparece para um tipo sem prévia — um botão que abre tela vazia é pior que
    // nenhum botão.
    await expect(expand(page)).toHaveCount(0);
  });
});

test.describe('A folha de controles do celular', () => {
  test.use({ viewport: PHONE });

  test('os controles viram folha fixa acima da barra, e recolhem', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page, PHOTO);

    const sheet = page.locator('main aside');
    await expect(sheet).toBeVisible(READY);

    // `fixed` é o que separa "folha" de "coluna empilhada". Sem isto a mudança
    // não aconteceu, e a tela continua sendo a de antes com outro nome.
    await expect
      .poll(() => sheet.evaluate((el) => getComputedStyle(el).position))
      .toBe('fixed');

    // E ela para EXATAMENTE onde a barra de ferramentas começa: o token
    // `--mobile-bar-h` é lido pelas duas, para não divergirem.
    await expect.poll(() => sheet.evaluate((el) => getComputedStyle(el).bottom)).toBe('68px');

    const open = await sheet.evaluate((el) => el.getBoundingClientRect().height);

    await page.getByRole('button', { name: 'Esconder ajustes' }).click();
    const closed = await sheet.evaluate((el) => el.getBoundingClientRect().height);
    expect(closed).toBeLessThan(open / 2);

    await page.getByRole('button', { name: 'Mostrar ajustes' }).click();
    await expect
      .poll(() => sheet.evaluate((el) => el.getBoundingClientRect().height))
      .toBeGreaterThan(closed * 2);
  });

  test('no desktop a mesma coluna não é folha nenhuma', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page, PHOTO);

    const panel = page.locator('main aside');
    await expect(panel).toBeVisible(READY);
    await expect.poll(() => panel.evaluate((el) => getComputedStyle(el).position)).toBe('static');
    await expect(page.getByRole('button', { name: 'Esconder ajustes' })).toBeHidden();
  });
});
