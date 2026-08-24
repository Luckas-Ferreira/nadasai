/**
 * LER UMA PLANILHA, e por que isto é a extração HONESTA do Office.
 *
 * Um `.xlsx` guarda células com referência e tipo, e uma célula é DADO, não
 * layout: `C5` vale 42, ponto. Por isso esta leitura tem uma saída exata, ao
 * contrário de uma conversão de Word para PDF — não há motor de exibição
 * nenhum a imitar.
 *
 * O que o formato cobra por essa exatidão são três indireções, e cada uma tem
 * um defeito silencioso do outro lado:
 *
 *  1. A célula guarda a COLUNA na referência (`r="C5"`), e uma linha omite as
 *     células vazias inteiras. Empilhar as células na ordem em que aparecem
 *     desloca tudo para a esquerda a partir do primeiro buraco.
 *  2. Texto quase nunca está na célula: ela guarda um índice para
 *     `sharedStrings.xml`. Sem resolver, a planilha inteira sai como números.
 *  3. Data não existe como tipo: é um número, e o que a torna data é o FORMATO
 *     apontado pelo estilo. Sem ler os estilos, toda data vira 45000.
 */

export type CellValue = string;

export interface SheetRef {
  readonly name: string;
  /** Caminho dentro do zip, já resolvido a partir das relações. */
  readonly path: string;
}

export interface SheetOptions {
  readonly shared: readonly string[];
  /** Índices de `cellXfs` cujo formato é de data. */
  readonly dateStyles: ReadonlySet<number>;
  /** A base de 1904, usada por planilhas antigas do Excel para Mac. */
  readonly date1904?: boolean;
}

/**
 * As abas do arquivo, na ordem em que aparecem no Excel.
 *
 * O nome está no `workbook.xml` e o CAMINHO está noutro arquivo: a aba aponta
 * para um `r:id`, e o alvo mora em `xl/_rels/workbook.xml.rels`. Adivinhar
 * `sheet1.xml`, `sheet2.xml` pela ordem funciona na planilha que alguém criou
 * agora e erra em qualquer uma que já teve aba apagada — os arquivos não são
 * renumerados.
 */
export function workbookSheets(workbookXml: string, relsXml: string | null): SheetRef[] {
  const book = parseXml(workbookXml);
  if (!book) return [];

  const targets = new Map<string, string>();
  const rels = relsXml ? parseXml(relsXml) : null;

  if (rels) {
    for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) targets.set(id, normaliseTarget(target));
    }
  }

  const sheets: SheetRef[] = [];
  let fallback = 0;

  for (const sheet of Array.from(book.getElementsByTagName('sheet'))) {
    const name = sheet.getAttribute('name') ?? `Planilha${sheets.length + 1}`;
    const id = sheet.getAttribute('r:id') ?? sheet.getAttribute('relationshipId') ?? '';

    // Sem relação legível, a ordem é o melhor palpite que resta — e é melhor
    // do que devolver nada.
    const path = targets.get(id) ?? `xl/worksheets/sheet${++fallback}.xml`;
    sheets.push({ name, path });
  }

  return sheets;
}

function normaliseTarget(target: string): string {
  const clean = target.replace(/^\/+/, '');
  return clean.startsWith('xl/') ? clean : `xl/${clean}`;
}

/** A planilha usa a base de 1904? Só o Excel para Mac antigo grava assim. */
export function usesDate1904(workbookXml: string): boolean {
  const book = parseXml(workbookXml);
  const pr = book?.getElementsByTagName('workbookPr')[0];
  const value = pr?.getAttribute('date1904');
  return value === '1' || value === 'true';
}

/**
 * A tabela de textos compartilhados.
 *
 * Um `<si>` pode ter o texto direto ou quebrado em várias corridas com
 * formatação diferente — a mesma frase com uma palavra em negrito vira três
 * `<r>`. Concatenar as corridas é o que evita perder dois terços da frase.
 */
export function sharedStrings(xml: string | null): string[] {
  if (!xml) return [];

  const doc = parseXml(xml);
  if (!doc) return [];

  return Array.from(doc.getElementsByTagName('si')).map((si) => {
    const runs = si.getElementsByTagName('t');
    let text = '';
    for (const run of Array.from(runs)) text += run.textContent ?? '';
    return text;
  });
}

/** Formatos embutidos que o Excel trata como data ou hora. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * Quais estilos significam DATA.
 *
 * Uma data no Excel é um número; o que a distingue de 45000 é o formato ligado
 * à célula pelo estilo. O caminho é `c/@s` → `cellXfs[s]/@numFmtId` → ou um
 * formato embutido, ou um `numFmt` declarado no topo do arquivo.
 */
export function dateStyles(stylesXml: string | null): ReadonlySet<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;

  const doc = parseXml(stylesXml);
  if (!doc) return out;

  const custom = new Set<number>();
  for (const format of Array.from(doc.getElementsByTagName('numFmt'))) {
    const id = Number(format.getAttribute('numFmtId'));
    const code = format.getAttribute('formatCode') ?? '';
    // Um formato personalizado é de data quando tem marcador de dia, mês ou
    // ano fora de aspas. `[Red]0.00` não é, `dd/mm/yyyy` é.
    if (Number.isFinite(id) && /[dmyhs]/i.test(code.replace(/"[^"]*"/g, ''))) custom.add(id);
  }

  const cellXfs = doc.getElementsByTagName('cellXfs')[0];
  if (!cellXfs) return out;

  const xfs = Array.from(cellXfs.getElementsByTagName('xf'));
  for (let i = 0; i < xfs.length; i++) {
    const id = Number(xfs[i].getAttribute('numFmtId') ?? '0');
    if (BUILTIN_DATE_FORMATS.has(id) || custom.has(id)) out.add(i);
  }

  return out;
}

/**
 * A COLUNA a partir da referência da célula: `A` → 0, `Z` → 25, `AA` → 26.
 *
 * É a base 26 sem zero, que é a armadilha: `AA` não é 26 e sim 27 na contagem
 * de um a um, o que dá índice 26. Tratar como base 26 comum coloca a coluna 27
 * no lugar da 1.
 */
export function columnIndex(reference: string): number {
  const letters = /^([A-Z]+)/i.exec(reference)?.[1];
  if (!letters) return 0;

  let index = 0;
  for (const char of letters.toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

export function parseSheet(sheetXml: string, options: SheetOptions): CellValue[][] {
  const doc = parseXml(sheetXml);
  if (!doc) return [];

  const rows: CellValue[][] = [];

  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const cells: CellValue[] = [];

    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      // A POSIÇÃO vem da referência, nunca da ordem: uma linha omite as células
      // vazias, e empilhar na ordem desloca a planilha inteira para a esquerda
      // a partir do primeiro buraco.
      const at = columnIndex(cell.getAttribute('r') ?? '');
      while (cells.length < at) cells.push('');
      cells[at] = valueOf(cell, options);
    }

    rows.push(cells);
  }

  // Linhas totalmente vazias no fim são artefato de planilha, não conteúdo.
  while (rows.length && rows[rows.length - 1].every((cell) => cell === '')) rows.pop();

  return rows;
}

function valueOf(cell: Element, options: SheetOptions): CellValue {
  const type = cell.getAttribute('t') ?? 'n';

  if (type === 'inlineStr') {
    const runs = cell.getElementsByTagName('t');
    let text = '';
    for (const run of Array.from(runs)) text += run.textContent ?? '';
    return text;
  }

  const raw = cell.getElementsByTagName('v')[0]?.textContent ?? '';
  if (!raw) return '';

  if (type === 's') {
    const index = Number(raw);
    return options.shared[index] ?? '';
  }

  if (type === 'b') return raw === '1' ? 'TRUE' : 'FALSE';
  if (type === 'e' || type === 'str') return raw;

  const style = Number(cell.getAttribute('s') ?? '-1');
  if (options.dateStyles.has(style)) {
    const serial = Number(raw);
    if (Number.isFinite(serial)) return serialToIso(serial, options.date1904 ?? false);
  }

  return raw;
}

/**
 * O número de série do Excel vira data ISO.
 *
 * A base é 30 de dezembro de 1899, e não 31: o Excel trata 1900 como bissexto
 * — um erro herdado do Lotus 1-2-3 e mantido de propósito por compatibilidade —
 * e a base deslocada é o que faz as datas de 1900 em diante baterem sem um
 * `if` para cada caso.
 */
export function serialToIso(serial: number, date1904 = false): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(serial * 86_400_000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return String(serial);

  const iso = date.toISOString();
  const day = iso.slice(0, 10);

  // Só mostra hora quando existe hora: "2024-03-01 00:00:00" numa coluna de
  // datas é ruído em toda linha.
  const hasTime = Math.abs(serial - Math.floor(serial)) > 1e-9;
  return hasTime ? `${day} ${iso.slice(11, 19)}` : day;
}

export type CsvDelimiter = ',' | ';' | '\t';

/**
 * CSV, com o delimitador dito.
 *
 * O ponto e vírgula não é preferência regional gratuita: no Brasil e em boa
 * parte da Europa a vírgula é o separador DECIMAL, e o Excel dessas regiões lê
 * e escreve CSV com ponto e vírgula. Um arquivo com vírgula abre lá com tudo
 * numa coluna só.
 */
export function toCsv(rows: readonly (readonly CellValue[])[], delimiter: CsvDelimiter): string {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);

  return rows
    .map((row) => {
      const padded = [...row, ...Array(Math.max(0, width - row.length)).fill('')];
      return padded.map((cell) => escapeCsv(cell, delimiter)).join(delimiter);
    })
    .join('\r\n');
}

function escapeCsv(value: string, delimiter: string): string {
  const needsQuotes = value.includes(delimiter) || /["\r\n]/.test(value);
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * JSON, com a primeira linha virando as CHAVES quando ela serve de cabeçalho.
 *
 * "Serve" quer dizer: toda célula preenchida e nenhum nome repetido. Uma
 * planilha cuja primeira linha é um título mesclado produziria um objeto com
 * uma chave e o resto perdido, e é melhor devolver listas do que perder dado.
 */
export function toJson(rows: readonly (readonly CellValue[])[], useHeader: boolean): string {
  if (!rows.length) return '[]';

  const [first, ...rest] = rows;
  const usable = useHeader && first.length > 0 && first.every((cell) => cell.trim() !== '') &&
    new Set(first).size === first.length;

  if (!usable) return JSON.stringify(rows, null, 2);

  const out = rest.map((row) => {
    const record: Record<string, string> = {};
    first.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });
    return record;
  });

  return JSON.stringify(out, null, 2);
}

function parseXml(xml: string): Document | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}
