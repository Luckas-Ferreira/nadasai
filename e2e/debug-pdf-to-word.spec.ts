import { test } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

/**
 * Probe de diagnóstico do PDF → Word — não é teste de regressão.
 *
 * Um .docx que abre não prova nada: o modo de falha caro aqui é o arquivo
 * VÁLIDO e VAZIO, ou o válido com o texto todo num parágrafo só, ou com corpo
 * de fonte três vezes maior. Nada disso lança erro. Então a sonda desempacota o
 * word/document.xml e mede o que a compilação não vê:
 *
 *   1. Chegou texto? Quantos parágrafos e quantos runs?
 *   2. Os corpos de fonte estão numa faixa plausível (o OOXML usa MEIO-pontos,
 *      então 24 = 12pt; um erro de fator 2 aparece aqui na hora)?
 *   3. O negrito parcial sobreviveu?
 *   4. O texto do PDF de fato aparece no documento?
 *
 * Os dois documentos da raiz são AMBOS digitais (medido: o histórico converte
 * em 4s, sem a pausa que o OCR imporia), então estes casos cobrem só o ramo
 * nativo. O ramo de OCR está em `debug-ocr-realista.spec.ts`, que fabrica um
 * scan a partir de um documento real porque não há um na raiz.
 */
const ARQUIVOS = ['centelha.pdf', 'historico.pdf'];

for (const arquivo of ARQUIVOS) {
  const PDF = join(__dirname, '..', arquivo);

  test(`probe: converter ${arquivo} para .docx e medir o resultado`, async ({ page }) => {
    test.skip(!existsSync(PDF), `coloque o arquivo em ${PDF}`);

    const logs: string[] = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

    await page.goto('/pt/pdf/para-word');
    await page.locator('input[type=file]').first().setInputFiles(PDF);

    const botao = page.getByRole('button', { name: /converter para word/i });
    await botao.waitFor({ timeout: 60_000 });

    // O botão primário só produz o resultado em memória; baixar é uma ação
    // separada no app-action-bar, e só existe depois que canDownload vira true.
    await botao.click();

    const baixar = page.getByRole('button', { name: /^baixar$/i });
    await baixar.waitFor({ timeout: 150_000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await baixar.click();
    const download = await downloadPromise;

    const nome = download.suggestedFilename();
    const destino = join(__dirname, '..', 'test-results', nome);
    await download.saveAs(destino);
    console.log(`[PROBE ${arquivo}] baixado como:`, nome);

    // ── Desempacota o .docx e mede ─────────────────────────────────────────
    const zip = unzipSync(new Uint8Array(readFileSync(destino)));
    const xml = strFromU8(zip['word/document.xml']);
    writeFileSync(join(__dirname, '..', 'test-results', `${nome}.xml`), xml);

    const paragrafos = xml.split('<w:p>').length - 1;
    const runs = (xml.match(/<w:r>/g) ?? []).length;
    const textos = Array.from(xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)).map((m) => m[1]);
    const corpo = textos.join(' ');

    const tamanhos = Array.from(xml.matchAll(/<w:sz w:val="(\d+)"\/>/g)).map((m) => Number(m[1]) / 2);
    const unicos = Array.from(new Set(tamanhos)).sort((a, b) => a - b);

    const comNegrito = (xml.match(/<w:b\/>/g) ?? []).length;
    const quebras = (xml.match(/<w:br w:type="page"\/>/g) ?? []).length;

    console.log(`[PROBE ${arquivo}] parágrafos:`, paragrafos, '| runs:', runs, '| quebras:', quebras);
    console.log(`[PROBE ${arquivo}] caracteres de texto:`, corpo.length);
    console.log(`[PROBE ${arquivo}] corpos de fonte em pt:`, JSON.stringify(unicos));
    console.log(`[PROBE ${arquivo}] runs em negrito:`, comNegrito);
    console.log(`[PROBE ${arquivo}] primeiros 300 chars:`, corpo.slice(0, 300));

    const suspeitos = unicos.filter((s) => s < 4 || s > 40);
    if (suspeitos.length > 0) {
      console.log(`[PROBE ${arquivo}] ⚠ corpos fora da faixa plausível (4-40pt):`, JSON.stringify(suspeitos));
    }
    if (corpo.trim().length === 0) {
      console.log(`[PROBE ${arquivo}] ⚠ DOCX VÁLIDO E VAZIO — o pior modo de falha`);
    }

    const erros = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]'));
    console.log(`[PROBE ${arquivo}] erros no console:`, erros.length ? JSON.stringify(erros.slice(0, 5)) : 'nenhum');
  });
}
