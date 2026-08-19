import { expect, test } from '@playwright/test';
import { expectDownload, openApp, primary, upload } from './helpers';

/**
 * The product is one claim: the file never leaves the machine. Everything else —
 * the counter on the home page, the copy, the pitch — is downstream of it.
 *
 * So it is asserted from *outside* the app. The home page ships a live counter
 * (NetworkProbeService), but a test that only read our own widget would prove
 * nothing: a bug that leaks bytes is very likely also a bug that fails to count
 * them. This watches Playwright's own view of the network, and only then checks
 * that our instrument agrees.
 *
 * It asserts on request *bodies carrying binary*, not on request count. Page
 * traffic is allowed to exist — a login, a checkout, and (on the dev machine)
 * corporate antivirus injecting its own telemetry script into every page. None
 * of that is the user's file. A test that banned all traffic would fail for
 * reasons that have nothing to do with the guarantee, and would have to be
 * weakened or deleted the day billing ships. This one does not.
 *
 * If someone ever POSTs the image to a server, this is what fails.
 */
test.describe('Zero-upload, asserted from outside the app', () => {
  test('a full chain never puts the image on the wire', async ({ page }) => {
    const uploads: string[] = [];
    let requests = 0;

    page.on('request', (request) => {
      requests++;

      // postDataBuffer() is the raw bytes of the body: null when there is none.
      // Anything with a body on a mutating method is a candidate for an upload.
      const body = request.postDataBuffer();
      if (body && body.length > 0) {
        uploads.push(`${request.method()} ${request.url()} (${body.length} B)`);
      }
    });

    // Drive real work through two tools — a leak would happen here, not at rest.
    await openApp(page, '/pt/imagem/comprimir');
    await upload(page);
    await primary(page, 'Comprimir').click();

    // O chip leva o resultado junto e vai direto para a ferramenta seguinte: a
    // cadeia não passa mais pela home, e é justamente atravessando duas
    // ferramentas sem escala que um vazamento apareceria.
    await page.getByRole('button', { name: 'Redimensionar' }).click();
    await page.getByRole('button', { name: '400', exact: true }).click();
    await primary(page, 'Redimensionar').click();
    await expectDownload(page, /^photo-resized\.png$/);

    expect(requests, 'no requests seen at all — the listener is not attached').toBeGreaterThan(0);

    // The photo fixture is ~KB of pixels. Nothing carrying a payload went out.
    expect(uploads, 'a request carried a body — the image may have been uploaded').toEqual([]);

    // And only now: the instrument the user is shown agrees with Playwright.
    //
    // Asserted AQUI, ainda dentro da ferramenta e com o arquivo carregado, e não
    // depois de voltar para a home. O medidor morava só na home, ou seja,
    // aparecia na única tela sem arquivo nenhum em jogo e sumia justamente
    // quando alguém abria um documento de verdade — que é quando "saiu alguma
    // coisa daqui?" vale ser respondido. É essa a garantia que isto pina.
    const badge = page.getByRole('button', { name: /Monitor de rede ao vivo/ });
    await expect(badge).toBeVisible();
    await expect(badge).toContainText('0 bytes');

    // O detalhe (destinatários, o que a página de fato baixa) não sumiu: mudou
    // para dentro do medidor.
    await badge.click();
    const proof = page.locator('app-network-proof');
    await expect(proof).toContainText('0 bytes');
    await expect(proof).toContainText('nenhum');

    // E segue na home, no meio da cadeia — o contador vale mais logo depois de
    // um arquivo ter passado por duas ferramentas.
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Nada Sai' }).first().click();
    await expect(page.getByRole('button', { name: /Monitor de rede ao vivo/ }).first()).toContainText(
      '0 bytes',
    );
  });

});
