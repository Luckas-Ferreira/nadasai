import { Injectable, signal } from '@angular/core';
import { joinParagraphLines } from './paragraph-merger';

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
  /** Detectado automaticamente via heurística de ink-ratio no canvas do scan. */
  bold?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  lineCount?: number;
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
 *
 * É uma FUNÇÃO, e não uma constante de módulo, porque `document.baseURI` só
 * existe no navegador. Como constante, isto era avaliado no instante em que o
 * módulo é importado — e na geração estática o Node importa este arquivo junto
 * com o chunk do editor de PDF. O build morria com `ReferenceError: document is
 * not defined` vindo de `ModuleJob.run`: antes de qualquer componente existir, e
 * sem citar rota nenhuma. Adiar para a primeira chamada não muda nada em
 * runtime, porque quem chama isto é sempre um worker de OCR, sempre no browser.
 * Mesma forma de `pdfAssetUrls()` em core/pdf/pdfjs.ts, e pela mesma razão.
 */
function tesseractPaths(): { workerPath: string; corePath: string; langPath: string } {
  return {
    workerPath: new URL('tesseract/worker.min.js', document.baseURI).toString(),
    corePath: new URL('tesseract/', document.baseURI).toString(),
    langPath: new URL('tessdata/', document.baseURI).toString(),
  };
}

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

/**
 * Limiar: um bloco é considerado negrito quando seu ink-ratio (fração de pixels
 * escuros dentro do bbox) supera BOLD_RATIO_THRESHOLD × mediana da página.
 *
 * 1.4 é conservador de propósito:
 *   - texto normal      → inkRatio ≈ 0.08–0.15
 *   - texto em negrito  → inkRatio ≈ 0.18–0.30
 *   - 1.4× mediana separa os dois grupos com folga, sem marcar como negrito
 *     palavras levemente mais espessas por ruído de scan.
 *
 * Aumentar → menos falsos positivos, mas pode perder negritos leves.
 * Diminuir → detecta mais negritos, mas aumenta falsos positivos em scans ruidosos.
 */
const BOLD_RATIO_THRESHOLD = 1.4;

/** Limiar de escuridão de pixel: 0–255. Abaixo deste valor o pixel é "tinta". */
const DARK_PIXEL_THRESHOLD = 128;

/**
 * Detecta automaticamente blocos em negrito por análise de densidade de pixels
 * (ink ratio) no canvas do scan.
 *
 * Para cada OcrBlock:
 *   1. Amostramos a sub-região do canvas que corresponde ao bbox da palavra.
 *   2. Convertemos para escala de cinza e contamos pixels escuros (< DARK_PIXEL_THRESHOLD).
 *   3. Calculamos inkRatio = pixelsEscuros / totalPixels.
 *
 * Depois computamos a mediana de todos os inkRatios da página e marcamos
 * `bold = true` nos blocos cujo inkRatio supera mediana × BOLD_RATIO_THRESHOLD.
 *
 * O canvas passado deve ser o mesmo usado pelo Tesseract (já com a escala OCR_RENDER_SCALE),
 * pois as coordenadas dos bboxes estão normalizadas por canvas.width/height.
 */
export function detectBoldBlocks(blocks: OcrBlock[], canvas: HTMLCanvasElement): void {
  if (blocks.length < 2) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cw = canvas.width;
  const ch = canvas.height;

  const inkRatios: number[] = blocks.map((b) => {
    // Coordenadas em pixels do canvas (os valores são 0-1 relativos ao canvas)
    const x0 = Math.max(0, Math.floor(b.x * cw));
    const y0 = Math.max(0, Math.floor(b.y * ch));
    const x1 = Math.min(cw, Math.ceil((b.x + b.w) * cw));
    const y1 = Math.min(ch, Math.ceil((b.y + b.h) * ch));

    const pw = x1 - x0;
    const ph = y1 - y0;
    if (pw <= 0 || ph <= 0) return 0;

    // getImageData: [R, G, B, A, R, G, B, A, ...]
    const imgData = ctx.getImageData(x0, y0, pw, ph).data;
    let darkCount = 0;
    const total = pw * ph;

    for (let i = 0; i < imgData.length; i += 4) {
      // Luminância rápida (sem multiplicadores de ponto flutuante)
      const gray = (imgData[i] * 77 + imgData[i + 1] * 150 + imgData[i + 2] * 29) >> 8;
      if (gray < DARK_PIXEL_THRESHOLD) darkCount++;
    }

    return total > 0 ? darkCount / total : 0;
  });

  // Mediana dos ink-ratios da página (robusta a outliers de scan)
  const sorted = [...inkRatios].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];

  if (median <= 0) return; // página toda em branco ou sem tinta — não detectar

  const boldThreshold = median * BOLD_RATIO_THRESHOLD;
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].bold = inkRatios[i] > boldThreshold;
  }
}

/**
 * Funde blocos de palavras individuais (saída do Tesseract) em blocos de
 * parágrafo, exatamente como o Adobe Acrobat faz na edição de PDF.
 *
 * Passo 1 — agrupar palavras em linhas:
 *   Dois blocos pertencem à mesma linha se o |midY_a - midY_b| for menor que
 *   0.7 × altura do maior dos dois. Isso detecta palavras na mesma linha de
 *   texto mesmo com pequenas variações de baseline causadas pelo scan.
 *
 * Passo 2 — agrupar linhas em parágrafos:
 *   Duas linhas consecutivas fazem parte do mesmo parágrafo se:
 *   Linhas são do mesmo parágrafo se:
 *   • gap vertical entre -0.8 * minH e 2.5 * minH
 *   • existe sobreposição horizontal (xOverlap > 0)
 *
 * O bloco resultante herda:
 *   • text: linhas concatenadas com '\n'
 *   • fontSize: mediana dos fontSizes das linhas
 *   • lineHeight: altura média das linhas
 *   • bold: maioria das palavras era negrito
 */
export function mergeParagraphBlocks(blocks: OcrBlock[]): OcrBlock[] {
  if (blocks.length === 0) return [];

  // Passo 1: Agrupar palavras em linhas
  const lines: OcrBlock[][] = [];
  
  // Ordena por Y e depois X
  let sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  
  while (sorted.length > 0) {
    const currentLine = [sorted.shift()!];
    
    let added;
    do {
      added = false;
      const ref = currentLine[currentLine.length - 1]; // last word in line
      
      for (let i = 0; i < sorted.length; i++) {
        const candidate = sorted[i];
        
        const yOverlap = Math.max(0, Math.min(ref.y + ref.h, candidate.y + candidate.h) - Math.max(ref.y, candidate.y));
        const minH = Math.min(ref.h, candidate.h);
        
        // Horizontal gap
        const hGap = candidate.x - (ref.x + ref.w);
        
        if (yOverlap > minH * 0.4 && hGap > -minH && hGap < minH * 3.0) {
          currentLine.push(candidate);
          sorted.splice(i, 1);
          added = true;
          break;
        }
      }
    } while (added);
    
    // Sort words in line by X
    currentLine.sort((a, b) => a.x - b.x);
    lines.push(currentLine);
  }
  
  // Computar bounds das linhas
  const lineStats = lines.map(words => {
    const minX = Math.min(...words.map(w => w.x));
    const minY = Math.min(...words.map(w => w.y));
    const maxX = Math.max(...words.map(w => w.x + w.w));
    const maxY = Math.max(...words.map(w => w.y + w.h));
    const text = words.map(w => w.text).join(' ');
    
    const fSizes = words.map(w => w.fontSize || w.h).sort((a, b) => a - b);
    const fontSize = fSizes[fSizes.length >> 1];
    
    const boldCount = words.filter(w => w.bold).length;
    const isBold = boldCount > words.length / 2;
    const w = maxX - minX;

    const leftMargin = minX;
    const rightMargin = 1 - maxX;
    const isCentered = Math.abs(leftMargin - rightMargin) < 0.08 && w < 0.85;

    return {
      words, text, boldCount, isBold, isCentered,
      x: minX, y: minY, w, h: maxY - minY,
      fontSize
    };
  });
  
  // Sort lines by Y then X
  lineStats.sort((a, b) => a.y - b.y || a.x - b.x);

  // Passo 2: Agrupar linhas em parágrafos
  const paragraphs: (typeof lineStats[0])[][] = [];

  for (const line of lineStats) {
    let placed = false;

    // Procura um grupo de parágrafo compatível entre os últimos 5 grupos abertos
    for (let i = paragraphs.length - 1; i >= Math.max(0, paragraphs.length - 5); i--) {
      const candidatePara = paragraphs[i];
      const lastLine = candidatePara[candidatePara.length - 1];

      const baselineDist = line.y - lastLine.y;
      const avgH = (line.h + lastLine.h) / 2;
      const gap = line.y - (lastLine.y + lastLine.h);

      const xOverlap = Math.max(0, Math.min(line.x + line.w, lastLine.x + lastLine.w) - Math.max(line.x, lastLine.x));
      const leftDiff = Math.abs(line.x - lastLine.x);

      const fsA = lastLine.fontSize;
      const fsB = line.fontSize;
      const fsMismatch = fsA !== undefined && fsB !== undefined && (Math.abs(fsA - fsB) > 0.008 || fsA / fsB > 1.2 || fsB / fsA > 1.2);
      const boldMismatch = lastLine.isBold !== line.isBold;

      const paraMaxW = Math.max(...candidatePara.map((l) => l.w));
      const paraMaxRight = Math.max(...candidatePara.map((l) => l.x + l.w));
      const isLastLineShort = lastLine.w < paraMaxW * 0.70 && (lastLine.x + lastLine.w) < paraMaxRight - 0.04;

      const isNormalSpacing = baselineDist <= avgH * 2.2 || gap <= avgH * 1.5;
      const isAligned = xOverlap > 0 || leftDiff < 0.08;

      if (isNormalSpacing && !fsMismatch && !boldMismatch && !isLastLineShort && isAligned) {
        candidatePara.push(line);
        placed = true;
        break;
      }
    }
    if (!placed) {
      paragraphs.push([line]);
    }
  }
  
  // Construir blocos finais
  return paragraphs.map(paraLines => {
    const minX = Math.min(...paraLines.map(l => l.x));
    const minY = Math.min(...paraLines.map(l => l.y));
    const maxX = Math.max(...paraLines.map(l => l.x + l.w));
    const maxY = Math.max(...paraLines.map(l => l.y + l.h));
    
    const text = joinParagraphLines(paraLines);
    
    const fSizes = paraLines.map(l => l.fontSize).sort((a, b) => a - b);
    const fontSize = fSizes[fSizes.length >> 1];
    
    const avgLineH = paraLines.reduce((sum, l) => sum + l.h, 0) / paraLines.length;
    
    const totalWords = paraLines.reduce((s, l) => s + l.words.length, 0);
    const boldWords = paraLines.reduce((s, l) => s + l.boldCount, 0);

    const isCentered = paraLines.every(l => l.isCentered) || (paraLines.length === 1 && paraLines[0].isCentered);

    return {
      text,
      x: minX, y: minY,
      w: maxX - minX, h: maxY - minY,
      lineHeight: avgLineH,
      fontSize,
      confidence: 80,
      bold: boldWords > totalWords / 2,
      textAlign: isCentered ? 'center' : 'left',
      lineCount: paraLines.length,
    } as OcrBlock;
  });
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
      ...tesseractPaths(),
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

    const allWords: OcrBlock[] = [];
    const tData = data as any;

    if (tData && tData.blocks && tData.blocks.length > 0) {
      for (const block of tData.blocks) {
        const paras = block.paragraphs ?? [];
        for (const para of paras) {
          const lines = para.lines ?? [];
          if (lines.length === 0) continue;

          for (const line of lines) {
            const words = line.words ?? [];
            for (const word of words) {
              if ((word.confidence ?? 0) < 30) continue;
              const text = (word.text ?? '').trim();
              if (!text) continue;

              const x = word.bbox.x0 / canvas.width;
              const y = word.bbox.y0 / canvas.height;
              const w = (word.bbox.x1 - word.bbox.x0) / canvas.width;
              const h = (word.bbox.y1 - word.bbox.y0) / canvas.height;

              const ocrWord: OcrBlock = { text, confidence: word.confidence, x, y, w, h };
              allWords.push(ocrWord);
            }
          }
        }
      }
    } else {
      console.warn('[OCR] No blocks. Available keys:', tData ? Object.keys(tData) : 'null');
    }

    // Aplica heurísticas de fonte e negrito considerando a página inteira
    clampOutlierHeights(allWords); 
    assignFontSizes(allWords);      
    detectBoldBlocks(allWords, canvas); 

    // Constrói os blocos finais fundindo palavras em linhas e parágrafos estruturados
    const finalBlocks: OcrBlock[] = mergeParagraphBlocks(allWords);

    console.log('[OCR] Extracted', allWords.length, 'words →', finalBlocks.length, 'merged paragraph blocks');
    return { lang: lang as OcrLang, blocks: finalBlocks, fullText: data.text };
  }

  async terminate(): Promise<void> {
    for (const worker of this.workerCache.values()) {
      await worker.terminate();
    }
    this.workerCache.clear();
  }
}
