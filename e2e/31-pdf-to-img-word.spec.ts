import { expect, test } from '@playwright/test';
import { DOC_LONG, NOT_AN_IMAGE, SCAN, expectDownload, openApp, primary, upload } from './helpers';

/**
 * As duas saídas que deixam o formato PDF para trás. O que elas têm em comum é
 * que o resultado só é verificável pelo nome do arquivo: a partir daí são bytes
 * de zip e de docx, que o navegador não abre para o teste conferir.
 *
 * O nome, porém, prova o essencial — a extensão diz que o codificador certo
 * rodou, e o sufixo diz que a sessão manteve o rastro do arquivo de origem em
 * vez de inventar um nome novo.
 */

/** Rasterizar seis páginas, ou extrair texto de uma digitalização. */
const READY = { timeout: 90_000 };

test.describe('PDF para imagem', () => {
  const PATH = '/pt/pdf/para-imagem';

  test('turns several pages into a zip of images', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_LONG);

    await expect(primary(page, 'Converter em Imagens')).toBeVisible(READY);
    await primary(page, 'Converter em Imagens').click();

    await expectDownload(page, /\.zip$/);
  });

  test('a single page comes back as one image, not a zip', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, SCAN);

    await expect(primary(page, 'Converter em Imagens')).toBeVisible(READY);
    await primary(page, 'Converter em Imagens').click();

    // Um arquivo só não é um zip — é a mesma distinção que o `resultKind` da
    // barra de ações usa para decidir o que oferecer depois.
    await expectDownload(page, /\.(png|jpe?g|webp)$/);
  });

  test('rejects a file that is not a PDF', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(primary(page, 'Converter em Imagens')).toHaveCount(0);
  });
});

test.describe('PDF para Word', () => {
  const PATH = '/pt/pdf/para-word';

  test('writes a .docx out of a text PDF', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_LONG);

    await expect(primary(page, 'Converter para Word')).toBeVisible(READY);
    await primary(page, 'Converter para Word').click();

    // `doc-long.docx`, e não `doc-long-word.docx`: aqui a extensão já diz o que
    // aconteceu, então a ferramenta troca a extensão em vez de acrescentar o
    // `suffix: 'word'` que declara em `tools.ts`. É a segunda ferramenta com nome
    // fora do padrão (a outra é dividir) e as duas ficam pinadas como estão —
    // renomear download é decisão de produto, não efeito colateral de teste.
    await expectDownload(page, /^doc-long\.docx$/);
  });

  test('rejects a file that is not a PDF', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(primary(page, 'Converter para Word')).toHaveCount(0);
  });
});
