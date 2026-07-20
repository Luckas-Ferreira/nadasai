import { assignFontSizes, clampOutlierHeights } from './ocr.service';
import type { OcrBlock } from './ocr.service';

describe('assignFontSizes', () => {
  const CAPS = 0.014; // "Data" — caixa-alta até a linha de base

  /** Página uniforme de N palavras normais, como um formulário. */
  function corpo(n: number): OcrBlock[] {
    return Array.from({ length: n }, () => ({
      text: 'Nascimento:',
      h: CAPS,
      x: 0.1,
      y: 0.5,
      w: 0.2,
      confidence: 90,
    }));
  }

  it('corta o token curto que renderizava muito maior que a página', () => {
    // "47" não tem ascendente nem descendente, então a heurística lê o bbox como
    // altura-de-x e multiplica por 1.92 — o mais agressivo dos quatro. Num token
    // de 1-2 caracteres esse chute não tem base, e era o que fazia um campo
    // isolado sair gigante no meio do formulário.
    const blocks = [...corpo(8), { text: '47', h: CAPS * 2, x: 0.5, y: 0.5, w: 0.05, confidence: 80 }];

    assignFontSizes(blocks);

    const mediana = blocks[0].fontSize!;
    expect(blocks[8].fontSize!).toBeLessThanOrEqual(mediana * 1.8 + 1e-9);
  });

  it('não mexe em nada quando a página é uniforme', () => {
    const blocks = corpo(10);

    assignFontSizes(blocks);

    const sizes = new Set(blocks.map((b) => b.fontSize));
    expect(sizes.size).toBe(1);
  });

  it('preserva cabeçalho legítimo, que fica abaixo do fator', () => {
    // Cabeçalho costuma ser 1.3-1.6x o corpo. Achatar isso seria pior que o bug.
    const titulo: OcrBlock = { text: 'MINISTÉRIO', h: CAPS * 1.5, x: 0.1, y: 0.1, w: 0.3, confidence: 90 };
    const blocks = [...corpo(8), titulo];

    assignFontSizes(blocks);

    expect(titulo.fontSize!).toBeCloseTo(CAPS * 1.5 * 1.38, 6);
  });

  it('token só de símbolo não cai no multiplicador de altura-de-x', () => {
    // Um travessão não tem ascendente nem descendente, mas também não é texto de
    // altura-de-x: aplicar 1.92 nele rendia +183% num teste real.
    const traco: OcrBlock = { text: '—', h: CAPS, x: 0.1, y: 0.1, w: 0.02, confidence: 60 };

    assignFontSizes([traco, ...corpo(4)]);

    expect(traco.fontSize!).toBeCloseTo(CAPS * 1.38, 6); // neutro, não 1.92
  });

  it('ignora amostra pequena demais para ter mediana confiável', () => {
    const blocks: OcrBlock[] = [{ text: 'a', h: 0.5, x: 0, y: 0, w: 0.1, confidence: 90 }];

    assignFontSizes(blocks);

    expect(blocks[0].fontSize).toBeGreaterThan(0); // estimou, mas não cortou
  });
});

/** Bloco de OCR com o mínimo necessário; `h` é a fração da altura da página. */
function block(text: string, h: number, y = 0.5): OcrBlock {
  return { text, h, y, x: 0.1, w: 0.2, confidence: 90 };
}

describe('clampOutlierHeights', () => {
  it('corta o bbox mesclado que vira fonte gigante', () => {
    // O caso real: foto de papel amassado, o Tesseract funde a data com a linha
    // vizinha e devolve um bbox ~3x o normal. Como o getBaseFontSize() deriva o
    // corpo da fonte de `h`, a data renderizava 3x maior que o resto da página.
    const blocks = [block('CPF:', 0.01), block('Data', 0.01), block('Nascimento:', 0.01), block('24/08/1980', 0.03)];

    clampOutlierHeights(blocks);

    expect(blocks[3].h).toBeCloseTo(0.018, 5); // mediana 0.01 * 1.8
    expect(blocks[0].h).toBe(0.01); // os normais ficam intactos
  });

  it('encolhe pelo centro, porque não se sabe para que lado o bbox inflou', () => {
    const blocks = [block('a', 0.01), block('b', 0.01), block('c', 0.01), block('x', 0.03, 0.5)];

    clampOutlierHeights(blocks);

    // 0.03 -> 0.018, sobra 0.012, metade para cada lado.
    expect(blocks[3].y).toBeCloseTo(0.506, 5);
  });

  it('preserva título legítimo, que fica abaixo do fator', () => {
    // Cabeçalho costuma ser 1.3–1.6x o corpo. Achatar isso seria pior que o bug.
    const blocks = [block('corpo', 0.01), block('corpo', 0.01), block('corpo', 0.01), block('TÍTULO', 0.016)];

    clampOutlierHeights(blocks);

    expect(blocks[3].h).toBe(0.016);
  });

  it('não usa a altura da linha como teto — no Tesseract a linha contém a palavra', () => {
    // Registro do porquê da mediana: o bbox da linha é a união dos bboxes das
    // palavras, então palavra <= linha SEMPRE. Um teto baseado em lineHeight
    // nunca dispararia. Aqui o bloco estourado declara uma linha igualmente
    // estourada, como o Tesseract faria, e mesmo assim ele é cortado.
    const blocks = [
      { ...block('a', 0.01), lineHeight: 0.012 },
      { ...block('b', 0.01), lineHeight: 0.012 },
      { ...block('c', 0.01), lineHeight: 0.012 },
      { ...block('estourado', 0.03), lineHeight: 0.03 },
    ];

    clampOutlierHeights(blocks);

    expect(blocks[3].h).toBeCloseTo(0.018, 5);
  });

  it('ignora amostra pequena demais para ter mediana confiável', () => {
    const blocks = [block('a', 0.01), block('gigante', 0.5)];

    clampOutlierHeights(blocks);

    expect(blocks[1].h).toBe(0.5);
  });

  it('não divide por zero quando a mediana é zero', () => {
    const blocks = [block('a', 0), block('b', 0), block('c', 0), block('d', 0.02)];

    expect(() => clampOutlierHeights(blocks)).not.toThrow();
    expect(blocks[3].h).toBe(0.02);
  });
});
