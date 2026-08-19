import { expect, test, type Page } from '@playwright/test';
import { DOC_A, PHOTO, expectDownload, openApp, primary } from './helpers';

const PATH = '/pt/pdf/marca-dagua';
const READY = { timeout: 45_000 };

/** A linha "Marcas por página" do painel: é ela que prova que houve repetição. */
const marksPerPage = (page: Page) =>
  page.locator('div.flex.justify-between', { hasText: 'Marcas por página' }).locator('span').last();

async function open(page: Page): Promise<void> {
  await openApp(page, PATH);
  await page.locator('input[type=file]').first().setInputFiles(DOC_A);
  // O canvas da prévia só existe depois que a página 1 foi rasterizada.
  await expect(page.locator('canvas')).toBeVisible(READY);
}

async function apply(page: Page): Promise<void> {
  await primary(page, "Aplicar Marca d'Água").click();
  await expect(page.locator('app-action-bar').getByRole('button', { name: 'Baixar' })).toBeVisible(
    READY,
  );
}

test.describe("Marca d'água no PDF", () => {
  /**
   * O caso que a ferramenta não atendia: vários nomes, repetidos na diagonal.
   *
   * Antes ela desenhava UMA linha de texto no centro e nada mais — sem repetição,
   * sem várias linhas e sem logo. A contagem de marcas é o que separa "repetiu"
   * de "desenhou uma e mentiu na prévia".
   */
  test('repete uma marca de várias linhas pela página inteira', async ({ page }) => {
    await open(page);

    await page.locator('#wm-text').fill('ANA SILVA\nJOAO SOUZA\nMARIA LIMA');
    await apply(page);

    const count = Number(await marksPerPage(page).innerText());
    expect(count).toBeGreaterThan(1);

    await expectDownload(page, /^doc-a-watermarked\.pdf$/, 'app-action-bar');
  });

  test('uma marca só é uma marca só, e vai para o canto pedido', async ({ page }) => {
    await open(page);

    await page.getByRole('radio', { name: 'Uma marca' }).click();
    await page.getByRole('radio', { name: 'Base à direita' }).click();
    await apply(page);

    await expect(marksPerPage(page)).toHaveText('1');
  });

  /**
   * O logo é embutido UMA vez e desenhado muitas: embutir por marca copiaria os
   * bytes da imagem a cada uso e um PNG lado a lado viraria dezenas de MB.
   */
  test('aceita um logo no lugar do texto', async ({ page }) => {
    await open(page);

    await page.getByRole('radio', { name: 'Logo' }).click();
    await page.locator('input[type=file]').first().setInputFiles(PHOTO);
    // O nome do arquivo aparecendo é o logo já decodificado e medido.
    await expect(page.getByText('photo.png')).toBeVisible(READY);

    await apply(page);
    await expectDownload(page, /^doc-a-watermarked\.pdf$/, 'app-action-bar');
  });

  /**
   * O botão principal sumia para sempre depois da primeira aplicação (`stale` era
   * `!resultBlob()`), então trocar o texto não reoferecia nada: a única saída era
   * recarregar a página.
   */
  test('reoferece a aplicação quando um ajuste muda', async ({ page }) => {
    await open(page);
    await apply(page);

    // Mesmos ajustes: apertar de novo só produziria os mesmos bytes.
    await expect(primary(page, "Aplicar Marca d'Água")).toBeHidden();

    await page.locator('#wm-text').fill('OUTRO TEXTO');
    await expect(primary(page, "Aplicar Marca d'Água")).toBeVisible();
  });

  test('recusa um arquivo que não é PDF', async ({ page }) => {
    await openApp(page, PATH);
    await page.locator('input[type=file]').first().setInputFiles(PHOTO);

    await expect(page.getByRole('alert')).toContainText('não é um PDF válido');
  });
});
