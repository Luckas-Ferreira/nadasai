import {
  columnIndex,
  dateStyles,
  parseSheet,
  serialToIso,
  sharedStrings,
  toCsv,
  toJson,
  usesDate1904,
  workbookSheets,
} from './xlsx-read';

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

const sheet = (rowsXml: string) =>
  `<?xml version="1.0"?><worksheet ${NS}><sheetData>${rowsXml}</sheetData></worksheet>`;

const plain = { shared: [], dateStyles: new Set<number>() };

describe('xlsx-read', () => {
  describe('columnIndex', () => {
    it('reads the column letters as positions', () => {
      expect(columnIndex('A1')).toBe(0);
      expect(columnIndex('C5')).toBe(2);
      expect(columnIndex('Z9')).toBe(25);
    });

    /**
     * Base 26 SEM zero: `AA` é o 27º e não o 26º. Tratar como base 26 comum
     * põe a coluna 27 no lugar da 1 — e o erro só aparece em planilha larga.
     */
    it('handles the two-letter columns, which are base 26 without a zero', () => {
      expect(columnIndex('AA1')).toBe(26);
      expect(columnIndex('AB1')).toBe(27);
      expect(columnIndex('BA1')).toBe(52);
    });
  });

  describe('parseSheet', () => {
    /**
     * O DEFEITO CENTRAL do formato: uma linha OMITE as células vazias. Empilhar
     * na ordem em que aparecem desloca tudo para a esquerda a partir do
     * primeiro buraco, e a planilha sai com as colunas trocadas.
     */
    it('places cells by their reference, not by their order', () => {
      const rows = parseSheet(
        sheet('<row><c r="A1"><v>1</v></c><c r="D1"><v>4</v></c></row>'),
        plain,
      );

      expect(rows).toEqual([['1', '', '', '4']]);
    });

    it('resolves shared strings', () => {
      const rows = parseSheet(sheet('<row><c r="A1" t="s"><v>1</v></c></row>'), {
        shared: ['zero', 'um'],
        dateStyles: new Set(),
      });

      expect(rows).toEqual([['um']]);
    });

    it('reads an inline string', () => {
      const rows = parseSheet(
        sheet('<row><c r="A1" t="inlineStr"><is><t>direto</t></is></c></row>'),
        plain,
      );

      expect(rows).toEqual([['direto']]);
    });

    it('writes booleans as words', () => {
      const rows = parseSheet(
        sheet('<row><c r="A1" t="b"><v>1</v></c><c r="B1" t="b"><v>0</v></c></row>'),
        plain,
      );

      expect(rows).toEqual([['TRUE', 'FALSE']]);
    });

    it('keeps a number exactly as the file wrote it', () => {
      const rows = parseSheet(sheet('<row><c r="A1"><v>1234.5678</v></c></row>'), plain);

      expect(rows).toEqual([['1234.5678']]);
    });

    /** Data não é tipo: é número mais formato. Sem o estilo, sai 45000. */
    it('turns a serial into a date only when the style says so', () => {
      const xml = sheet('<row><c r="A1" s="3"><v>45000</v></c><c r="B1" s="0"><v>45000</v></c></row>');
      const rows = parseSheet(xml, { shared: [], dateStyles: new Set([3]) });

      expect(rows[0][0]).toBe('2023-03-15');
      expect(rows[0][1]).toBe('45000');
    });

    it('drops the empty rows at the end', () => {
      const rows = parseSheet(
        sheet('<row><c r="A1"><v>1</v></c></row><row></row><row></row>'),
        plain,
      );

      expect(rows).toEqual([['1']]);
    });

    it('returns nothing for malformed XML instead of throwing', () => {
      expect(parseSheet('<worksheet>', plain)).toEqual([]);
    });
  });

  describe('serialToIso', () => {
    /**
     * A base é 30/12/1899 e não 31: o Excel trata 1900 como bissexto, erro
     * herdado do Lotus e mantido de propósito. A base deslocada é o que faz as
     * datas baterem sem um caso especial.
     */
    it('anchors on the Excel epoch, leap-year bug and all', () => {
      expect(serialToIso(1)).toBe('1899-12-31');
      expect(serialToIso(61)).toBe('1900-03-01');
      expect(serialToIso(45000)).toBe('2023-03-15');
    });

    it('shows the time only when there is a time', () => {
      expect(serialToIso(45000)).toBe('2023-03-15');
      expect(serialToIso(45000.5)).toBe('2023-03-15 12:00:00');
    });

    it('supports the 1904 base of old Mac workbooks', () => {
      expect(serialToIso(0, true)).toBe('1904-01-01');
    });
  });

  describe('dateStyles', () => {
    const styles = (xfs: string, formats = '') => `<?xml version="1.0"?><styleSheet ${NS}>
      <numFmts>${formats}</numFmts><cellXfs>${xfs}</cellXfs></styleSheet>`;

    it('recognises the built-in date formats', () => {
      const found = dateStyles(styles('<xf numFmtId="0"/><xf numFmtId="14"/>'));

      expect(found.has(0)).toBe(false);
      expect(found.has(1)).toBe(true);
    });

    it('recognises a custom format that names day, month or year', () => {
      const found = dateStyles(
        styles('<xf numFmtId="164"/>', '<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>'),
      );

      expect(found.has(0)).toBe(true);
    });

    /** `[Red]0.00` não é data, e um "d" dentro de aspas também não. */
    it('does not mistake a number format for a date', () => {
      const found = dateStyles(
        styles('<xf numFmtId="164"/>', '<numFmt numFmtId="164" formatCode="0.00"/>'),
      );

      expect(found.has(0)).toBe(false);
    });

    it('is empty when there is no styles part', () => {
      expect(dateStyles(null).size).toBe(0);
    });
  });

  describe('sharedStrings', () => {
    it('joins the runs of one string', () => {
      const xml = `<?xml version="1.0"?><sst ${NS}>
        <si><r><t>Nome </t></r><r><t>completo</t></r></si>
        <si><t>Simples</t></si></sst>`;

      expect(sharedStrings(xml)).toEqual(['Nome completo', 'Simples']);
    });

    it('is empty when the part is missing', () => {
      expect(sharedStrings(null)).toEqual([]);
    });
  });

  describe('workbookSheets', () => {
    const workbook = `<?xml version="1.0"?><workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets><sheet name="Vendas" sheetId="1" r:id="rId1"/><sheet name="Notas" sheetId="2" r:id="rId9"/></sheets></workbook>`;

    /**
     * O caminho da aba mora nas RELAÇÕES, não na ordem. Adivinhar sheet1,
     * sheet2 funciona numa planilha nova e erra em qualquer uma que já teve
     * aba apagada — os arquivos não são renumerados.
     */
    it('resolves each sheet through the relationships', () => {
      const rels = `<?xml version="1.0"?><Relationships>
        <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId9" Target="/xl/worksheets/sheet4.xml"/></Relationships>`;

      expect(workbookSheets(workbook, rels)).toEqual([
        { name: 'Vendas', path: 'xl/worksheets/sheet1.xml' },
        { name: 'Notas', path: 'xl/worksheets/sheet4.xml' },
      ]);
    });

    it('falls back to the order when the relationships are unreadable', () => {
      const sheets = workbookSheets(workbook, null);

      expect(sheets.map((s) => s.path)).toEqual([
        'xl/worksheets/sheet1.xml',
        'xl/worksheets/sheet2.xml',
      ]);
    });

    it('reads the 1904 flag', () => {
      expect(usesDate1904(workbook)).toBe(false);
      expect(
        usesDate1904(`<?xml version="1.0"?><workbook ${NS}><workbookPr date1904="1"/></workbook>`),
      ).toBe(true);
    });
  });

  describe('toCsv', () => {
    it('quotes only what needs quoting', () => {
      const csv = toCsv([['a', 'b,c', 'd"e', 'f\ng']], ',');

      expect(csv).toBe('a,"b,c","d""e","f\ng"');
    });

    /**
     * O ponto e vírgula não é gosto: no Brasil a vírgula é o separador
     * DECIMAL, e o Excel de cá lê e escreve CSV com ponto e vírgula. Um arquivo
     * com vírgula abre lá com tudo numa coluna só.
     */
    it('changes what needs quoting when the delimiter changes', () => {
      expect(toCsv([['1,5', 'x']], ';')).toBe('1,5;x');
      expect(toCsv([['1;5', 'x']], ';')).toBe('"1;5";x');
    });

    it('pads short rows so every line has the same column count', () => {
      const csv = toCsv([['a', 'b', 'c'], ['d']], ',');

      expect(csv.split('\r\n')[1]).toBe('d,,');
    });
  });

  describe('toJson', () => {
    it('uses the first row as keys', () => {
      const json = JSON.parse(toJson([['nome', 'idade'], ['Ana', '30']], true));

      expect(json).toEqual([{ nome: 'Ana', idade: '30' }]);
    });

    /**
     * Uma primeira linha com célula vazia ou nome repetido não é cabeçalho —
     * usá-la assim perderia colunas em silêncio, e listas preservam tudo.
     */
    it('falls back to arrays when the first row cannot be a header', () => {
      expect(JSON.parse(toJson([['nome', ''], ['Ana', '30']], true))).toEqual([
        ['nome', ''],
        ['Ana', '30'],
      ]);

      expect(JSON.parse(toJson([['a', 'a'], ['1', '2']], true))).toEqual([
        ['a', 'a'],
        ['1', '2'],
      ]);
    });

    it('returns arrays when the header is not wanted', () => {
      expect(JSON.parse(toJson([['nome'], ['Ana']], false))).toEqual([['nome'], ['Ana']]);
    });

    it('handles an empty sheet', () => {
      expect(toJson([], true)).toBe('[]');
    });
  });
});
