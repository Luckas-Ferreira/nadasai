import { orderedNumIds, parseDocx, renderBlocks } from './docx-text';

/** Envolve o corpo com os namespaces que todo `document.xml` traz. */
function docx(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`;
}

const para = (text: string, properties = '') =>
  `<w:p>${properties}<w:r><w:t>${text}</w:t></w:r></w:p>`;

const heading = (level: number, text: string) =>
  para(text, `<w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>`);

const listItem = (text: string, numId = '1', ilvl = '0') =>
  para(
    text,
    `<w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`,
  );

describe('docx-text', () => {
  describe('parseDocx', () => {
    it('reads paragraphs in order', () => {
      const blocks = parseDocx(docx(para('Primeiro') + para('Segundo')));

      expect(blocks).toEqual([
        { kind: 'paragraph', text: 'Primeiro' },
        { kind: 'paragraph', text: 'Segundo' },
      ]);
    });

    it('turns the heading styles into levels', () => {
      const blocks = parseDocx(docx(heading(1, 'Título') + heading(3, 'Sub')));

      expect(blocks).toEqual([
        { kind: 'heading', level: 1, text: 'Título' },
        { kind: 'heading', level: 3, text: 'Sub' },
      ]);
    });

    /**
     * O Word em português grava o ID do estilo como `Ttulo1` — `Título` com o
     * acento perdido na normalização. Sem aceitar essa forma, um documento
     * inteiro em português perde todos os títulos e vira uma sequência de
     * parágrafos.
     */
    it('accepts the Portuguese heading style ids', () => {
      const blocks = parseDocx(
        docx(para('Um', '<w:pPr><w:pStyle w:val="Ttulo2"/></w:pPr>')),
      );

      expect(blocks).toEqual([{ kind: 'heading', level: 2, text: 'Um' }]);
    });

    it('drops empty paragraphs but keeps empty list items', () => {
      const blocks = parseDocx(docx('<w:p></w:p>' + listItem('')));

      expect(blocks).toEqual([{ kind: 'list', level: 0, ordered: false, text: '' }]);
    });

    it('marks bold and italic runs', () => {
      const body = `<w:p>
        <w:r><w:t>normal </w:t></w:r>
        <w:r><w:rPr><w:b/></w:rPr><w:t>forte</w:t></w:r>
        <w:r><w:t> e </w:t></w:r>
        <w:r><w:rPr><w:i/></w:rPr><w:t>torto</w:t></w:r>
      </w:p>`;

      expect(parseDocx(docx(body))).toEqual([
        { kind: 'paragraph', text: 'normal **forte** e _torto_' },
      ]);
    });

    /**
     * O Word separa as corridas em lugares que deixam o espaço DENTRO do
     * trecho, e "**texto **outro" não é negrito em Markdown nenhum. A marcação
     * tem de envolver o texto e não o espaço.
     */
    it('keeps the marks off the surrounding spaces', () => {
      const body = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">forte </w:t></w:r><w:r><w:t>resto</w:t></w:r></w:p>`;

      expect(parseDocx(docx(body))).toEqual([{ kind: 'paragraph', text: '**forte** resto' }]);
    });

    it('reads a table as rows of cells', () => {
      const body = `<w:tbl>
        <w:tr><w:tc>${para('A')}</w:tc><w:tc>${para('B')}</w:tc></w:tr>
        <w:tr><w:tc>${para('1')}</w:tc><w:tc>${para('2')}</w:tc></w:tr>
      </w:tbl>`;

      expect(parseDocx(docx(body))).toEqual([
        { kind: 'table', rows: [['A', 'B'], ['1', '2']] },
      ]);
    });

    /**
     * Um parágrafo dentro de célula pertence à TABELA. Varrer o documento por
     * `getElementsByTagName` o traria duas vezes — uma solto e outra dentro da
     * tabela —, e o texto apareceria duplicado.
     */
    it('does not repeat the paragraphs that live inside a table', () => {
      const body = `${para('Antes')}<w:tbl><w:tr><w:tc>${para('Dentro')}</w:tc></w:tr></w:tbl>`;
      const blocks = parseDocx(docx(body));

      expect(blocks.length).toBe(2);
      expect(blocks[0]).toEqual({ kind: 'paragraph', text: 'Antes' });
      expect(blocks[1].kind).toBe('table');
    });

    it('reads the nesting level of a list', () => {
      const blocks = parseDocx(docx(listItem('Um') + listItem('Fundo', '1', '2')));

      expect(blocks).toEqual([
        { kind: 'list', level: 0, ordered: false, text: 'Um' },
        { kind: 'list', level: 2, ordered: false, text: 'Fundo' },
      ]);
    });

    it('survives malformed XML instead of throwing', () => {
      expect(parseDocx('<w:document><w:body>')).toEqual([]);
    });
  });

  describe('orderedNumIds', () => {
    const numbering = (fmt: string) => `<?xml version="1.0"?>
      <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:abstractNum w:abstractNumId="7">
          <w:lvl w:ilvl="0"><w:numFmt w:val="${fmt}"/></w:lvl>
        </w:abstractNum>
        <w:num w:numId="3"><w:abstractNumId w:val="7"/></w:num>
      </w:numbering>`;

    /**
     * O formato NÃO está no parágrafo: ele traz um numId, e o caminho até o
     * formato passa por `num` → `abstractNum` → `numFmt`. Sem seguir os dois
     * saltos, toda lista numerada viraria marcador.
     */
    it('follows numId to abstractNum to numFmt', () => {
      expect(orderedNumIds(numbering('decimal')).has('3')).toBe(true);
      expect(orderedNumIds(numbering('lowerLetter')).has('3')).toBe(true);
    });

    it('does not call a bullet list ordered', () => {
      expect(orderedNumIds(numbering('bullet')).has('3')).toBe(false);
      expect(orderedNumIds(numbering('none')).has('3')).toBe(false);
    });

    it('is empty when the document has no numbering part', () => {
      expect(orderedNumIds(null).size).toBe(0);
    });

    it('makes the list ordered in the parsed block', () => {
      const blocks = parseDocx(docx(listItem('Passo', '3')), {
        ordered: orderedNumIds(numbering('decimal')),
      });

      expect(blocks).toEqual([{ kind: 'list', level: 0, ordered: true, text: 'Passo' }]);
    });
  });

  describe('renderBlocks', () => {
    it('writes headings with hashes in markdown', () => {
      const out = renderBlocks(parseDocx(docx(heading(2, 'Escopo'))), 'markdown');
      expect(out.trim()).toBe('## Escopo');
    });

    it('writes headings as bare lines in plain text', () => {
      const out = renderBlocks(parseDocx(docx(heading(2, 'Escopo'))), 'text');
      expect(out.trim()).toBe('Escopo');
    });

    it('strips the emphasis marks in plain text', () => {
      const body = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>forte</w:t></w:r></w:p>`;
      expect(renderBlocks(parseDocx(docx(body)), 'text').trim()).toBe('forte');
      expect(renderBlocks(parseDocx(docx(body)), 'markdown').trim()).toBe('**forte**');
    });

    /**
     * Sem a linha de separação, e com ela do tamanho certo, nenhum leitor
     * reconhece a tabela — o resultado vira um bloco de canos soltos.
     */
    it('writes a markdown table with its separator row', () => {
      const body = `<w:tbl>
        <w:tr><w:tc>${para('A')}</w:tc><w:tc>${para('B')}</w:tc></w:tr>
        <w:tr><w:tc>${para('1')}</w:tc><w:tc>${para('2')}</w:tc></w:tr>
      </w:tbl>`;

      expect(renderBlocks(parseDocx(docx(body)), 'markdown').trim()).toBe(
        ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n'),
      );
    });

    it('pads a short row so the table stays a table', () => {
      const body = `<w:tbl>
        <w:tr><w:tc>${para('A')}</w:tc><w:tc>${para('B')}</w:tc></w:tr>
        <w:tr><w:tc>${para('só uma')}</w:tc></w:tr>
      </w:tbl>`;

      const lines = renderBlocks(parseDocx(docx(body)), 'markdown').trim().split('\n');
      expect(lines[2]).toBe('| só uma |  |');
    });

    it('indents a nested list and numbers an ordered one', () => {
      const blocks = parseDocx(docx(listItem('Um') + listItem('Dentro', '1', '1')));
      const out = renderBlocks(blocks, 'markdown').trim().split('\n\n');

      expect(out[0]).toBe('- Um');
      expect(out[1]).toBe('  - Dentro');
    });

    it('ends with a single trailing newline', () => {
      const out = renderBlocks(parseDocx(docx(para('Fim'))), 'markdown');
      expect(out.endsWith('\n')).toBe(true);
      expect(out.endsWith('\n\n')).toBe(false);
    });
  });
});
