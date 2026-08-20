import { expect, test, type Page } from '@playwright/test';
import { DOC_A, openApp, primary, upload, uploadTextImage } from './helpers';
import { PREVIEW_URL } from './ports';

/**
 * A CSP, exercitada contra o build de produção com os headers de produção.
 *
 * Roda na :4300 e não no `ng serve` por dois motivos: o `_headers` só é aplicado
 * pelo servidor de preview (que o lê do arquivo real, em vez de repetir uma
 * cópia), e uma diretiva apertada demais só quebra onde os assets são servidos
 * como o host os serve.
 *
 * O QUE ESTE ARQUIVO PROTEGE. `connect-src 'self'` é a versão obrigatória da
 * promessa do produto: o `NetworkProbeService` conta o que sai, a CSP impede que
 * saia. O preço de errar para o lado apertado é alto e silencioso — sem
 * 'wasm-unsafe-eval' o OCR e a remoção de fundo somem, sem `blob:` em worker-src
 * o worklet de áudio não sobe, sem `blob:` em img-src nenhuma prévia aparece. Em
 * todos esses casos a tela não mostra erro: a ferramenta simplesmente não faz
 * nada. Por isso o teste não confere a string do header e vai embora; ele roda
 * as ferramentas e falha se QUALQUER violação for disparada.
 */
test.use({ baseURL: PREVIEW_URL });

interface CspWindow extends Window {
  __cspViolations?: string[];
}

/** Instala o coletor antes de qualquer script da página rodar. */
async function collectViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    (window as CspWindow).__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as CspWindow).__cspViolations?.push(
        `${event.violatedDirective} blocked ${event.blockedURI}`,
      );
    });
  });

  return async () => page.evaluate(() => (window as CspWindow).__cspViolations ?? []);
}

test.describe('Content Security Policy', () => {
  test('is served, and closes connect-src to this origin', async ({ request }) => {
    const response = await request.get('/pt');
    const csp = response.headers()['content-security-policy'];

    expect(csp).toBeTruthy();

    // A diretiva que carrega a tese: nenhum destino de rede que não seja esta
    // origem. `data:` e `blob:` são o próprio arquivo do usuário, que nunca sai
    // da aba.
    expect(csp).toContain("connect-src 'self' data: blob:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");

    // Wasm sim, eval de JavaScript não.
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");

    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['referrer-policy']).toBe('no-referrer');
  });

  test('the shell boots with no violation', async ({ page }) => {
    const violations = await collectViolations(page);

    await openApp(page, '/pt');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    expect(await violations()).toEqual([]);
  });

  test('reading and rasterising a PDF stays inside the policy', async ({ page }) => {
    const violations = await collectViolations(page);

    // pdf.js carrega o worker de mesma origem e decodificadores em Wasm: é o
    // caminho que morre sem 'wasm-unsafe-eval' e sem worker-src.
    await openApp(page, '/pt/pdf/comprimir');
    await upload(page, DOC_A);
    await expect(primary(page, 'Comprimir PDF')).toBeVisible({ timeout: 60_000 });

    await primary(page, 'Comprimir PDF').click();
    await expect(page.getByRole('button', { name: 'Baixar', exact: true })).toBeVisible({
      timeout: 60_000,
    });

    expect(await violations()).toEqual([]);
  });

  test('OCR — worker from a blob plus wasm — stays inside the policy', async ({ page }) => {
    const violations = await collectViolations(page);

    await openApp(page, '/pt/imagem/extrair-texto');
    await uploadTextImage(page, 'NADA SAI');

    await expect(page.locator('textarea')).toHaveValue(/NADA/, { timeout: 90_000 });

    expect(await violations()).toEqual([]);
  });
});
