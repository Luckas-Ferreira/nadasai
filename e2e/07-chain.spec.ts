import { expect, test } from '@playwright/test';
import { expectDownload, openApp, pickFromHome, primary, upload } from './helpers';

const rail = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Ferramentas' }).first();

test.describe('The chain', () => {
  test('compress → resize → convert seamlessly transitions directly between tools', async ({ page }) => {
    // Entered through a tool rather than the home: the home has no uploader any
    // more (see the fixme in 01-shell), so the first tool is where a file gets in.
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page);
    await expect(page.getByText('photo.png')).toBeVisible();

    await primary(page, 'Comprimir').click();
    // Clicking the "Redimensionar" chip under "Continuar com" transitions directly
    await page.getByRole('button', { name: 'Redimensionar' }).click();
    await expect(page.getByText('photo-min.png')).toBeVisible();

    await page.getByRole('button', { name: '400', exact: true }).click();
    await primary(page, 'Redimensionar').click();

    // Clicking "Converter" chip under "Continuar com" transitions directly
    await page.getByRole('button', { name: 'Converter' }).click();

    // Suffixes must not stack: photo.png, never resized-min-photo.png.
    await expect(page.getByText('photo-resized.png')).toBeVisible();
    await expect(page.getByText('Comprimir  →  Redimensionar')).toBeVisible();

    await page
      .getByRole('radiogroup', { name: 'Formato de destino' })
      .getByRole('radio', { name: 'PNG' })
      .click();
    await primary(page, 'Converter').click();
    await expectDownload(page, /^photo-converted\.png$/);
  });

  /**
   * The rail hands the file to a sibling tool without going home. Clicking a rail
   * tool while a result is pending automatically commits the result into the chain.
   */
  test('the rail auto-commits pending results and hands the file to a sibling tool', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page);
    await primary(page, 'Comprimir').click();

    // Espera o resultado EXISTIR antes de sair pelo trilho. Diferente do chip, o
    // link do trilho está na tela desde o começo, então não há nada nele para o
    // Playwright esperar: sem esta linha o clique chega antes do fim da
    // compressão, a navegação commita um resultado que ainda não existe e o
    // teste acusa a ferramenta por uma corrida que é dele.
    await expect(
      page.locator('app-action-bar').getByRole('button', { name: 'Baixar' }),
    ).toBeVisible({ timeout: 30_000 });

    // Clicking Converter on the rail while a result is pending auto-commits and navigates
    await rail(page).getByRole('link', { name: 'Converter' }).click();
    await expect(page.getByText('Solte uma imagem aqui')).toHaveCount(0);
    await expect(page.getByText('photo-min.png')).toBeVisible();
  });


  /**
   * Sair de uma ferramenta para a home era mão única: o arquivo continuava na
   * barra e voltar significava caçar a ferramenta na grade outra vez. O nome do
   * arquivo leva de volta para onde ele estava sendo mexido.
   */
  test('o nome do arquivo na barra leva de volta para a última ferramenta', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page);
    await primary(page, 'Comprimir').click();

    await page.getByRole('link', { name: 'Nada Sai' }).first().click();
    await expect(page.getByRole('heading', { name: 'Imagem pronta' })).toBeVisible();

    const back = page.locator('app-file-bar').getByRole('button', { name: 'Voltar para Comprimir' });
    await expect(back).toBeVisible();
    await back.click();

    await expect(page).toHaveURL(/\/pt\/imagem\/comprimir$/);
    // Chegou com o arquivo, não num dropzone vazio.
    await expect(page.getByText('Solte uma imagem aqui')).toHaveCount(0);
  });

  /** Já estando na ferramenta, o nome é só texto: um botão que não sai do lugar. */
  test('não oferece voltar para a ferramenta em que já se está', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page);

    await expect(
      page.locator('app-file-bar').getByRole('button', { name: 'Voltar para' }),
    ).toHaveCount(0);
  });

  test('Clear drops the file everywhere', async ({ page }) => {
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page);
    await expect(page.getByText('photo.png')).toBeVisible();

    // Cleared from the home only because that is where this test happens to be:
    // hydration is an effect now, so `clear()` also empties the tool you are
    // standing in. "Everywhere" is what still needs proving — the NEXT tool.
    await page.getByRole('link', { name: 'Nada Sai' }).first().click();
    await page.getByRole('button', { name: 'Limpar' }).click();

    // The home is back to pitching rather than asking what is next.
    await expect(page.getByText('O que você quer fazer com ela?')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Seus arquivos não saem do seu dispositivo.' }),
    ).toBeVisible();

    await pickFromHome(page, 'Cortar');
    await expect(page.getByText('Solte uma imagem aqui')).toBeVisible();
  });
});
