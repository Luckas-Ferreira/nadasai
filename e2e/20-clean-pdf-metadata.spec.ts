import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { DOC_A, DOC_META, openApp, primary, upload } from './helpers';

const PATH = '/pt/privacidade/limpar-metadados-pdf';

const READY = { timeout: 30_000 };

/**
 * pdf-lib writes with object streams, so the author's name would be inside a
 * Flate stream rather than in the clear. Grepping the raw bytes would pass on a
 * file that still carries it — the decompressed output is what has to be clean.
 */
function decompressed(bytes: Buffer): string {
  const parts: string[] = [bytes.toString('latin1')];

  for (let at = bytes.indexOf('stream', 0, 'latin1'); at !== -1; at = bytes.indexOf('stream', at + 6, 'latin1')) {
    let start = at + 6;
    if (bytes[start] === 0x0d) start++;
    if (bytes[start] === 0x0a) start++;

    const end = bytes.indexOf('endstream', start, 'latin1');
    if (end === -1) break;

    try {
      parts.push(inflateSync(bytes.subarray(start, end)).toString('latin1'));
    } catch {
      // Not a Flate stream — the raw copy above already covers it.
    }
  }

  return parts.join('\n');
}

test.describe('Limpar metadados do PDF', () => {
  test('shows what the document carries, then removes it', async ({ page }, testInfo) => {
    await openApp(page, PATH);
    await upload(page, DOC_META);

    // Exact, because the raw XMP block is on the page too and contains the same
    // name — matching loosely would pass on a reader that only found one of the
    // two places it hides.
    await expect(page.getByText('Fulano de Tal', { exact: true })).toBeVisible(READY);
    await expect(page.getByText('Contrato Confidencial', { exact: true })).toBeVisible();
    await expect(page.getByText('Fixture Writer 1.0').first()).toBeVisible();

    await primary(page, 'Remover Metadados').click();
    await expect(page.getByText('Metadados removidos.')).toBeVisible(READY);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('doc-meta-clean.pdf');

    const cleaned = testInfo.outputPath('doc-meta-clean.pdf');
    await download.saveAs(cleaned);
    const text = decompressed(readFileSync(cleaned));

    // The Info dictionary and the XMP packet are reached from different places
    // and both have to go. Clearing only the trailer reference leaves the dict
    // as an orphan the writer still emits.
    expect(text).not.toContain('Fulano de Tal');
    expect(text).not.toContain('Contrato Confidencial');
    expect(text).not.toContain('xpacket');

    // And the cleaner must not fingerprint its own output: pdf-lib's load()
    // stamps Producer = "pdf-lib (…)" on the way IN unless told otherwise.
    expect(text).not.toContain('pdf-lib');

    // The document itself is untouched — this is not a rasteriser.
    expect(text).toContain('Documento com metadados');
  });

  test('says so when there is nothing to remove', async ({ page }) => {
    await openApp(page, PATH);
    await upload(page, DOC_A);

    await expect(page.getByText('Nenhum metadado de documento encontrado neste PDF.')).toBeVisible(READY);
  });
});
