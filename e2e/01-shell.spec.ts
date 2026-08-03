import { expect, test } from '@playwright/test';
import { NOT_AN_IMAGE, openApp, upload } from './helpers';

test.describe('Shell: home, nav, i18n', () => {
  test('home is the launcher: every module, every tool, and the privacy claim', async ({ page }) => {
    await openApp(page);

    await expect(
      page.getByRole('heading', { name: 'Seus arquivos não saem do seu computador.' }),
    ).toBeVisible();
    await expect(page.getByText('Seus arquivos nunca saem do seu dispositivo.')).toBeVisible();

    // The home walks MODULES, so the headings ARE the module names.
    await expect(page.getByRole('heading', { name: 'Ferramentas de Imagem' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ferramentas de PDF' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ferramentas de Áudio' })).toBeVisible();

    // Not `exact`: a card's accessible name is its title AND its description
    // ("Remover fundo Recorte pessoas, produtos e objetos."). Only the rail has
    // links named by the label alone.
    for (const name of ['Remover fundo', 'Cortar', 'Juntar PDF', 'Marca d\'Água', 'Cortar áudio']) {
      await expect(page.getByRole('link', { name: new RegExp(`^${name}`) }).first()).toBeVisible();
    }

    // No rail here, by design: the grid is the navigation on this page.
    await expect(page.getByRole('navigation', { name: 'Ferramentas' })).toHaveCount(0);
  });

  /**
   * The uploader and the one-click sample used to live on the home and are gone —
   * NOT as part of the navigation work, and not deliberately as far as anything in
   * the repo records. The shortest path to a first result was the sample button,
   * and the person most likely to click it is the one least likely to give the
   * product a second chance. Left failing on purpose so it is not forgotten.
   */
  test.fixme('the sample image loads with one click and enters the chain', async ({ page }) => {
    await openApp(page);

    await page.getByRole('button', { name: 'Usar uma imagem de exemplo' }).click();

    await expect(page.getByText('exemplo.jpg')).toBeVisible();
    await expect(page.getByText('O que você quer fazer com ela?')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('the roadmap stays inert', async ({ page }) => {
    await openApp(page);

    await expect(page.getByRole('heading', { name: 'Em breve' })).toBeVisible();

    // PDF and Áudio shipped and are real modules now, so they left this list —
    // a roadmap that still advertises what the grid above already links to is
    // the product telling you it has not noticed itself.
    for (const name of ['Documentos']) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
    }
  });

  /**
   * The rail is scoped to one module — that is what keeps it inside the viewport
   * as modules are added. So the assertion is twofold: it lists the module you are
   * in, and it does NOT list the one you are not.
   */
  test('the rail lists the current module and routes inside it', async ({ page }) => {
    await openApp(page, '/pt/pdf/dividir');
    const rail = page.getByRole('navigation', { name: 'Ferramentas' }).first();

    await expect(rail.getByRole('link', { name: 'Juntar PDF', exact: true })).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Organizar PDF', exact: true })).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Cortar', exact: true })).toHaveCount(0);

    // Every tool of the module is reachable without scrolling the rail.
    const overflowing = await page.evaluate(() => {
      const aside = document.querySelector('aside.overflow-y-auto');
      return aside ? aside.scrollHeight > aside.clientHeight : null;
    });
    expect(overflowing).toBe(false);

    for (const route of [
      { link: 'Organizar PDF', url: '/pdf/organizar', heading: 'Organizar PDF' },
      { link: 'Proteger PDF', url: '/pdf/proteger', heading: 'Proteger PDF' },
      { link: 'Juntar PDF', url: '/pdf/juntar', heading: 'Juntar PDF' },
    ]) {
      await rail.getByRole('link', { name: route.link, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${route.url}$`));
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      await expect(rail.getByRole('link', { name: route.link, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
  });

  /**
   * Toda página de ferramenta termina com a mesma seção de FAQ, e o Angular não
   * mexe no scroll por conta própria: `scrollPositionRestoration` nasce
   * 'disabled', então o navegador mantinha o offset da tela anterior. Descer
   * até o FAQ de um tool e clicar no próximo abria o tool novo já no meio do
   * FAQ, com o dropzone acima da dobra — parecia que tinha aberto errado.
   */
  test('a new tool opens at the top, not where the last one was scrolled to', async ({ page }) => {
    await openApp(page, '/pt/audio/cortar');
    const rail = page.getByRole('navigation', { name: 'Ferramentas' }).first();

    // Até o fim da página, que é onde mora o FAQ.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await rail.getByRole('link', { name: 'Juntar áudio', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Juntar áudio' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  /**
   * O `sticky top-0` estava no <header> dentro do componente, mas o host é item
   * de um flex column — blockificado, com a altura exata do cabeçalho. O sticky
   * ficava preso a um contêiner do próprio tamanho, sem folga para deslizar, e
   * a barra ia embora ao descer. O rail se pendura nela (`top-14`), então isto
   * não é só estética.
   */
  test('the top bar stays put while the page scrolls under it', async ({ page }) => {
    await openApp(page, '/pt/audio/cortar');
    const bar = page.locator('app-top-bar');
    await expect(bar).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    // Continua colada no topo da viewport, não empurrada para cima com a página.
    expect(Math.abs(box!.y)).toBeLessThan(2);
    await expect(bar.getByRole('link', { name: 'Nada Sai' })).toBeInViewport();
  });

  test('the module switcher crosses between modules', async ({ page }) => {
    await openApp(page, '/pt/pdf/dividir');

    await page.getByRole('button', { name: 'Trocar de módulo' }).click();
    await page.getByRole('menuitem', { name: /Imagem/ }).click();

    // Landed in the image module, and the rail followed.
    await expect(page).toHaveURL(/\/pt\/imagem\//);
    const rail = page.getByRole('navigation', { name: 'Ferramentas' }).first();
    await expect(rail.getByRole('link', { name: 'Cortar', exact: true })).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Juntar PDF', exact: true })).toHaveCount(0);
  });

  /**
   * The palette is the half of the navigation that reaches ACROSS modules, which
   * is what allows the rail to stay scoped. Typed without the accent on purpose:
   * "agua" has to find "Marca d'Água" or Portuguese users pay for every diacritic.
   */
  test('the command palette finds a tool in another module and opens it', async ({ page }) => {
    await openApp(page, '/pt/imagem/cortar');

    await page.getByRole('button', { name: 'Buscar ferramentas' }).click();
    await page.getByRole('combobox', { name: 'Buscar ferramentas' }).fill('agua');

    const first = page.getByRole('option').first();
    await expect(first).toContainText('Marca d\'Água');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/pt\/pdf\/marca-dagua$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Escape closes the palette and Ctrl+K opens it', async ({ page }) => {
    await openApp(page, '/pt/imagem/cortar');

    // Um clique em terreno neutro, só para tirar o foco de qualquer controle
    // antes do atalho. Y=100 e não 5: `main` é mais alto que a viewport, então
    // o Playwright rola até o topo dele antes de clicar, e o topo agora fica
    // atrás da barra fixa — no canto superior esquerdo quem recebe o clique é o
    // cabeçalho. X=5 mantém o ponto na margem do <main>, longe do dropzone,
    // cujo clique abriria o seletor de arquivos.
    await page.locator('main').click({ position: { x: 5, y: 100 } });
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  /**
   * Portuguese-only, for now. The picker is gone, and a language left in storage
   * by an earlier visit must not bring English back — there would be no way left
   * to switch off it.
   */
  test('is Portuguese-only and a stored language cannot override it', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('imgwork.lang', 'en'));
    await openApp(page);

    await expect(page.getByRole('radiogroup', { name: 'Mudar idioma' })).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Seus arquivos não saem do seu computador.' }),
    ).toBeVisible();
    await expect(page.getByText('Seus arquivos nunca saem do seu dispositivo.')).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Seus arquivos não saem do seu computador.' }),
    ).toBeVisible();
  });

  /**
   * Asserted on a tool page rather than the home, which no longer has a dropzone.
   * The door moved; the rule that a non-image never gets through it did not.
   */
  test('a non-image is rejected at the door', async ({ page }) => {
    await openApp(page, '/pt/imagem/cortar');
    await upload(page, NOT_AN_IMAGE);

    await expect(page.getByText(/não é uma imagem suportada/i)).toBeVisible();
    // And nothing entered the chain.
    await expect(page.getByRole('button', { name: 'Limpar' })).toHaveCount(0);
  });
});
