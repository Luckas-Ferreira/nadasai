import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { DOC_A, DOC_LONG, NOT_AN_IMAGE, openApp, upload } from './helpers';

/**
 * Conta pixels escuros e claros do canvas já pintado.
 *
 * Os dois números juntos é que dizem alguma coisa: a folha branca dá os claros,
 * o texto dá os escuros, e um canvas com o render pendente não tem nenhum dos
 * dois porque continua transparente.
 */
async function inkOf(canvas: Locator): Promise<{ dark: number; light: number }> {
  return canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext('2d');
    if (!ctx) return { dark: 0, light: 0 };

    const { data } = ctx.getImageData(0, 0, el.width, el.height);
    let dark = 0;
    let light = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      if (data[i] < 100) dark++;
      else if (data[i] > 200) light++;
    }
    return { dark, light };
  });
}

const PATH = '/pt/pdf/editar';

/** Abrir, rasterizar e detectar os blocos de texto de uma página. */
const READY = { timeout: 60_000 };

/**
 * O editor é a maior ferramenta do produto (perto de 2000 linhas) e era a única
 * sem nenhuma cobertura funcional: os probes `debug-*` que existiam dependem de
 * um PDF real solto na raiz e pulam sozinhos quando não o encontram, o que em CI
 * é sempre.
 *
 * O teste mais importante aqui é o do CANVAS PINTADO, e é por causa da forma da
 * falha que ele existe. Quando o `Promise.try` do pdf.js não repassa argumentos,
 * `page.render()` fica pendente para sempre: nenhuma exceção é lançada, a página
 * fica meio pintada, e a sobreposição de texto cai no ramo de "canvas falhou" e
 * desenha texto preto por cima. Ou seja: a tela continua parecendo um documento,
 * e nada no console diz o contrário. Só um pixel lido de volta separa "renderizou"
 * de "quase renderizou".
 */
test.describe('Editor de PDF', () => {
  test('paints the page canvas, and does not merely mount it', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_A);

    const canvas = page.locator('canvas[data-page]').first();
    await expect(canvas).toBeVisible(READY);

    // O backing store tem que existir de verdade: um canvas sem `width` é o
    // estado em que o render nunca começou.
    await expect
      .poll(async () => canvas.evaluate((el: HTMLCanvasElement) => el.width), READY)
      .toBeGreaterThan(0);

    // E tem que haver tinta. A fixture é texto preto sobre folha branca, então
    // "pintou" significa: existe pixel escuro E existe pixel claro. Um canvas
    // com render pendente continua transparente e não tem nenhum dos dois.
    //
    // O `poll` é sobre o claro porque o pdf.js pinta em pedaços: a folha chega
    // antes do texto, e medir os dois de uma vez daria uma falha intermitente
    // com a metade certa.
    await expect.poll(async () => (await inkOf(canvas)).light, READY).toBeGreaterThan(1000);

    const ink = await inkOf(canvas);
    expect(ink.dark).toBeGreaterThan(50);
  });

  test('finds the text blocks that are in the document', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_A);

    // A extração é o que separa este editor de um visualizador: sem blocos não
    // há o que editar, e a página renderizada continuaria parecendo correta.
    await expect(page.locator('[data-block-id]').first()).toBeVisible(READY);
    await expect(page.getByText('Documento A - pagina 1').first()).toBeVisible();
  });

  test('exports a PDF named after the document', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_A);
    await expect(page.locator('[data-block-id]').first()).toBeVisible(READY);

    // O editor não produz um "resultado" para a barra de ações oferecer depois:
    // exportar É o download, num passo só.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar PDF', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^doc-a-edited\.pdf$/);
  });

  test('walks a longer document page by page', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_LONG);
    await expect(page.locator('canvas[data-page]').first()).toBeVisible(READY);

    // Só as páginas perto da viewport guardam canvas; as outras são liberadas e
    // rasterizadas de novo ao voltar. Navegar é o caminho que exercita isso.
    //
    // O indicador do EDITOR ("Página N de 6", com acento), nunca o texto
    // impresso na página ("Pagina N de 6", sem acento, que é o que a fixture
    // escreve). A asserção era sobre o segundo, e ela passava no Windows e
    // reprovava no Linux do CI em toda execução: o agrupamento de blocos do
    // pdf.js depende das métricas de fonte da plataforma, e lá a etiqueta
    // chegava quebrada em "Pagina de 6" + "2". O acento é o que separa os
    // dois, e o indicador é o que este teste queria conferir desde sempre.
    await page.getByRole('button', { name: 'Próxima página' }).click();
    await expect(page.getByText('Página 2 de 6').first()).toBeVisible(READY);

    await page.getByRole('button', { name: 'Página anterior' }).click();
    await expect(page.getByText('Página 1 de 6').first()).toBeVisible(READY);
  });

  test('rejects a file that is not a PDF', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('canvas[data-page]')).toHaveCount(0);
  });
});
