import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';
import {
  orderedNumIds,
  parseDocx,
  renderBlocks,
  type DocxBlock,
  type DocxOutput,
} from '../../../core/office/docx-text';
import { officeKindOf } from '../../../core/office/metadata';

export interface WordTextResult {
  readonly text: string;
  readonly blocks: readonly DocxBlock[];
  readonly headings: number;
  readonly tables: number;
  readonly words: number;
}

/**
 * Lê o corpo de um `.docx` e devolve texto.
 *
 * Toda a decisão está em `core/office/docx-text.ts`; aqui só se abre o zip e se
 * escolhem as duas partes que importam. `word/document.xml` é o corpo, e
 * `word/numbering.xml` é o que diz se uma lista é numerada — ela pode não
 * existir, e um documento sem lista nenhuma é o caso comum.
 *
 * Só `.docx` entra. Um `.xlsx` é uma planilha e um `.pptx` são slides: os três
 * são zips de OOXML, mas o corpo de cada um mora em outro lugar e tem outra
 * gramática, e fingir que a mesma leitura serve devolveria vazio em silêncio.
 */
@Injectable({ providedIn: 'root' })
export class WordTextService {
  async extract(file: File, output: DocxOutput): Promise<WordTextResult> {
    if (officeKindOf(file.name) !== 'docx') throw new AppError('office_not_word');

    const { unzipSync } = await import('fflate');

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new AppError('office_unsupported');
    }

    const decoder = new TextDecoder();
    const documentXml = entries['word/document.xml'];
    if (!documentXml) throw new AppError('office_unsupported');

    const numbering = entries['word/numbering.xml'];

    const blocks = parseDocx(decoder.decode(documentXml), {
      ordered: orderedNumIds(numbering ? decoder.decode(numbering) : null),
    });

    const text = renderBlocks(blocks, output);

    return {
      text,
      blocks,
      headings: blocks.filter((block) => block.kind === 'heading').length,
      tables: blocks.filter((block) => block.kind === 'table').length,
      words: countWords(text),
    };
  }
}

/**
 * Palavras, e não caracteres.
 *
 * Uma contagem de caracteres não diz nada a quem quer saber se a extração
 * pegou o documento inteiro; "1.240 palavras" ao lado de um Word que declara
 * 1.238 diz tudo. A conta ignora a marcação de Markdown, que não é palavra de
 * ninguém.
 */
function countWords(text: string): number {
  const clean = text.replace(/[#*_|>-]/g, ' ');
  const matches = clean.match(/\S+/g);
  return matches ? matches.length : 0;
}
