/**
 * FOTO DE DOCUMENTO: medida FÍSICA, não proporção.
 *
 * Esta é a diferença inteira entre esta ferramenta e o recortar imagem, e é o
 * que justifica ela existir. "3x4" não é a razão 3:4 — é três centímetros por
 * quatro, impressos. Uma foto recortada na proporção certa e exportada em 200
 * pixels de largura sai borrada da gráfica; a mesma foto em 4000 pixels
 * desperdiça arquivo sem melhorar nada. O que decide o tamanho em pixel é o
 * DPI, e é por isso que ele é fixo e declarado aqui em vez de ser um controle.
 *
 * E o produto que as pessoas de fato querem não é uma foto: é a FOLHA. Ninguém
 * leva um arquivo de 3x4 à gráfica — leva uma folha 10x15 com o máximo de
 * cópias que couber e a linha de corte. Por isso o cálculo da grade mora aqui,
 * puro e testado, em vez de dentro de um componente.
 */

/** 300 DPI é o mínimo que uma gráfica trata como foto, e o teto útil para 3x4. */
export const PRINT_DPI = 300;

const MM_PER_INCH = 25.4;

export type PhotoFormatId = '3x4' | '5x7' | '2x2' | '35x45';
export type SheetId = 'single' | '10x15' | 'a4';

export interface PhysicalSize {
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface PhotoFormat extends PhysicalSize {
  readonly id: PhotoFormatId;
}

export interface Sheet extends PhysicalSize {
  readonly id: SheetId;
}

/**
 * Os quatro que as pessoas pedem, em milímetros.
 *
 * O 2x2 é o passaporte americano, que é definido em POLEGADAS — 2 por 2, ou
 * 50,8 mm. Arredondar para 50 é a diferença entre a foto ser aceita e ser
 * recusada no guichê, então o valor fica exato e a conversão é que se vira.
 */
export const PHOTO_FORMATS: readonly PhotoFormat[] = [
  { id: '3x4', widthMm: 30, heightMm: 40 },
  { id: '5x7', widthMm: 50, heightMm: 70 },
  { id: '2x2', widthMm: 50.8, heightMm: 50.8 },
  { id: '35x45', widthMm: 35, heightMm: 45 },
];

export const SHEETS: readonly Sheet[] = [
  // A folha "single" é a própria foto: mesma máquina, uma cópia, sem margem.
  { id: 'single', widthMm: 0, heightMm: 0 },
  { id: '10x15', widthMm: 100, heightMm: 150 },
  { id: 'a4', widthMm: 210, heightMm: 297 },
];

/** Respiro na borda e entre as fotos. Milímetros, porque a folha é física. */
export const SHEET_MARGIN_MM = 3;
export const SHEET_GAP_MM = 2;

export interface SheetLayout {
  readonly cols: number;
  readonly rows: number;
  readonly count: number;
  /** Canto superior esquerdo da grade, em milímetros a partir da folha. */
  readonly offsetXMm: number;
  readonly offsetYMm: number;
  readonly photo: PhysicalSize;
  readonly sheet: PhysicalSize;
}

export function mmToPx(mm: number, dpi = PRINT_DPI): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

export function formatById(id: PhotoFormatId): PhotoFormat {
  const found = PHOTO_FORMATS.find((f) => f.id === id);
  if (!found) throw new Error(`unknown photo format: ${id}`);
  return found;
}

export function sheetById(id: SheetId): Sheet {
  const found = SHEETS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown sheet: ${id}`);
  return found;
}

/**
 * Quantas fotos cabem, e onde cada uma começa.
 *
 * A grade é CENTRALIZADA na folha em vez de encostada na margem: o corte de uma
 * gráfica raramente cai no milímetro, e sobra igual dos dois lados é o que
 * perdoa esse erro. Encostar tudo em cima e à esquerda concentraria toda a
 * folga numa borda só.
 *
 * `single` devolve exatamente uma foto sem folha em volta — é o mesmo caminho,
 * com a folha do tamanho da foto, e não um segundo código.
 */
export function sheetLayout(format: PhotoFormat, sheet: Sheet): SheetLayout {
  if (sheet.id === 'single') {
    return {
      cols: 1,
      rows: 1,
      count: 1,
      offsetXMm: 0,
      offsetYMm: 0,
      photo: { widthMm: format.widthMm, heightMm: format.heightMm },
      sheet: { widthMm: format.widthMm, heightMm: format.heightMm },
    };
  }

  const usableW = sheet.widthMm - 2 * SHEET_MARGIN_MM;
  const usableH = sheet.heightMm - 2 * SHEET_MARGIN_MM;

  const cols = fitCount(usableW, format.widthMm);
  const rows = fitCount(usableH, format.heightMm);

  const gridW = cols * format.widthMm + Math.max(0, cols - 1) * SHEET_GAP_MM;
  const gridH = rows * format.heightMm + Math.max(0, rows - 1) * SHEET_GAP_MM;

  return {
    cols,
    rows,
    count: cols * rows,
    offsetXMm: (sheet.widthMm - gridW) / 2,
    offsetYMm: (sheet.heightMm - gridH) / 2,
    photo: { widthMm: format.widthMm, heightMm: format.heightMm },
    sheet: { widthMm: sheet.widthMm, heightMm: sheet.heightMm },
  };
}

/**
 * Quantas peças de `size` cabem em `available`, contando o vão ENTRE elas.
 *
 * n peças têm n-1 vãos, não n. Contar um vão a mais é o erro que tira a última
 * coluna de toda folha, e ele passa despercebido porque o resultado continua
 * plausível — só cabe menos foto do que caberia.
 */
function fitCount(available: number, size: number): number {
  if (size <= 0 || available < size) return 0;
  return Math.max(1, Math.floor((available + SHEET_GAP_MM) / (size + SHEET_GAP_MM)));
}

/** A posição de cada foto na folha, em milímetros, na ordem de leitura. */
export function cellPositions(layout: SheetLayout): readonly { xMm: number; yMm: number }[] {
  const cells: { xMm: number; yMm: number }[] = [];

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      cells.push({
        xMm: layout.offsetXMm + col * (layout.photo.widthMm + SHEET_GAP_MM),
        yMm: layout.offsetYMm + row * (layout.photo.heightMm + SHEET_GAP_MM),
      });
    }
  }

  return cells;
}
