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

describe('mergeNativeParagraphs - layout de formulário', () => {
  const label = (text: string, y: number): PdfNativeBlock => ({
    text, x: 0.05, y, w: 0.09, h: 0.013, fontSizePt: 9, isBold: false, isItalic: false,
  });

  it('não funde a coluna de rótulos de um formulário num parágrafo só', () => {
    // Histórico acadêmico: rótulos empilhados na coluna esquerda, todos com o
    // mesmo x, mesma fonte e espaçamento regular — geometricamente idênticos a
    // um parágrafo estreito. O ':' é o que os separa.
    const blocks: PdfNativeBlock[] = [
      label('Curso:', 0.510),
      label('Status:', 0.545),
      label('Ênfase:', 0.575),
      label('Currículo:', 0.605),
    ];

    const result = mergeNativeParagraphs(blocks);

    expect(result.length).toBe(4);
    expect(result.map((r) => r.text)).toEqual(['Curso:', 'Status:', 'Ênfase:', 'Currículo:']);
  });

  it('quebra o parágrafo quando a linha anterior é curta demais para ter quebrado na margem', () => {
    // Duas linhas de uma coluna de valores: a de cima é curta, então não é uma
    // linha de prosa que bateu na margem — é outra célula.
    const blocks: PdfNativeBlock[] = [
      { text: 'Brasileira', x: 0.25, y: 0.30, w: 0.08, h: 0.013, fontSizePt: 9, isBold: false, isItalic: false },
      { text: 'Portaria Nº 920, 27/12/2018. D.O.U.: 28/12/2018', x: 0.25, y: 0.33, w: 0.30, h: 0.013, fontSizePt: 9, isBold: false, isItalic: false },
    ];

    const result = mergeNativeParagraphs(blocks);

    expect(result.length).toBe(2);
  });

  it('mescla prosa multilinha preservando a quebra real e o passo entre linhas', () => {
    const blocks: PdfNativeBlock[] = [
      { text: 'texto corrido que ocupa a medida inteira do bloco e quebra na margem direita', x: 0.14, y: 0.160, w: 0.72, h: 0.013, fontSizePt: 9, isBold: false, isItalic: false },
      { text: 'seguindo na segunda linha', x: 0.14, y: 0.178, w: 0.30, h: 0.013, fontSizePt: 9, isBold: false, isItalic: false },
    ];

    const result = mergeNativeParagraphs(blocks);

    expect(result.length).toBe(1);
    // '\n', não ' ': a quebra do PDF é preservada em vez de ser refeita pelo CSS.
    expect(result[0].text).toBe(
      'texto corrido que ocupa a medida inteira do bloco e quebra na margem direita\nseguindo na segunda linha',
    );
    expect(result[0].lineCount).toBe(2);
    // Passo entre baselines medido pelos y, não h/lineCount (que daria 0.0155).
    expect(result[0].lineHeight).toBeCloseTo(0.018, 4);
    expect(result[0].lineBoxH).toBeCloseTo(0.013, 4);
  });

  it('não encadeia linhas com passo irregular (linhas de tabela com alturas variáveis)', () => {
    const blocks: PdfNativeBlock[] = [
      { text: 'valor um que preenche a linha inteira do bloco', x: 0.25, y: 0.400, w: 0.30, h: 0.013, fontSizePt: 9, isBold: false, isItalic: false },
      { text: 'valor dois que preenche a linha inteira do bl', x: 0.25, y: 0.418, w: 0.30, h: 0.013, fontSizePt: 9, isBold: false, isItalic: false },
      // Salto de linha: a célula acima tinha duas linhas, então o passo muda.
      { text: 'valor tres que preenche a linha inteira do bl', x: 0.25, y: 0.452, w: 0.30, h: 0.013, fontSizePt: 9, isBold: false, isItalic: false },
    ];

    const result = mergeNativeParagraphs(blocks);

    expect(result.length).toBe(2);
    expect(result[0].lineCount).toBe(2);
    expect(result[1].lineCount).toBe(1);
  });
});
