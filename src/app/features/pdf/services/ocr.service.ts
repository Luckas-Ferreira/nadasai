import { Injectable, signal } from '@angular/core';

export type OcrLang = 'por' | 'eng' | 'por+eng';

export interface OcrBlock {
  text: string;
  x: number;      // 0-1 (relative to page width)
  y: number;      // 0-1 (relative to page height)
  w: number;
  h: number;
  lineHeight?: number;
  /** Corpo da fonte estimado, 0-1 relativo à altura da página. Ver estimateLineFontSize. */
  fontSize?: number;
  confidence: number;
}

export interface OcrResult {
  lang: OcrLang;
  blocks: OcrBlock[];
  fullText: string;
}

/**
 * Todos os três caminhos precisam ser explícitos.
 *
 * Sem eles o tesseract.js busca worker, core wasm e traineddata no jsdelivr em
 * runtime, e isso quebra duas vezes: o `Cross-Origin-Embedder-Policy:
 * require-corp` (necessário para o SharedArrayBuffer da remoção de fundo)
 * bloqueia cross-origin sem CORP, e uma CDN de terceiro contradiz o "Seus
 * arquivos nunca saem do seu dispositivo" do rodapé — exatamente o motivo pelo
 * qual o @imgly/background-removal foi removido.
 *
 * Absoluto a partir do <base href>, nunca relativo: as rotas são /pt/... e
 * /en/..., então um caminho relativo cairia no fallback do SPA e voltaria
 * index.html com MIME text/html.
 *
 * `corePath` é um diretório — o tesseract.js detecta suporte a SIMD e escolhe
 * entre tesseract-core-{relaxedsimd-,simd-,}lstm.wasm.js sozinho. As três
 * variantes são copiadas em angular.json; cada uma traz o wasm embutido em
 * base64, então não há fetch extra de .wasm. São variantes -lstm porque o
 * worker é criado com OEM 1 (LSTM_ONLY) abaixo — trocar o OEM exige copiar
 * também as variantes Legacy, ou o core dá 404.
 */
const TESSERACT_PATHS = {
  workerPath: new URL('tesseract/worker.min.js', document.baseURI).toString(),
  corePath: new URL('tesseract/', document.baseURI).toString(),
  langPath: new URL('tessdata/', document.baseURI).toString(),
};

/**
 * O tesseract.js é CommonJS (`"type": "commonjs"`, sem campo `module`), e isso
 * diverge entre dev e produção:
 *
 *   - `ng serve` usa o Vite, que pré-empacota o CJS e *sintetiza* named exports,
 *     então `const { createWorker } = await import('tesseract.js')` funciona.
 *   - `ng build` usa o esbuild, que emite o chunk com `export default Mt()` e
 *     nada mais. O mesmo destructuring devolve `undefined`, e a chamada estoura
 *     um "e is not a function" minificado, longe da causa.
 *
 * Ou seja: quebra só em produção, e com uma mensagem que não ajuda. Por isso a
 * leitura passa pelo default com fallback, em vez de destructuring direto.
 */
async function loadCreateWorker() {
  const mod = await import('tesseract.js');
  const ns = mod as unknown as { default?: typeof mod };
  return mod.createWorker ?? ns.default!.createWorker;
}

/**
 * Um bbox de palavra alto demais vira fonte gigante lá na frente: o
 * getBaseFontSize() do pdf.component deriva o tamanho da fonte de `h`, então um
 * bbox 3x mais alto que o normal renderiza um texto 3x maior que o resto da
 * página. Isso acontece de verdade em foto de papel amassado, onde o Tesseract
 * mescla uma palavra com a linha vizinha ou com uma dobra do papel.
 *
 * O teto NÃO pode ser a altura da linha: no Tesseract o bbox da linha é a união
 * dos bboxes das palavras dela, então palavra <= linha por construção e o clamp
 * nunca dispararia. O sinal precisa ser cross-line — daí a mediana da página.
 *
 * A mediana é robusta a outlier justamente por ser mediana: alguns bboxes
 * estourados não a deslocam. O fator 1.8 é permissivo de propósito, para não
 * achatar título ou cabeçalho legítimo, que costuma ficar em 1.3–1.6x o corpo
 * do texto; o que ele corta é o 2.5x+, que na prática é sempre erro de
 * segmentação.
 *
 * Encolhe pelo centro: sem saber se o bbox inflou para cima (linha de cima) ou
 * para baixo (dobra, sublinhado), manter o centro é a escolha neutra.
 */
const OUTLIER_FACTOR = 1.8;

export function clampOutlierHeights(blocks: OcrBlock[]): void {
  if (blocks.length < 3) return; // amostra pequena demais para ter mediana confiável

  const sorted = blocks.map((b) => b.h).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  if (median <= 0) return;

  const cap = median * OUTLIER_FACTOR;
  for (const b of blocks) {
    if (b.h > cap) {
      b.y += (b.h - cap) / 2;
      b.h = cap;
    }
  }
}

/**
 * Converte a altura do bbox de UMA palavra em corpo de fonte.
 *
 * O bbox não mede o corpo da fonte, mede os glifos que a palavra por acaso tem:
 * "arme" ocupa só a altura-de-x, "Data" vai da caixa-alta à linha de base,
 * "gjpq" desce abaixo dela. Os multiplicadores desfazem isso.
 *
 * É um chute, e num token curto é um chute ruim: em "e" ou "47" não há
 * informação suficiente. Por isso o resultado daqui nunca é usado sozinho —
 * ele é a entrada da mediana por linha, que é quem decide de fato.
 */
function estimateWordFontSize(text: string, h: number): number {
  const hasAscender = /[A-Z0-9bdfhkltáéíóúâêôãõà!?'"()\[\]{}\/\\|]/.test(text);
  const hasDescender = /[gjpqyç,;]/.test(text);
  const isAlphanumeric = /[A-Za-z0-9À-ÿ]/.test(text);

  let multiplier = 1.38; // caixa-alta/dígito sem descendente, e o neutro
  if (!isAlphanumeric) multiplier = 1.38; // só símbolo: não dá para inferir
  else if (hasAscender && hasDescender) multiplier = 1.06;
  else if (!hasAscender && hasDescender) multiplier = 1.35;
  else if (!hasAscender && !hasDescender) multiplier = 1.92; // só altura-de-x

  return h * multiplier;
}

/**
 * Estima o corpo da fonte de cada palavra e corta os outliers contra a mediana
 * da página.
 *
 * TENTATIVA DESCARTADA — mediana por linha: palavras de uma linha compartilham
 * o corpo, então parecia certo estimar por palavra e adotar a mediana da linha.
 * Medido no documento real, ficou pior. Num scan ruidoso boa parte das linhas
 * tem vários tokens ruins, então a mediana da linha herda o chute ruim e o
 * PROPAGA para as palavras boas dela: a página inteira subiu para 2.2x o corpo
 * correto, uniformemente. Consistente e errado é pior que inconsistente.
 *
 * O que os dados mostram é que a estimativa por palavra acerta a MAIORIA — a
 * mediana da página cai em cima do corpo real — e erra numa minoria de tokens
 * curtos. Então o certo é manter a estimativa por palavra e limitar a cauda.
 *
 * O corte é no tamanho final da fonte, não na altura do bbox. Limitar só o bbox
 * não basta: com `h` preso em 1.8x a mediana, a amplitude do multiplicador
 * (1.92/1.06 = 1.8x) ainda deixava passar 3.25x no tamanho renderizado, que é o
 * que o usuário enxerga. Medido: 74 de 211 blocos acima do dobro da mediana.
 */
export function assignFontSizes(blocks: OcrBlock[]): void {
  for (const b of blocks) b.fontSize = estimateWordFontSize(b.text, b.h);
  if (blocks.length < 3) return; // amostra pequena demais para ter mediana confiável

  const sorted = blocks.map((b) => b.fontSize!).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  if (median <= 0) return;

  // 1.8x é folgado de propósito: cabeçalho legítimo fica em 1.3-1.6x o corpo, e
  // achatar título seria pior que o bug. O que isso corta é 2x+, que na prática
  // é sempre chute ruim do multiplicador ou bbox mesclado.
  const cap = median * OUTLIER_FACTOR;
  for (const b of blocks) if (b.fontSize! > cap) b.fontSize = cap;
}

@Injectable({ providedIn: 'root' })
export class OcrService {
  readonly progress = signal<number>(-1);
  readonly statusText = signal<string>('');

  private workerCache = new Map<string, import('tesseract.js').Worker>();

  private async getWorker(lang: string): Promise<import('tesseract.js').Worker> {
    if (this.workerCache.has(lang)) return this.workerCache.get(lang)!;

    console.log('[OCR] Creating worker for lang:', lang);
    this.statusText.set('Iniciando motor OCR...');

    const createWorker = await loadCreateWorker();
    // OEM 1 = LSTM_ONLY. Pareado com as variantes -lstm do core e com o
    // tessdata `4.0.0_best_int` que o fetch-tessdata.mjs baixa.
    const worker = await createWorker(lang, 1, {
      ...TESSERACT_PATHS,
      logger: (m: { status: string; progress: number }) => {
        console.log('[OCR Logger]', m.status, (m.progress * 100).toFixed(0) + '%');
        this.statusText.set(m.status);
        if (
          m.status === 'recognizing text' ||
          m.status.startsWith('loading') ||
          m.status.startsWith('initializing')
        ) {
          this.progress.set(Math.round(m.progress * 100));
        } else {
          this.progress.set(-1);
        }
      },
    } as any);

    console.log('[OCR] Worker ready for lang:', lang);
    this.workerCache.set(lang, worker);
    return worker;
  }

  async recognise(canvas: HTMLCanvasElement, lang: string = 'por+eng'): Promise<OcrResult> {
    this.progress.set(0);
    console.log('[OCR] Starting recognition. Canvas:', canvas.width, 'x', canvas.height, '| lang:', lang);

    const worker = await this.getWorker(lang);
    console.log('[OCR] Worker ready, calling recognize...');

    const { data } = await worker.recognize(canvas, undefined, { blocks: true });
    console.log('[OCR] Done. Full text (200 chars):', data.text.slice(0, 200));

    this.progress.set(-1);

    const blocks: OcrBlock[] = [];
    const tData = data as any;

    // Tesseract.js v7 structure: data.blocks[].paragraphs[].lines[]
    // data.lines does NOT exist at the root level in v7.
    if (tData && tData.blocks && tData.blocks.length > 0) {
      for (const block of tData.blocks) {
        const paras = block.paragraphs ?? [];
        for (const para of paras) {
          const lines = para.lines ?? [];
          for (const line of lines) {
            const lh = (line.bbox.y1 - line.bbox.y0) / canvas.height;
            const words = line.words ?? [];

            for (const word of words) {
              if ((word.confidence ?? 0) < 30) continue;
              const text = (word.text ?? '').trim();
              if (!text) continue;

              const x = word.bbox.x0 / canvas.width;
              const y = word.bbox.y0 / canvas.height;
              const w = (word.bbox.x1 - word.bbox.x0) / canvas.width;
              const h = (word.bbox.y1 - word.bbox.y0) / canvas.height;

              blocks.push({ text, confidence: word.confidence, x, y, w, h, lineHeight: lh });
            }
          }
        }
      }
    } else {
      console.warn('[OCR] No blocks. Available keys:', tData ? Object.keys(tData) : 'null');
    }

    clampOutlierHeights(blocks); // geometria da caixa
    assignFontSizes(blocks); // corpo da fonte, cortado contra a mediana da página

    console.log('[OCR] Extracted', blocks.length, 'blocks from', tData?.blocks?.length ?? 0, 'root blocks');
    return { lang: lang as OcrLang, blocks, fullText: data.text };
  }

  async terminate(): Promise<void> {
    for (const worker of this.workerCache.values()) {
      await worker.terminate();
    }
    this.workerCache.clear();
  }
}
