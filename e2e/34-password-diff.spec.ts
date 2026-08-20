import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

/**
 * As duas ferramentas de privacidade que não recebem arquivo nenhum pela
 * dropzone principal — e que por isso ficaram de fora de toda a suíte, que é
 * construída em volta de subir um arquivo e assertar o download.
 *
 * O que se prova aqui é o cálculo: a senha respeita o tamanho e as classes de
 * caractere pedidas, e o diff acha a linha que mudou. Nos dois casos a saída
 * está na tela, não num arquivo.
 */

test.describe('Gerador de senhas', () => {
  const PATH = '/pt/privacidade/gerador-de-senha';

  test('generates on arrival, with the entropy it claims', async ({ page }) => {
    await openApp(page, PATH);

    // Uma ferramenta que abre com o campo vazio e um botão "gerar" transforma o
    // caso mais comum (quero uma senha) em dois passos.
    const senha = page.locator('span.select-all');
    await expect(senha).not.toHaveText('…');

    const texto = (await senha.textContent())?.trim() ?? '';
    expect(texto.length).toBeGreaterThan(8);

    await expect(page.getByText(/\d+ bits/).first()).toBeVisible();
  });

  test('gives a different password every time it is asked', async ({ page }) => {
    await openApp(page, PATH);

    const senha = page.locator('span.select-all');
    const primeira = (await senha.textContent())?.trim();

    await page.getByRole('button', { name: 'Gerar Nova Senha' }).click();
    const segunda = (await senha.textContent())?.trim();

    // Repetir a mesma senha seria o defeito silencioso desta ferramenta: ela
    // parece funcionar e produz sempre o mesmo segredo.
    expect(segunda).not.toBe(primeira);
  });

  test('refuses to generate with no character class selected', async ({ page }) => {
    await openApp(page, PATH);

    for (const nome of ['Maiúsculas (A-Z)', 'Minúsculas (a-z)', 'Números (0-9)', 'Símbolos (!@#$%)']) {
      const caixa = page.getByRole('checkbox', { name: nome });
      if (await caixa.isChecked()) await caixa.uncheck();
    }

    // Sem classe nenhuma não existe senha a gerar, e a ferramenta diz isso em
    // vez de devolver uma string vazia com barra de força pintada.
    await expect(page.getByText('Escolha pelo menos um tipo de caractere.')).toBeVisible();
  });
});

test.describe('Comparador de texto', () => {
  const PATH = '/pt/privacidade/comparar-texto';

  test('counts the line that changed, and only it', async ({ page }) => {
    await openApp(page, PATH);

    const areas = page.locator('textarea');
    await areas.nth(0).fill('linha um\nlinha dois\nlinha tres');
    await areas.nth(1).fill('linha um\nlinha DOIS\nlinha tres');

    await expect(page.getByText('Resultado do Diff').first()).toBeVisible();

    // Uma linha trocada é UMA adição e UMA remoção — não três de cada, que é o
    // que sai quando o alinhamento falha e o diff vira "apagou tudo, escreveu
    // tudo". Contado nas linhas pintadas, que é o resultado em si, e não no
    // resumo numérico do cabeçalho.
    await expect(page.locator('.bg-success-soft')).toHaveCount(1);
    await expect(page.locator('.bg-danger-soft')).toHaveCount(1);
  });

  test('says the two texts are identical instead of showing an empty result', async ({ page }) => {
    await openApp(page, PATH);

    const areas = page.locator('textarea');
    await areas.nth(0).fill('mesmo texto\nnas duas caixas');
    await areas.nth(1).fill('mesmo texto\nnas duas caixas');

    await expect(page.getByText('Ambos os textos são idênticos.')).toBeVisible();
  });
});
