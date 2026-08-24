import { expect, test, type Page } from '@playwright/test';
import { DOC_LONG, openApp, primary, upload, uploadTextImage } from './helpers';
import { PREVIEW_URL } from './ports';

/**
 * Os pacotes de runtime: ver, baixar, provar offline e apagar.
 *
 * ESTE SPEC EXISTE POR CAUSA DE UMA TROCA DE DONO. Os diretórios `/model/`,
 * `/ort/`, `/tesseract/`, `/tessdata/` e `/pdfjs/` eram grupos lazy do ngsw e
 * passaram a ser servidos pelo handler cache-first do `public/nadasai-sw.js`,
 * sobre um cache nosso — que é a única forma de "desinstalar" existir. Se esse
 * handler estiver errado, o OCR e o PDF param de funcionar OFFLINE, e param em
 * silêncio: online tudo continua igual, porque a rede responde. O `09-offline`
 * cobre o app; este cobre o que saiu de lá.
 *
 * Roda contra o build de produção na :4300 (ver playwright.config.ts): o `ng
 * serve` não emite service worker, então sob ele estes testes estariam afirmando
 * coisas sobre a ausência daquilo que existem para provar.
 *
 * O pacote de IA (55 MB) NÃO é instalado aqui de propósito — ele é exercitado
 * pelo estado, pelos rótulos e por um cache semeado à mão. Baixá-lo a cada
 * execução custaria minutos para provar o mesmo handler que o de OCR já prova
 * com 5 MB.
 */
test.use({ baseURL: PREVIEW_URL });

const INSTALL = { timeout: 120_000 };
const OCR = { timeout: 90_000 };

/**
 * O DOWNLOAD AUTOMÁTICO FICA DESLIGADO nestes testes, e não é conveniência.
 *
 * O `ModelPrefetchService` puxa os 42 MB do modelo assim que o navegador fica
 * ocioso — para dentro DESTE MESMO cache. Ligado, ele aterrissa no meio das
 * asserções: a primeira versão deste arquivo viu `/model/` aparecer no cache
 * logo depois de instalar o pacote de OCR e reprovou por um comportamento
 * correto do produto. Os dois testes que existem para exercitar o prefetch
 * declaram o próprio estado, logo abaixo.
 *
 * Só escreve quando a chave AINDA NÃO EXISTE, e isso não é zelo: um
 * `addInitScript` roda a cada navegação, então escrever sempre desfazia, no
 * `reload`, o ajuste que o teste tinha acabado de fazer pela tela — e o teste do
 * interruptor reprovava acusando o produto de não guardar o que guardava.
 */
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    if (localStorage.getItem('nadasai.packs.auto') === null) {
      localStorage.setItem('nadasai.packs.auto', '0');
    }
  });
});

async function serviceWorkerReady(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
    timeout: 60_000,
  });
  await page.reload({ waitUntil: 'networkidle' });
}

/** Os caminhos que estão AGORA no cache dos pacotes, lidos do próprio navegador. */
async function cachedPaths(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const cache = await caches.open('nadasai-packs-v1');
    const keys = await cache.keys();
    return keys.map((request) => new URL(request.url).pathname).sort();
  });
}

/** Põe arquivos no cache sem baixá-los, para exercitar a remoção sem 42 MB. */
async function seedPack(page: Page, paths: readonly string[]): Promise<void> {
  await page.evaluate(async (list) => {
    const cache = await caches.open('nadasai-packs-v1');
    for (const path of list) {
      await cache.put(new URL(path, location.origin).href, new Response(new Uint8Array(8)));
    }
  }, paths);
}

/** A linha de um pacote na tela, encontrada pelo título. */
function row(page: Page, name: string) {
  return page.locator('li').filter({ has: page.getByRole('heading', { name, exact: true }) });
}

test.describe('Pacotes de runtime', () => {
  /**
   * O inventário é o que permite a tela dizer "42,4 MB" ANTES de baixar. Sem ele
   * cada linha mostra zero e o botão vira uma aposta.
   */
  test('o inventário publicado cobre os cinco diretórios', async ({ request }) => {
    const response = await request.get('/packs.json');
    expect(response.status()).toBe(200);

    const { files } = (await response.json()) as { files: Record<string, number> };
    const paths = Object.keys(files);

    for (const prefix of ['/model/', '/ort/', '/tesseract/', '/tessdata/', '/pdfjs/']) {
      expect(
        paths.some((path) => path.startsWith(prefix)),
        `${prefix} não está no packs.json: o pacote apareceria vazio na tela`,
      ).toBe(true);
    }

    // Um tamanho zero seria um arquivo que o build não copiou, e a soma da tela
    // mentiria para baixo — que é o pior sentido para ela errar.
    expect(Object.values(files).every((bytes) => bytes > 0)).toBe(true);
  });

  /**
   * O ngsw não pode mais reivindicar estes diretórios, ou passam a existir DUAS
   * cópias dos mesmos 75 MB, em dois caches, e apagar uma deixaria a outra.
   */
  test('o ngsw entregou os pacotes e ficou com o inventário', async ({ request }) => {
    const manifest = (await (await request.get('/ngsw.json')).json()) as {
      hashTable: Record<string, string>;
    };
    const cached = Object.keys(manifest.hashTable);

    expect(cached, 'sem o inventário em cache a tela fica cega offline').toContain('/packs.json');

    for (const prefix of ['/model/', '/ort/', '/tesseract/', '/tessdata/', '/pdfjs/']) {
      expect(
        cached.filter((path) => path.startsWith(prefix)),
        `${prefix} ainda está no manifesto do ngsw: seriam duas cópias em dois caches`,
      ).toEqual([]);
    }
  });

  test('a tela começa sem nada baixado e anuncia o tamanho', async ({ page }) => {
    await openApp(page, '/pt/configuracoes');
    await serviceWorkerReady(page);

    const ocr = row(page, 'Reconhecimento de texto (OCR)');
    await expect(ocr).toBeVisible();
    await expect(ocr.getByText('Não baixado')).toBeVisible();

    // Os tamanhos são lidos do packs.json, não escritos no template — e o dos
    // 55 MB do pacote de IA aparece ANTES de qualquer download, que é o ponto
    // inteiro da tela.
    await expect(ocr.getByText(/\d[\d.,]* MB/)).toBeVisible();
    await expect(row(page, 'Remoção de fundo (IA)').getByText(/\d[\d.,]* MB/)).toBeVisible();
  });

  /**
   * O teste que carrega o recurso: baixar, provar que o handler novo serve o que
   * o ngsw servia, e apagar de verdade.
   */
  test('baixa o OCR, funciona offline com ele e o remove', async ({ page, context }) => {
    await openApp(page, '/pt/configuracoes');
    await serviceWorkerReady(page);

    const ocr = row(page, 'Reconhecimento de texto (OCR)');
    await ocr.getByRole('button', { name: 'Baixar' }).click();
    await expect(ocr.getByText('Neste dispositivo')).toBeVisible(INSTALL);

    const installed = await cachedPaths(page);
    expect(installed).toContain('/tessdata/por.traineddata.gz');
    expect(installed).toContain('/tesseract/worker.min.js');

    // UMA variante do core, não as três: as outras duas são 7,4 MB que nada lê.
    expect(installed.filter((path) => path.includes('tesseract-core')).length).toBe(1);

    // E instalar um pacote não arrasta outro junto.
    expect(installed.filter((path) => path.startsWith('/pdfjs/'))).toEqual([]);
    expect(installed.filter((path) => path.startsWith('/model/'))).toEqual([]);

    // A prova. Sem rede, o OCR só pode ler o core e o traineddata do cache que
    // acabou de ser escrito — e quem os serve é o handler do nadasai-sw.js.
    await context.setOffline(true);
    await openApp(page, '/pt/imagem/extrair-texto');
    await uploadTextImage(page, 'NADA SAI');
    await expect(page.locator('textarea')).toHaveValue(/NADA/, OCR);
    await context.setOffline(false);

    await openApp(page, '/pt/configuracoes');
    await expect(ocr.getByText('Neste dispositivo')).toBeVisible();
    await ocr.getByRole('button', { name: 'Remover' }).click();
    await expect(ocr.getByText('Não baixado')).toBeVisible(INSTALL);

    // Removido é removido: os bytes saíram do disco, não só da tela.
    const after = await cachedPaths(page);
    expect(after.filter((path) => path.startsWith('/tessdata/'))).toEqual([]);
    expect(after.filter((path) => path.startsWith('/tesseract/'))).toEqual([]);
  });

  /**
   * O pdf.js é o pacote de MAIS consumidores: dezessete ferramentas. E é o único
   * cujo worker é um MÓDULO (`type: 'module'`) que busca sozinho suas wasm, suas
   * fontes e 169 tabelas de caracteres — nenhuma dessas requisições passa pelo
   * nosso código, só pelo handler do service worker. Se ele não as servir, o
   * módulo inteiro de PDF morre offline, e morre em silêncio.
   */
  test('baixa o motor de PDF e ele rasteriza sem rede', async ({ page, context }) => {
    await openApp(page, '/pt/configuracoes');
    await serviceWorkerReady(page);

    const pdf = row(page, 'Motor de PDF');
    await pdf.getByRole('button', { name: 'Baixar' }).click();
    await expect(pdf.getByText('Neste dispositivo')).toBeVisible(INSTALL);

    const installed = await cachedPaths(page);
    expect(installed).toContain('/pdfjs/pdf.worker.min.mjs');
    expect(installed.filter((path) => path.startsWith('/pdfjs/cmaps/')).length).toBeGreaterThan(100);

    await context.setOffline(true);
    await openApp(page, '/pt/pdf/dividir');
    await upload(page, DOC_LONG);

    // O botão só aparece depois de o pdf.js abrir o documento e rasterizar as
    // miniaturas — ou seja, depois de o worker, as wasm e as fontes virem todos
    // do cache dos pacotes.
    await expect(primary(page, 'Dividir PDF')).toBeVisible({ timeout: 60_000 });
    await context.setOffline(false);
  });

  /**
   * Remover apaga TUDO sob o prefixo, inclusive o que o inventário não conhece —
   * uma sobra de um deploy anterior ocupa espaço igual, e deixá-la faria a tela
   * dizer "removido" enquanto o disco discorda.
   */
  test('remover leva junto a sobra que o inventário não conhece', async ({ page }) => {
    await openApp(page, '/pt/configuracoes');
    await serviceWorkerReady(page);

    await seedPack(page, [
      '/tessdata/por.traineddata.gz',
      '/tessdata/deu.traineddata.gz', // nunca esteve no packs.json deste build
    ]);
    await page.reload({ waitUntil: 'networkidle' });

    const ocr = row(page, 'Reconhecimento de texto (OCR)');
    await ocr.getByRole('button', { name: 'Remover' }).click();
    await expect(ocr.getByText('Não baixado')).toBeVisible(INSTALL);

    expect(await cachedPaths(page)).toEqual([]);
  });

  /**
   * Desinstalar tem de ser DEFINITIVO — esta é a primeira metade. Sem a marca, o
   * prefetch ocioso rebaixava os 42 MB na visita seguinte, e o botão de remover,
   * que tinha feito exatamente o que prometia, parecia quebrado.
   */
  test('remover o pacote de IA registra que a remoção foi manual', async ({ page }) => {
    await openApp(page, '/pt/configuracoes');
    await serviceWorkerReady(page);

    // Semeado em vez de baixado: a marca é sobre a remoção, não sobre os 42 MB.
    await seedPack(page, ['/model/isnet-q8.manifest.json']);
    await page.reload({ waitUntil: 'networkidle' });

    const ai = row(page, 'Remoção de fundo (IA)');
    await ai.getByRole('button', { name: 'Remover' }).click();
    await expect(ai.getByText('Não baixado')).toBeVisible(INSTALL);

    expect(await page.evaluate(() => localStorage.getItem('nadasai.packs.removed'))).toContain(
      'remove-bg',
    );
    expect(await cachedPaths(page)).toEqual([]);
  });

  /**
   * A segunda metade: com a marca escrita, e o download automático LIGADO, nada
   * pode ir buscar os pesos. É o teste do contrato do `ModelPrefetchService`.
   */
  test('a marca de remoção manual cala o download automático', async ({ page, context }) => {
    await context.addInitScript(() => {
      localStorage.setItem('nadasai.packs.auto', '1');
      localStorage.setItem('nadasai.packs.removed', '["remove-bg"]');
    });

    const asked: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/model/')) asked.push(request.url());
    });

    await openApp(page, '/pt');
    await serviceWorkerReady(page);
    // Folga de sobra para o requestIdleCallback do prefetch disparar.
    await page.waitForTimeout(15_000);

    expect(asked, 'o prefetch ignorou uma remoção manual').toEqual([]);
  });

  test('o interruptor do download automático fica desligado', async ({ page }) => {
    await openApp(page, '/pt/configuracoes');
    await serviceWorkerReady(page);

    const auto = page.getByRole('checkbox', {
      name: 'Baixar o modelo de remover fundo em segundo plano',
    });
    await expect(auto).not.toBeChecked(); // o beforeEach já o desligou

    await auto.check();
    expect(await page.evaluate(() => localStorage.getItem('nadasai.packs.auto'))).toBe('1');

    // E sobrevive ao recarregamento: um ajuste que volta sozinho não é um ajuste.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(auto).toBeChecked();
  });

  test('a página inglesa é a mesma tela', async ({ page }) => {
    await openApp(page, '/en/settings');
    await serviceWorkerReady(page);

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Text recognition (OCR)' })).toBeVisible();
    await expect(page.getByText('Not downloaded').first()).toBeVisible();
  });
});
