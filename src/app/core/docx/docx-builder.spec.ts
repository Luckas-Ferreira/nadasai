import {
  DEFAULT_FONT_SIZE_PT,
  buildDocx,
  docColor,
  docFontName,
  joinRunLines,
  parseInlineMarkup,
  type DocParagraph,
} from './docx-builder';

describe('parseInlineMarkup', () => {
  it('devolve um run simples quando não há tag', () => {
    expect(parseInlineMarkup('texto puro')).toEqual([
      { text: 'texto puro', bold: false, italic: false },
    ]);
  });

  it('separa o negrito parcial em runs distintos', () => {
    const runs = parseInlineMarkup('Nome: <b>João</b> Silva');
    expect(runs.map((r) => r.text)).toEqual(['Nome: ', 'João', ' Silva']);
    expect(runs.map((r) => r.bold)).toEqual([false, true, false]);
  });

  it('entende negrito e itálico aninhados', () => {
    const runs = parseInlineMarkup('a <b><i>b</i></b> c');
    const middle = runs.find((r) => r.text === 'b');
    expect(middle?.bold).toBe(true);
    expect(middle?.italic).toBe(true);
  });

  it('herda o negrito do parágrafo como estado inicial', () => {
    const runs = parseInlineMarkup('tudo negrito', true, false);
    expect(runs[0].bold).toBe(true);
  });

  /**
   * O gerador do lado do PDF não escapa nada, então um documento com "a < b"
   * chega aqui com um '<' solto. Tratá-lo como início de tag comeria o resto
   * do parágrafo — é o pior modo de falha possível, porque some texto sem erro.
   */
  it('trata um "<" solto como texto literal, não como tag', () => {
    const runs = parseInlineMarkup('se a < b entao <b>x</b>');
    expect(runs.map((r) => r.text).join('')).toBe('se a < b entao x');
    expect(runs.find((r) => r.text === 'x')?.bold).toBe(true);
  });

  it('ignora fechamento sem abertura em vez de estourar', () => {
    const runs = parseInlineMarkup('orfao</b> resto');
    expect(runs.map((r) => r.text).join('')).toBe('orfao resto');
    expect(runs.every((r) => !r.bold)).toBe(true);
  });
});

describe('docColor', () => {
  it('remove o # e sobe para maiúsculas', () => {
    expect(docColor('#ff8800')).toBe('FF8800');
  });

  /** Preto é o padrão do estilo; gravá-lo em todo run só incha o XML. */
  it('devolve undefined para preto', () => {
    expect(docColor('#000000')).toBeUndefined();
  });

  it('devolve undefined para valor inválido ou ausente', () => {
    expect(docColor(undefined)).toBeUndefined();
    expect(docColor('#xyz')).toBeUndefined();
  });
});

describe('docFontName', () => {
  /**
   * Helvetica não existe no Windows e a substituição automática do Word varia
   * por máquina — mapear para Arial faz o arquivo abrir igual em todo lugar.
   */
  it('mapeia Helvetica para Arial', () => {
    expect(docFontName('Helvetica')).toBe('Arial');
    expect(docFontName('TimesRoman')).toBe('Times New Roman');
  });

  it('cai em Arial quando a família é desconhecida', () => {
    expect(docFontName(undefined)).toBe('Arial');
  });
});

describe('joinRunLines', () => {
  it('junta as quebras com espaço para o texto refluir no Word', () => {
    const runs = [{ text: 'primeira\nsegunda' }];
    expect(joinRunLines(runs, false)[0].text).toBe('primeira segunda');
  });

  it('preserva as quebras quando pedido', () => {
    const runs = [{ text: 'primeira\nsegunda' }];
    expect(joinRunLines(runs, true)[0].text).toBe('primeira\nsegunda');
  });
});

describe('buildDocx', () => {
  const para = (text: string): DocParagraph => ({ runs: [{ text }], fontSizePt: 12 });

  it('produz um blob .docx não vazio', async () => {
    const blob = await buildDocx([para('olá mundo')]);
    expect(blob.size).toBeGreaterThan(0);
  });

  /**
   * Um .docx é um zip: os dois primeiros bytes são 'PK'. Se o Packer devolver
   * outra coisa, o Word recusa o arquivo — e o teste de tamanho acima passaria
   * mesmo assim.
   */
  it('devolve um zip válido (assinatura PK)', async () => {
    const blob = await buildDocx([para('conteúdo')]);
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 2);
    expect(Array.from(head)).toEqual([0x50, 0x4b]);
  });

  /** Word abre com aviso de corrompido se a seção não tiver nenhum parágrafo. */
  it('não quebra com lista vazia', async () => {
    const blob = await buildDocx([]);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('aceita parágrafo sem fontSizePt usando o corpo padrão', async () => {
    const blob = await buildDocx([{ runs: [{ text: 'sem tamanho' }] }]);
    expect(blob.size).toBeGreaterThan(0);
    expect(DEFAULT_FONT_SIZE_PT).toBe(11);
  });
});
