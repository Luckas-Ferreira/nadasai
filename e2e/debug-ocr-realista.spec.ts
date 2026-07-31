import { test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

/**
 * Probe do ramo de OCR do PDF → Word, com entrada REALISTA.
 *
 * A primeira tentativa desenhou texto num canvas e converteu isso — e o
 * agrupador de OCR fragmentou o resultado em pedaços de linha. O canvas
 * sintético tinha entrelinha de 2,2× e quatro frases soltas, que não se parece
 * com nada que um scanner produza; `mergeParagraphBlocks` é calibrado contra
 * documentos reais, então a entrada sintética testava o agrupador fora do
 * domínio dele em vez de testar a conversão.
 *
 * Aqui o scan é fabricado a partir de um documento REAL, usando duas
 * ferramentas do próprio produto: histórico → imagens (pdf-to-img) → PDF sem
 * camada de texto (img-to-pdf). O resultado passa pelo PDF → Word com OCR e é
 * comparado com a conversão NATIVA do mesmo documento — que é o oráculo certo,
 * porque já foi verificada e contém o texto verdadeiro.
 */
const ORIGEM = join(__dirname, '..', 'historico.pdf');
const SAIDA = join(__dirname, '..', 'test-results', 'ocr-realista');

const baixar = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^baixar$/i });

/** Palavras que qualquer leitura correta deste documento tem que conter. */
const ESPERADAS = ['SIGAA', 'UFAL', 'Alagoas', 'Maceió', 'Graduação'];

function normaliza(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('probe: OCR sobre um scan feito a partir de um documento real', async ({ page }) => {
  test.skip(!existsSync(ORIGEM), `coloque o arquivo em ${ORIGEM}`);
  mkdirSync(SAIDA, { recursive: true });

  // ── 1. Conversão NATIVA, que serve de oráculo ────────────────────────────
  await page.goto('/pt/pdf/para-word');
  await page.locator('input[type=file]').first().setInputFiles(ORIGEM);
  await page.getByRole('button', { name: /converter para word/i }).click();
  await baixar(page).waitFor({ timeout: 120_000 });
  let dl = page.waitForEvent('download', { timeout: 30_000 });
  await baixar(page).click();
  const nativoPath = join(SAIDA, 'nativo.docx');
  await (await dl).saveAs(nativoPath);

  const textoDe = (docx: string): string => {
    const xml = strFromU8(unzipSync(new Uint8Array(readFileSync(docx)))['word/document.xml']);
    return Array.from(xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g))
      .map((m) => m[1])
      .join(' ');
  };
  const textoNativo = textoDe(nativoPath);
  console.log('[PROBE] nativo:', textoNativo.length, 'caracteres');

  // ── 2. PDF → imagens ─────────────────────────────────────────────────────
  await page.goto('/pt/pdf/para-imagem');
  await page.locator('input[type=file]').first().setInputFiles(ORIGEM);
  await page.getByRole('button', { name: /converter em imagens/i }).click();
  await baixar(page).waitFor({ timeout: 120_000 });
  dl = page.waitForEvent('download', { timeout: 30_000 });
  await baixar(page).click();
  const imagensDl = await dl;
  const imagensPath = join(SAIDA, imagensDl.suggestedFilename());
  await imagensDl.saveAs(imagensPath);
  console.log('[PROBE] imagens baixadas como', imagensDl.suggestedFilename());

  // Pode vir um único arquivo ou um zip, dependendo da contagem de páginas.
  const arquivosImagem: string[] = [];
  if (imagensPath.endsWith('.zip')) {
    const zip = unzipSync(new Uint8Array(readFileSync(imagensPath)));
    for (const [nome, bytes] of Object.entries(zip)) {
      const destino = join(SAIDA, nome.replace(/[\\/]/g, '_'));
      writeFileSync(destino, Buffer.from(bytes));
      arquivosImagem.push(destino);
    }
  } else {
    arquivosImagem.push(imagensPath);
  }
  arquivosImagem.sort();
  console.log('[PROBE] páginas rasterizadas:', arquivosImagem.length);

  // ── 3. Imagens → PDF sem camada de texto ─────────────────────────────────
  await page.goto('/pt/imagem/para-pdf');
  await page.locator('input[type=file]').first().setInputFiles(arquivosImagem);
  await page.getByRole('button', { name: /gerar pdf/i }).click();
  await baixar(page).waitFor({ timeout: 120_000 });
  dl = page.waitForEvent('download', { timeout: 30_000 });
  await baixar(page).click();
  const scanPath = join(SAIDA, 'scan.pdf');
  await (await dl).saveAs(scanPath);
  console.log('[PROBE] scan fabricado:', readFileSync(scanPath).length, 'bytes');

  // ── 4. O scan pelo PDF → Word, com OCR ───────────────────────────────────
  await page.goto('/pt/pdf/para-word');
  await page.locator('input[type=file]').first().setInputFiles(scanPath);
  await page.getByRole('button', { name: /converter para word/i }).click();
  await baixar(page).waitFor({ timeout: 300_000 });
  dl = page.waitForEvent('download', { timeout: 30_000 });
  await baixar(page).click();
  const ocrPath = join(SAIDA, 'ocr.docx');
  await (await dl).saveAs(ocrPath);

  const textoOcr = textoDe(ocrPath);
  console.log('[PROBE] ocr:', textoOcr.length, 'caracteres');
  console.log('[PROBE] ocr, primeiros 300:', textoOcr.slice(0, 300));

  // ── 5. Comparação com o oráculo ──────────────────────────────────────────
  const nOcr = normaliza(textoOcr);
  const nNativo = normaliza(textoNativo);

  const faltando = ESPERADAS.filter((p) => !nOcr.includes(normaliza(p)));
  console.log('[PROBE] palavras-âncora ausentes:', faltando.length ? JSON.stringify(faltando) : 'nenhuma');

  // Cobertura: que fração das palavras do texto nativo o OCR também produziu.
  const palavrasNativas = Array.from(new Set(nNativo.split(' ').filter((w) => w.length >= 4)));
  const conjuntoOcr = new Set(nOcr.split(' '));
  const cobertas = palavrasNativas.filter((w) => conjuntoOcr.has(w));
  const cobertura = cobertas.length / Math.max(1, palavrasNativas.length);
  console.log(
    '[PROBE] cobertura de vocabulário:',
    `${(cobertura * 100).toFixed(1)}%`,
    `(${cobertas.length}/${palavrasNativas.length})`,
  );

  // Ordem de leitura: as âncoras aparecem na mesma ordem relativa nos dois?
  const posicoes = (t: string) => ESPERADAS.map((p) => t.indexOf(normaliza(p)));
  const ordemNativa = posicoes(nNativo);
  const ordemOcr = posicoes(nOcr);
  console.log('[PROBE] posições no nativo:', JSON.stringify(ordemNativa));
  console.log('[PROBE] posições no ocr   :', JSON.stringify(ordemOcr));

  const tamanhos = Array.from(
    strFromU8(unzipSync(new Uint8Array(readFileSync(ocrPath)))['word/document.xml']).matchAll(
      /<w:sz w:val="(\d+)"\/>/g,
    ),
  ).map((m) => Number(m[1]) / 2);
  const unicos = Array.from(new Set(tamanhos)).sort((a, b) => a - b);
  console.log('[PROBE] corpos de fonte no ocr (pt):', JSON.stringify(unicos));

  if (cobertura < 0.5) {
    console.log('[PROBE] ⚠ cobertura baixa — o OCR não está lendo o documento direito');
  }
});
