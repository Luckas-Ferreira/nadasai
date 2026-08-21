import { expect, test, type Page } from '@playwright/test';
import { PHOTO, DOC_A, expectDownload, primary } from './helpers';

/**
 * A METADE INGLESA DO PRODUTO, DIRIGIDA DE VERDADE.
 *
 * Metade das URLs indexadas é `/en/...` e, até esta suíte, duas delas apareciam
 * em 38 arquivos de spec — e só como caminho passado para `goto`, nunca como
 * ferramenta exercitada. `21-prerender` confere os BYTES que o crawler recebe,
 * o que é outra coisa: ele acharia um `<title>` inglês numa página cuja
 * interface está em português.
 *
 * E era exatamente esse o defeito. Uma varredura dos templates achou 68 trechos
 * de interface fora do dicionário — "Gerando miniaturas…", "Formato final",
 * "Página X de Y", os `<option>` de idioma do OCR, o painel inteiro do editor —,
 * todos aparecendo em português no meio da tela em inglês. `check-templates`
 * agora impede que voltem pela leitura do fonte; isto é a outra ponta: prova no
 * navegador que o que está na tela é inglês, com o dicionário de verdade
 * carregado e a ferramenta rodando.
 *
 * O `openApp` dos helpers assume português e não serve aqui.
 */

/** Palavras que só existem em português e que nenhuma marca ou formato usa. */
const PT_ONLY = [
  'Baixar',
  'Escolher arquivo',
  'Página',
  'Arquivo',
  'Processando',
  'Tamanho',
  'Miniaturas',
  'Recomeçar',
  'Enviar para',
  'Selecionar',
];

async function openEnglish(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('link', { name: 'Nada Sai' }).first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
}

/**
 * Nenhuma palavra exclusivamente portuguesa no texto VISÍVEL.
 *
 * Lê `innerText` e não `textContent` de propósito: o segundo traz o conteúdo de
 * ramos escondidos — o outro estado de um `@if`, um painel fechado — e acusaria
 * texto que ninguém vê. O que interessa é o que está na tela.
 */
async function expectNoPortuguese(page: Page): Promise<void> {
  const text = await page.locator('main').innerText();

  for (const word of PT_ONLY) {
    expect(text, `"${word}" na interface em inglês`).not.toContain(word);
  }
}

test.describe('A metade inglesa', () => {
  test('a home em inglês fala inglês', async ({ page }) => {
    await openEnglish(page, '/en');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoPortuguese(page);
  });

  test('converter roda inteiro em inglês e baixa com o nome certo', async ({ page }) => {
    await openEnglish(page, '/en/image/convert');
    await expectNoPortuguese(page);

    await page.locator('input[type=file]').first().setInputFiles(PHOTO);

    // Com arquivo na tela é que aparece a maior parte do texto: painel de
    // opções, barra do arquivo, barra de ações.
    await expectNoPortuguese(page);

    await page
      .getByRole('radiogroup', { name: 'Target format' })
      .getByRole('radio', { name: 'WEBP', exact: true })
      .click();

    await primary(page, 'Convert').click();
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await expectNoPortuguese(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^photo-converted\.webp$/);
  });

  /**
   * O módulo de PDF é onde estava a maior concentração de português cravado: as
   * miniaturas, a contagem de páginas selecionadas, os rótulos de intervalo. Um
   * PDF aberto acende todos eles de uma vez.
   */
  test('dividir PDF mostra miniaturas e contagem em inglês', async ({ page }) => {
    await openEnglish(page, '/en/pdf/split');
    await page.locator('input[type=file]').first().setInputFiles(DOC_A);

    await expect(page.getByRole('img').first()).toBeVisible({ timeout: 30_000 });
    await expectNoPortuguese(page);
  });

  /**
   * A cadeia é o produto, e ela atravessa módulos. Se o idioma se perdesse numa
   * navegação interna, seria aqui: cruzar de imagem para PDF é a única troca que
   * muda a lista inteira do rail.
   */
  test('a cadeia atravessa módulos sem cair para o português', async ({ page }) => {
    await openEnglish(page, '/en/image/crop');
    await page.locator('input[type=file]').first().setInputFiles(PHOTO);

    await page.getByRole('link', { name: /PDF/ }).first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveURL(/\/en\//);

    await expectNoPortuguese(page);
  });

  /**
   * As três páginas institucionais eram, cada uma, dois documentos escritos à
   * mão — um por idioma — e derivaram: descreviam "uma ferramenta de edição de
   * imagens" com cinco ferramentas, e a data de atualização era de julho de
   * 2025. Passaram a ler o dicionário; isto prova que a metade inglesa é a que
   * chega em `/en`.
   */
  test('sobre, privacidade e termos existem em inglês e falam do produto atual', async ({ page }) => {
    await openEnglish(page, '/en/about');
    // `.first()`: "47 tools" aparece no parágrafo de abertura E no cabeçalho da
    // lista de módulos, e no modo estrito duas correspondências são erro.
    await expect(page.getByText('47 tools').first()).toBeVisible();
    await expectNoPortuguese(page);

    await openEnglish(page, '/en/privacy');
    await expect(page.getByText(/Last updated/)).toBeVisible();
    await expectNoPortuguese(page);

    await openEnglish(page, '/en/terms');
    await expect(page.getByRole('heading', { name: /Description of the service/ })).toBeVisible();
    await expectNoPortuguese(page);
  });
});
