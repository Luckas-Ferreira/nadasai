import {
  PHOTO_FORMATS,
  PRINT_DPI,
  SHEET_GAP_MM,
  SHEET_MARGIN_MM,
  cellPositions,
  formatById,
  mmToPx,
  sheetById,
  sheetLayout,
} from './id-photo';

/**
 * A aritmética da FOLHA é a parte desta ferramenta que dá para provar sem
 * navegador, e é onde moram os dois erros silenciosos: contar um vão a mais do
 * que existe — que tira a última coluna de toda folha sem que o resultado
 * pareça errado — e arredondar a medida física, que sai do guichê recusada.
 */
describe('id-photo', () => {
  describe('mmToPx', () => {
    it('converts the 3x4 at print resolution', () => {
      expect(mmToPx(30)).toBe(354);
      expect(mmToPx(40)).toBe(472);
    });

    it('gives an inch exactly the DPI', () => {
      expect(mmToPx(25.4)).toBe(PRINT_DPI);
    });
  });

  describe('formats', () => {
    /**
     * O passaporte americano é definido em POLEGADAS. Arredondar 50,8 para 50 é
     * a diferença entre a foto ser aceita e ser recusada, então o valor fica
     * exato e quem converte é a conta.
     */
    it('keeps the US passport at two real inches', () => {
      const passport = formatById('2x2');

      expect(passport.widthMm).toBeCloseTo(50.8, 5);
      expect(passport.heightMm).toBeCloseTo(50.8, 5);
      expect(mmToPx(passport.widthMm)).toBe(600);
    });

    it('has no format with a zero or negative side', () => {
      for (const format of PHOTO_FORMATS) {
        expect(format.widthMm).toBeGreaterThan(0);
        expect(format.heightMm).toBeGreaterThan(0);
      }
    });
  });

  describe('sheetLayout', () => {
    it('fills a 10x15 sheet with 3x4 photos', () => {
      const layout = sheetLayout(formatById('3x4'), sheetById('10x15'));

      expect(layout.cols).toBe(3);
      expect(layout.rows).toBe(3);
      expect(layout.count).toBe(9);
    });

    /**
     * n fotos têm n-1 vãos. Contar um a mais cabe uma coluna a menos, e o
     * resultado continua plausível — é o defeito que ninguém percebe.
     */
    it('counts the gaps BETWEEN photos, not one per photo', () => {
      const layout = sheetLayout(formatById('3x4'), sheetById('10x15'));
      const usable = 100 - 2 * SHEET_MARGIN_MM;
      const withOneGapEach = Math.floor(usable / (30 + SHEET_GAP_MM));

      expect(layout.cols).toBeGreaterThan(withOneGapEach);
    });

    it('centres the grid so the leftover splits evenly', () => {
      const layout = sheetLayout(formatById('3x4'), sheetById('a4'));
      const gridW = layout.cols * 30 + (layout.cols - 1) * SHEET_GAP_MM;

      expect(layout.offsetXMm).toBeCloseTo((210 - gridW) / 2, 5);
      expect(layout.offsetXMm).toBeGreaterThanOrEqual(SHEET_MARGIN_MM - 0.001);
    });

    it('fits more on A4 than on 10x15', () => {
      const small = sheetLayout(formatById('3x4'), sheetById('10x15'));
      const big = sheetLayout(formatById('3x4'), sheetById('a4'));

      expect(big.count).toBeGreaterThan(small.count);
    });

    /** `single` é a mesma máquina com a folha do tamanho da foto. */
    it('single is one photo with no sheet around it', () => {
      const layout = sheetLayout(formatById('5x7'), sheetById('single'));

      expect(layout.count).toBe(1);
      expect(layout.sheet).toEqual({ widthMm: 50, heightMm: 70 });
      expect(layout.offsetXMm).toBe(0);
      expect(layout.offsetYMm).toBe(0);
    });

    it('never returns a grid wider than the sheet', () => {
      for (const format of PHOTO_FORMATS) {
        for (const sheet of ['10x15', 'a4'] as const) {
          const layout = sheetLayout(format, sheetById(sheet));
          const gridW = layout.cols * format.widthMm + (layout.cols - 1) * SHEET_GAP_MM;
          const gridH = layout.rows * format.heightMm + (layout.rows - 1) * SHEET_GAP_MM;

          expect(gridW).toBeLessThanOrEqual(layout.sheet.widthMm);
          expect(gridH).toBeLessThanOrEqual(layout.sheet.heightMm);
        }
      }
    });
  });

  describe('cellPositions', () => {
    it('returns one position per photo, in reading order', () => {
      const layout = sheetLayout(formatById('3x4'), sheetById('10x15'));
      const cells = cellPositions(layout);

      expect(cells.length).toBe(layout.count);
      expect(cells[1].xMm).toBeGreaterThan(cells[0].xMm);
      expect(cells[1].yMm).toBe(cells[0].yMm);
      expect(cells[layout.cols].yMm).toBeGreaterThan(cells[0].yMm);
      expect(cells[layout.cols].xMm).toBe(cells[0].xMm);
    });

    it('keeps every photo inside the sheet', () => {
      const layout = sheetLayout(formatById('35x45'), sheetById('a4'));

      for (const cell of cellPositions(layout)) {
        expect(cell.xMm).toBeGreaterThanOrEqual(0);
        expect(cell.yMm).toBeGreaterThanOrEqual(0);
        expect(cell.xMm + layout.photo.widthMm).toBeLessThanOrEqual(layout.sheet.widthMm);
        expect(cell.yMm + layout.photo.heightMm).toBeLessThanOrEqual(layout.sheet.heightMm);
      }
    });
  });
});
