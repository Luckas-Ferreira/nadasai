import { Injectable, inject } from '@angular/core';
import { AppError } from '../../../core/errors';
import { closePdf } from '../../../core/pdf/pdfjs';
import {
  MAX_DIFF_LINES,
  diffLines,
  splitLines,
  toUnifiedDiff,
  type DiffResult,
} from '../../../core/text/diff';
import { inReadingOrder } from '../../pdf-to-word/services/pdf-to-word.service';
import { mergeNativeParagraphs } from '../../pdf/services/paragraph-merger';
import { PdfLoaderService } from '../../pdf/services/pdf-loader.service';

export interface ComparePdfOptions {
  readonly left: File;
  readonly right: File;
  readonly leftPassword?: string;
  readonly rightPassword?: string;
  readonly ignoreWhitespace: boolean;
  readonly ignoreCase: boolean;
  readonly onProgress?: (percent: number) => void;
}

export interface ComparePdfResult {
  readonly diff: DiffResult;
  readonly leftText: string;
  readonly rightText: string;
  /** Páginas sem camada de texto em cada lado — o comparador não as enxerga. */
  readonly leftScanned: number;
  readonly rightScanned: number;
  readonly identical: boolean;
}

/**
 * Compara o TEXTO de dois PDFs.
 *
 * Duas peças que já existiam, ligadas: a extração nativa do editor
 * (`PdfLoaderService` + `mergeNativeParagraphs` + `inReadingOrder`) e o Myers
 * de `core/text/diff.ts`. Nenhuma linha de algoritmo nova.
 *
 * O que esta ferramenta precisa deixar MUITO claro, e por isso está no topo:
 *
 *   * **Ela compara texto, não aparência.** Duas versões com o mesmo texto e
 *     layouts diferentes saem como idênticas; um logo trocado não aparece.
 *     Quem precisa comparar o desenho da página precisa de outra coisa.
 *   * **Página escaneada é invisível para ela.** Sem camada de texto não há o
 *     que comparar, e rodar OCR dos dois lados introduziria diferenças que são
 *     erro de reconhecimento e não de documento — que é o pior resultado
 *     possível numa ferramenta cuja saída as pessoas usam para decidir se um
 *     contrato mudou. O serviço CONTA essas páginas e o painel as anuncia.
 *
 * A comparação é por PARÁGRAFO e não por linha física: um PDF quebra linha onde
 * a margem manda, então comparar linhas marcaria como diferente todo parágrafo
 * cujo refluxo mudou por causa de uma palavra a mais no começo.
 */
@Injectable({ providedIn: 'root' })
export class ComparePdfService {
  private readonly loader = inject(PdfLoaderService);

  async compare(options: ComparePdfOptions): Promise<ComparePdfResult> {
    const { onProgress } = options;

    onProgress?.(10);
    const left = await this.extract(options.left, options.leftPassword);
    onProgress?.(50);
    const right = await this.extract(options.right, options.rightPassword);
    onProgress?.(80);

    const a = splitLines(left.text);
    const b = splitLines(right.text);

    if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
      throw new AppError('text_too_large');
    }

    if (left.text.trim() === '' && right.text.trim() === '') {
      throw new AppError('pdf_no_text');
    }

    const diff = diffLines(a, b, {
      ignoreWhitespace: options.ignoreWhitespace,
      ignoreCase: options.ignoreCase,
    });

    onProgress?.(100);

    return {
      diff,
      leftText: left.text,
      rightText: right.text,
      leftScanned: left.scanned,
      rightScanned: right.scanned,
      identical: diff.stats.added === 0 && diff.stats.removed === 0,
    };
  }

  /** O diff unificado, para quem quer anexar a comparação a um e-mail ou ticket. */
  unified(result: ComparePdfResult, leftName: string, rightName: string): Blob {
    const text = toUnifiedDiff(result.diff, leftName, rightName);
    return new Blob([text], { type: 'text/plain;charset=utf-8' });
  }

  /**
   * Um parágrafo por linha. Página escaneada não contribui texto nenhum — só é
   * contada, para o painel poder dizer que ela existe.
   */
  private async extract(
    file: File,
    password?: string,
  ): Promise<{ text: string; scanned: number }> {
    const loaded = await this.loader.load(file, password);
    const parts: string[] = [];
    let scanned = 0;

    try {
      for (const page of loaded.pages) {
        if (page.type !== 'digital') {
          scanned++;
          continue;
        }

        for (const block of inReadingOrder(mergeNativeParagraphs(page.nativeBlocks))) {
          const text = block.text.trim();
          if (text) parts.push(text);
        }
      }
    } finally {
      await closePdf(loaded.doc);
    }

    return { text: parts.join('\n'), scanned };
  }
}
