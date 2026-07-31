import {
  OCR_MAX_FONT_PT,
  OCR_MIN_FONT_PT,
  clampOcrFontSizePt,
  inReadingOrder,
  medianFontSizePt,
} from './pdf-to-word.service';

interface Bloco {
  id: string;
  x: number;
  y: number;
  h: number;
}

const ids = (blocos: Bloco[]): string => blocos.map((b) => b.id).join(' ');

describe('inReadingOrder', () => {
  it('ordena de cima para baixo', () => {
    const blocos: Bloco[] = [
      { id: 'c', x: 0.1, y: 0.7, h: 0.02 },
      { id: 'a', x: 0.1, y: 0.1, h: 0.02 },
      { id: 'b', x: 0.1, y: 0.4, h: 0.02 },
    ];
    expect(ids(inReadingOrder(blocos))).toBe('a b c');
  });

  it('ordena da esquerda para a direita dentro da mesma linha', () => {
    const blocos: Bloco[] = [
      { id: 'direita', x: 0.6, y: 0.2, h: 0.02 },
      { id: 'esquerda', x: 0.1, y: 0.2, h: 0.02 },
    ];
    expect(ids(inReadingOrder(blocos))).toBe('esquerda direita');
  });

  /**
   * A regressão que motivou esta função.
   *
   * Numa linha, o trecho que começa com maiúscula tem o topo mais alto que o
   * trecho só de minúsculas ao lado — aqui 0.200 contra 0.204, com caixas de
   * altura diferente. O comparador anterior via a distância de topos maior que
   * a tolerância, concluía "linhas diferentes" e devolvia o trecho da direita
   * primeiro. No .docx isso saiu como "camada de texto Esta pagina nao possui":
   * todas as palavras presentes, ordem errada — que parece falha de OCR e não
   * de ordenação, e por isso é o pior modo de falha dos dois.
   */
  it('mantém a ordem quando os topos diferem por causa da altura da caixa', () => {
    const blocos: Bloco[] = [
      { id: 'camada-de-texto', x: 0.55, y: 0.204, h: 0.014 },
      { id: 'Esta-pagina', x: 0.10, y: 0.200, h: 0.020 },
    ];
    expect(ids(inReadingOrder(blocos))).toBe('Esta-pagina camada-de-texto');
  });

  /**
   * Um comparador com tolerância não é transitivo (a≈b, b≈c, mas a≢c), e o
   * `Array.sort` pode devolver qualquer permutação nesse caso. Uma escada de
   * blocos que se sobrepõem de dois em dois é exatamente a entrada que expõe
   * isso, então o resultado tem que ser estável e por posição.
   */
  it('é determinístico numa escada de blocos parcialmente sobrepostos', () => {
    const blocos: Bloco[] = [
      { id: 'a', x: 0.1, y: 0.100, h: 0.02 },
      { id: 'b', x: 0.2, y: 0.110, h: 0.02 },
      { id: 'c', x: 0.3, y: 0.120, h: 0.02 },
    ];
    const primeiro = ids(inReadingOrder(blocos));
    const segundo = ids(inReadingOrder([...blocos].reverse()));
    expect(primeiro).toBe(segundo);
  });

  it('não altera o array recebido', () => {
    const blocos: Bloco[] = [
      { id: 'b', x: 0.1, y: 0.5, h: 0.02 },
      { id: 'a', x: 0.1, y: 0.1, h: 0.02 },
    ];
    inReadingOrder(blocos);
    expect(ids(blocos)).toBe('b a');
  });

  it('devolve lista vazia sem estourar', () => {
    expect(inReadingOrder([])).toEqual([]);
  });
});

describe('medianFontSizePt', () => {
  it('converte a fração da altura da página para pontos', () => {
    // 0.02 de uma A4 (842pt) ≈ 16.8pt
    const blocks = [{ fontSize: 0.02 }];
    expect(medianFontSizePt(blocks, 842)).toBeCloseTo(16.84, 1);
  });

  it('ignora blocos sem tamanho estimado', () => {
    const blocks = [{ fontSize: undefined }, { fontSize: 0.01 }, { fontSize: undefined }];
    expect(medianFontSizePt(blocks, 800)).toBeCloseTo(8, 1);
  });

  it('devolve 0 quando não há nenhum tamanho', () => {
    expect(medianFontSizePt([{ fontSize: undefined }], 842)).toBe(0);
  });
});

describe('clampOcrFontSizePt', () => {
  /**
   * A regressão medida: um histórico rasterizado saiu com corpos de 1pt a
   * 42.5pt, contra 5–12pt na leitura nativa do MESMO documento. 1pt é texto
   * invisível para quem abrir o .docx, e nada na tela denuncia a causa.
   */
  it('levanta um corpo de 1pt até o piso absoluto', () => {
    expect(clampOcrFontSizePt(1, 10)).toBe(OCR_MIN_FONT_PT);
  });

  it('derruba um corpo de 42.5pt para o teto relativo à mediana', () => {
    // 2.2 × 10 = 22, abaixo do teto absoluto de 36.
    expect(clampOcrFontSizePt(42.5, 10)).toBe(22);
  });

  /** Um título legitimamente chega ao dobro do corpo e não pode ser achatado. */
  it('deixa passar um título ao dobro da mediana', () => {
    expect(clampOcrFontSizePt(20, 10)).toBe(20);
  });

  it('não mexe num corpo já dentro da faixa', () => {
    expect(clampOcrFontSizePt(11, 10)).toBe(11);
  });

  /**
   * Uma página inteira de lixo tem mediana ruim, e só a faixa relativa a
   * acompanharia — por isso o teto absoluto existe além do relativo.
   */
  it('aplica o teto absoluto mesmo com mediana alta', () => {
    expect(clampOcrFontSizePt(200, 100)).toBe(OCR_MAX_FONT_PT);
  });

  it('cai só na faixa absoluta quando não há mediana', () => {
    expect(clampOcrFontSizePt(2, 0)).toBe(OCR_MIN_FONT_PT);
    expect(clampOcrFontSizePt(90, 0)).toBe(OCR_MAX_FONT_PT);
  });

  it('propaga undefined em vez de inventar um tamanho', () => {
    expect(clampOcrFontSizePt(undefined, 10)).toBeUndefined();
  });
});
