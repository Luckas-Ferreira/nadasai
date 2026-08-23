import { expect, test, type Page } from '@playwright/test';
import { DOC_A, decompressedPdf, expectDownload, openApp, primary, upload } from './helpers';

const PATH = '/pt/pdf/desbloquear';

/** Rasterizar a 200 DPI leva alguns segundos por página. */
const UNLOCKED = { timeout: 60_000 };
const READY = { timeout: 30_000 };

/**
 * O DESBLOQUEAR é o inverso do proteger, e a asserção que importa é a que
 * separa os dois: o arquivo que sai NÃO tem dicionário de criptografia, e ainda
 * assim continua pesquisável — a camada de texto é redesenhada por baixo do
 * raster, com opacidade zero.
 *
 * Um teste que só conferisse "baixou um PDF" passaria por cima das duas coisas.
 *
 * O caminho da senha em si é o do prompt compartilhado, que o `18-protect` e as
 * outras ferramentas de PDF já cobrem; aqui o que se cobre é o caso comum de
 * verdade — o PDF que ABRE sozinho e mesmo assim carrega restrição de
 * permissão.
 */
const stateCell = (page: Page) => page.locator('dl div', { hasText: 'Proteção' }).locator('dd');

async function openDoc(page: Page): Promise<void> {
  await openApp(page, PATH);
  await upload(page, DOC_A);
  await expect(page.getByText('Páginas', { exact: true })).toBeVisible(READY);
}

test.describe('Desbloquear PDF', () => {
  /**
   * A maioria dos PDFs "protegidos" abre sem senha e só recusa imprimir e
   * copiar. Dizer "abre sem senha" e parar por aí daria a entender que não há
   * nada a fazer, que é o contrário da verdade.
   */
  test('um PDF que abre sem senha é aceito, e a página explica por quê', async ({ page }) => {
    await openDoc(page);

    await expect(stateCell(page)).toHaveText('Abre sem senha');
    await expect(page.getByRole('alert')).toContainText('restrição é de PERMISSÃO');
    await expect(primary(page, 'Remover a proteção')).toBeEnabled();
  });

  /** O custo aparece ANTES de processar, não depois. */
  test('diz o que muda no arquivo antes de qualquer processamento', async ({ page }) => {
    await openDoc(page);

    await expect(page.getByText('cada página vira uma imagem').first()).toBeVisible();
    await expect(page.getByText('Ctrl+F continua funcionando').first()).toBeVisible();
  });

  test('remove a proteção e baixa com o nome derivado do original', async ({ page }) => {
    await openDoc(page);

    await primary(page, 'Remover a proteção').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(UNLOCKED);

    await expectDownload(page, /^doc-a-desbloqueado\.pdf$/);
  });

  /**
   * As duas garantias, nos bytes: nada de `/Encrypt`, e a camada de texto
   * invisível preservada. A segunda é o que separa este resultado de uma
   * fotografia do documento.
   */
  test('o PDF sai sem criptografia e continua pesquisável', async ({ page }) => {
    await openDoc(page);

    await primary(page, 'Remover a proteção').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible(UNLOCKED);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar', exact: true }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.toString('latin1')).not.toContain('/Encrypt');

    // A página virou imagem: o XObject aparece nos bytes crus, porque a
    // especificação proíbe pôr fluxo dentro de object stream.
    expect(bytes.toString('latin1')).toContain('/Image');

    /**
     * E a CAMADA DE TEXTO sobreviveu — a asserção que separa este resultado de
     * uma fotografia do documento. Ela mora no fluxo de conteúdo, comprimido,
     * então é preciso descomprimir: nos bytes crus esta busca falharia mesmo
     * com a camada intacta.
     */
    const inflated = decompressedPdf(bytes);
    expect(inflated).toContain('/Font');

    // Em HEXADECIMAL: o pdf-lib codifica string de texto como `<...>` mesmo com
    // fonte padrão, então procurar as letras em claro falharia com a camada
    // perfeitamente presente.
    const asHex = Buffer.from('Documento', 'latin1').toString('hex');
    expect(inflated.toLowerCase()).toContain(asHex.toLowerCase());
  });

  test('rejeita um arquivo que não é PDF', async ({ page }) => {
    await openApp(page, PATH);
    await page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('nada') });

    await expect(page.getByRole('alert')).toBeVisible();
  });
});
