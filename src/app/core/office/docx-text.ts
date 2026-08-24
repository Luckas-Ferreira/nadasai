/**
 * O TEXTO DE UM .DOCX, e por que ele sai como Markdown e não como layout.
 *
 * O corpo de um Word está em `word/document.xml`, e a estrutura que interessa
 * está toda lá: parágrafo, estilo de título, item de lista, tabela, negrito e
 * itálico. O que NÃO está — e é justamente o que faz um Word→PDF honesto ser
 * impossível no navegador — é o layout: onde a página quebra, como a coluna
 * flui, o que o cabeçalho faz. Markdown é o formato que carrega a primeira
 * metade e admite não ter a segunda.
 *
 * A leitura é por DOMParser e não por expressão regular. O `metadata.ts` ao
 * lado usa regex porque procura CAMPOS numa lista rasa; aqui a estrutura é
 * aninhada — tabela dentro de célula dentro de linha —, e casar isso com regex
 * é a receita conhecida de um parser que funciona nos exemplos e falha no
 * documento de alguém.
 */

export type DocxOutput = 'markdown' | 'text';

export type DocxBlock =
  | { readonly kind: 'heading'; readonly level: number; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'list'; readonly level: number; readonly ordered: boolean; readonly text: string }
  | { readonly kind: 'table'; readonly rows: readonly (readonly string[])[] };

export interface ParseOptions {
  /** Os `numId` que numeram em vez de marcar com ponto. Ver `orderedNumIds`. */
  readonly ordered?: ReadonlySet<string>;
}

/**
 * Quais listas do documento são NUMERADAS.
 *
 * A informação não está no parágrafo: ele traz um `numId`, e o formato mora em
 * `word/numbering.xml`, atrás de mais um salto — `num` aponta para
 * `abstractNum`, e é lá que está o `numFmt`. Sem seguir esses dois saltos toda
 * lista viraria marcador, e uma lista de passos numerados perderia a ordem que
 * é a razão de ela existir.
 *
 * Só o nível 0 é consultado: aninhamento com formato diferente por nível existe
 * e é raro, e assumir o nível de cima erra menos do que assumir marcador.
 */
export function orderedNumIds(numberingXml: string | null): ReadonlySet<string> {
  const ordered = new Set<string>();
  if (!numberingXml) return ordered;

  const doc = parseXml(numberingXml);
  if (!doc) return ordered;

  const formatOf = new Map<string, string>();
  for (const abstract of Array.from(doc.getElementsByTagName('w:abstractNum'))) {
    const id = abstract.getAttribute('w:abstractNumId');
    if (!id) continue;

    for (const level of Array.from(abstract.getElementsByTagName('w:lvl'))) {
      if (level.getAttribute('w:ilvl') !== '0') continue;
      const fmt = level.getElementsByTagName('w:numFmt')[0]?.getAttribute('w:val');
      if (fmt) formatOf.set(id, fmt);
      break;
    }
  }

  for (const num of Array.from(doc.getElementsByTagName('w:num'))) {
    const numId = num.getAttribute('w:numId');
    const abstractId = num.getElementsByTagName('w:abstractNumId')[0]?.getAttribute('w:val');
    if (!numId || !abstractId) continue;

    const fmt = formatOf.get(abstractId);
    if (fmt && fmt !== 'bullet' && fmt !== 'none') ordered.add(numId);
  }

  return ordered;
}

export function parseDocx(documentXml: string, options: ParseOptions = {}): DocxBlock[] {
  const doc = parseXml(documentXml);
  if (!doc) return [];

  const body = doc.getElementsByTagName('w:body')[0] ?? doc.documentElement;
  if (!body) return [];

  const blocks: DocxBlock[] = [];

  // Só os filhos DIRETOS do corpo: um `<w:p>` dentro de uma célula pertence à
  // tabela, e varrer por `getElementsByTagName` o traria duas vezes — uma solto
  // e outra dentro da tabela.
  for (const node of Array.from(body.children)) {
    if (node.tagName === 'w:p') {
      const block = paragraphOf(node, options.ordered ?? new Set());
      if (block) blocks.push(block);
    } else if (node.tagName === 'w:tbl') {
      const table = tableOf(node);
      if (table) blocks.push(table);
    }
  }

  return blocks;
}

function paragraphOf(node: Element, ordered: ReadonlySet<string>): DocxBlock | null {
  const text = runsOf(node);
  const properties = directChild(node, 'w:pPr');

  const numbering = properties ? directChild(properties, 'w:numPr') : null;
  if (numbering) {
    // Item de lista VAZIO ainda é um item; um parágrafo vazio não é nada.
    const level = Number(numbering.getElementsByTagName('w:ilvl')[0]?.getAttribute('w:val') ?? '0');
    const numId = numbering.getElementsByTagName('w:numId')[0]?.getAttribute('w:val') ?? '';

    return {
      kind: 'list',
      level: Number.isFinite(level) ? Math.max(0, level) : 0,
      ordered: ordered.has(numId),
      text,
    };
  }

  if (!text) return null;

  const style = properties?.getElementsByTagName('w:pStyle')[0]?.getAttribute('w:val') ?? '';
  const level = headingLevelOf(style);

  return level ? { kind: 'heading', level, text } : { kind: 'paragraph', text };
}

/**
 * O nível de título a partir do ID do estilo.
 *
 * O ID não é traduzido na maioria dos documentos, mas o Word em português
 * grava `Ttulo1` e `Titulo1` em versões diferentes — o primeiro é `Título` com
 * o acento perdido na normalização do ID. Aceitar as três formas custa uma
 * alternância e evita que um documento inteiro em português perca os títulos.
 */
function headingLevelOf(style: string): number {
  const match = /^(?:heading|t[íi]?tulo)\s*(\d)$/i.exec(style.trim());
  if (!match) return 0;

  const level = Number(match[1]);
  return level >= 1 && level <= 6 ? level : 0;
}

/** O texto de um parágrafo, com negrito e itálico marcados em Markdown. */
function runsOf(node: Element): string {
  let out = '';

  for (const run of Array.from(node.getElementsByTagName('w:r'))) {
    const properties = directChild(run, 'w:rPr');
    const bold = !!properties && !!directChild(properties, 'w:b');
    const italic = !!properties && !!directChild(properties, 'w:i');

    let piece = '';
    for (const child of Array.from(run.children)) {
      if (child.tagName === 'w:t') piece += child.textContent ?? '';
      else if (child.tagName === 'w:br') piece += '\n';
      else if (child.tagName === 'w:tab') piece += '\t';
    }

    if (!piece) continue;

    // A marcação envolve o TRECHO e não o espaço em volta: "**texto **outro"
    // não é negrito em Markdown nenhum, e o Word separa as corridas em lugares
    // que produzem exatamente isso.
    const leading = piece.match(/^\s*/)?.[0] ?? '';
    const trailing = piece.match(/\s*$/)?.[0] ?? '';
    const core = piece.slice(leading.length, piece.length - trailing.length);

    if (core && (bold || italic)) {
      const marks = (bold ? '**' : '') + (italic ? '_' : '');
      piece = `${leading}${marks}${core}${reverse(marks)}${trailing}`;
    }

    out += piece;
  }

  return out.trim();
}

function tableOf(node: Element): DocxBlock | null {
  const rows: string[][] = [];

  for (const row of Array.from(node.children)) {
    if (row.tagName !== 'w:tr') continue;

    const cells: string[] = [];
    for (const cell of Array.from(row.children)) {
      if (cell.tagName !== 'w:tc') continue;

      const lines: string[] = [];
      for (const paragraph of Array.from(cell.getElementsByTagName('w:p'))) {
        const text = runsOf(paragraph);
        if (text) lines.push(text);
      }

      // Quebra de linha dentro de célula não existe em tabela de Markdown; um
      // espaço mantém o conteúdo legível em vez de destruir a grade.
      cells.push(lines.join(' '));
    }

    if (cells.length) rows.push(cells);
  }

  return rows.length ? { kind: 'table', rows } : null;
}

export function renderBlocks(blocks: readonly DocxBlock[], output: DocxOutput): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case 'heading':
        parts.push(output === 'markdown' ? `${'#'.repeat(block.level)} ${block.text}` : block.text);
        break;

      case 'paragraph':
        parts.push(output === 'markdown' ? block.text : stripMarks(block.text));
        break;

      case 'list': {
        const indent = '  '.repeat(block.level);
        const marker = block.ordered ? '1.' : '-';
        const text = output === 'markdown' ? block.text : stripMarks(block.text);
        parts.push(output === 'markdown' ? `${indent}${marker} ${text}` : `${indent}${marker} ${text}`);
        break;
      }

      case 'table':
        parts.push(output === 'markdown' ? markdownTable(block.rows) : plainTable(block.rows));
        break;
    }
  }

  return parts.join('\n\n').trim() + '\n';
}

/**
 * A tabela em Markdown precisa da linha de separação, e ela precisa ter o mesmo
 * número de colunas da primeira linha — senão nenhum leitor a reconhece como
 * tabela e o resultado vira um bloco de canos soltos.
 */
function markdownTable(rows: readonly (readonly string[])[]): string {
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row: readonly string[]) => [...row, ...Array(width - row.length).fill('')];

  const line = (row: readonly string[]) =>
    `| ${pad(row).map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`;

  const [head, ...body] = rows;
  return [line(head), `| ${Array(width).fill('---').join(' | ')} |`, ...body.map(line)].join('\n');
}

function plainTable(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(stripMarks).join('\t')).join('\n');
}

function stripMarks(text: string): string {
  return text.replace(/\*\*/g, '').replace(/(^|\W)_(\S[^_]*\S|\S)_(\W|$)/g, '$1$2$3');
}

function reverse(marks: string): string {
  return marks === '**_' ? '_**' : marks;
}

function directChild(node: Element, tag: string): Element | null {
  for (const child of Array.from(node.children)) if (child.tagName === tag) return child;
  return null;
}

function parseXml(xml: string): Document | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}
