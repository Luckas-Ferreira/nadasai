import { mergeNativeParagraphs } from './paragraph-merger';
import type { PdfNativeBlock } from './pdf-loader.service';

describe('mergeNativeParagraphs - Column Separation', () => {
  it('separa elementos da mesma linha quando há um espaço claro de coluna (multi-colunas)', () => {
    // Simula a linha inferior do certificado (conforme foto do usuário):
    // "15/05/2026" na coluna esquerda (x=0.12), "6a079a63265afe2153c8db4d" na coluna direita (x=0.53).
    const blocks: PdfNativeBlock[] = [
      {
        text: '15/05/2026',
        x: 0.12,
        y: 0.74,
        w: 0.10,
        h: 0.018,
        fontSizePt: 10,
        isBold: true,
        isItalic: false,
      },
      {
        text: '6a079a63265afe2153c8db4d',
        x: 0.53,
        y: 0.74,
        w: 0.25,
        h: 0.018,
        fontSizePt: 10,
        isBold: true,
        isItalic: false,
      },
    ];

    const result = mergeNativeParagraphs(blocks);

    expect(result.length).toBe(2);
    expect(result[0].text).toBe('15/05/2026');
    expect(result[0].x).toBeCloseTo(0.12, 2);
    expect(result[1].text).toBe('6a079a63265afe2153c8db4d');
    expect(result[1].x).toBeCloseTo(0.53, 2);
  });

  it('unifica blocos contínuos da mesma frase que estão próximos horizontalmente', () => {
    const blocks: PdfNativeBlock[] = [
      {
        text: 'Certificamos que',
        x: 0.12,
        y: 0.40,
        w: 0.18,
        h: 0.018,
        fontSizePt: 10,
        isBold: false,
        isItalic: false,
      },
      {
        text: 'JOSE LUCAS',
        x: 0.31,
        y: 0.40,
        w: 0.15,
        h: 0.018,
        fontSizePt: 10,
        isBold: true,
        isItalic: false,
      },
    ];

    const result = mergeNativeParagraphs(blocks);

    expect(result.length).toBe(1);
    expect(result[0].text).toBe('Certificamos que JOSE LUCAS');
  });

  it('agrupa linhas multilinha de forma independente por coluna', () => {
    const blocks: PdfNativeBlock[] = [
      // Coluna 1 - Linha 1
      { text: 'Texto Coluna 1', x: 0.10, y: 0.20, w: 0.30, h: 0.02, fontSizePt: 12, isBold: false, isItalic: false },
      // Coluna 2 - Linha 1
      { text: 'Texto Coluna 2', x: 0.55, y: 0.20, w: 0.30, h: 0.02, fontSizePt: 12, isBold: false, isItalic: false },
      // Coluna 1 - Linha 2
      { text: 'Continuação Coluna 1', x: 0.10, y: 0.23, w: 0.30, h: 0.02, fontSizePt: 12, isBold: false, isItalic: false },
      // Coluna 2 - Linha 2
      { text: 'Continuação Coluna 2', x: 0.55, y: 0.23, w: 0.30, h: 0.02, fontSizePt: 12, isBold: false, isItalic: false },
    ];

    const result = mergeNativeParagraphs(blocks);

    expect(result.length).toBe(2);
    expect(result[0].text).toContain('Texto Coluna 1');
    expect(result[0].text).toContain('Continuação Coluna 1');
    expect(result[1].text).toContain('Texto Coluna 2');
    expect(result[1].text).toContain('Continuação Coluna 2');
  });
});
