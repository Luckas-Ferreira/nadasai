import { pageRenderScale } from './pdfjs';

/** A4 em pontos — 0.5 Mpx a 1×. */
const A4 = { pageWidth: 595, pageHeight: 842 };

describe('pageRenderScale', () => {
  it('não deixa o número de páginas derrubar a nitidez', () => {
    // A versão anterior dividia uma cota fixa pelo total de páginas, então um
    // edital de 20 páginas rasterizava a ~1.5× e parecia um fax enquanto o
    // texto HTML de um bloco selecionado continuava vetorial.
    const curto = pageRenderScale({ ...A4, pageCount: 1, displayScale: 1 });
    const longo = pageRenderScale({ ...A4, pageCount: 20, displayScale: 1 });
    expect(longo).toBe(curto);
    expect(longo).toBeGreaterThanOrEqual(2);
  });

  it('acompanha o zoom, senão ampliar só estica o raster', () => {
    const normal = pageRenderScale({ ...A4, pageCount: 4, displayScale: 1 });
    const ampliado = pageRenderScale({ ...A4, pageCount: 4, displayScale: 2.5 });
    expect(ampliado).toBeGreaterThan(normal);
  });

  it('mantém supersampling ≥ 1 em todo o intervalo de zoom da UI (0.3–3)', () => {
    for (const displayScale of [0.3, 0.5, 0.95, 1, 1.5, 2, 2.5, 3]) {
      const s = pageRenderScale({ ...A4, pageCount: 4, displayScale });
      expect(s / displayScale)
        .withContext(`zoom ${displayScale}`)
        .toBeGreaterThanOrEqual(1);
    }
  });

  it('respeita o teto de memória em documentos muito longos', () => {
    const s = pageRenderScale({ ...A4, pageCount: 300, displayScale: 3 });
    const totalPx = 595 * 842 * 300 * s * s;
    expect(totalPx).toBeLessThanOrEqual(64_000_000 * 1.01);
  });

  it('deixa o orçamento vencer a nitidez, sem piso', () => {
    // Um piso qualquer anularia o teto assim que o documento fosse longo o
    // bastante, e memória de canvas estourada não lança erro — devolve página em
    // branco. Documento longo demais rasteriza mole, de propósito, até existir
    // rasterização sob demanda por viewport.
    expect(pageRenderScale({ ...A4, pageCount: 5000, displayScale: 3 })).toBeLessThan(1);
  });

  it('ainda entrega nitidez plena num documento de tamanho realista', () => {
    // O caso que motivou tudo: um edital de 20 páginas rasterizava a ~1.5×.
    expect(pageRenderScale({ ...A4, pageCount: 20, displayScale: 1 })).toBeGreaterThanOrEqual(2);
  });

  it('entrega nitidez máxima quando recebe a janela de viewport, não o documento', () => {
    // O componente passa o tamanho da janela de rasterização (6), e é isso que
    // desacopla a nitidez do tamanho do documento: mesmo no zoom máximo, uma
    // janela de 6 páginas cabe no orçamento sem nenhum corte.
    expect(pageRenderScale({ ...A4, pageCount: 6, displayScale: 3 })).toBe(4);
  });

  it('leva em conta a densidade da tela', () => {
    // Em displayScale 1 os dois lados ainda estão longe do teto; a 2 ambos
    // saturam em MAX_SCALE e o teste não mediria nada.
    const p1 = pageRenderScale({ ...A4, pageCount: 4, displayScale: 1, devicePixelRatio: 1 });
    const p2 = pageRenderScale({ ...A4, pageCount: 4, displayScale: 1, devicePixelRatio: 2 });
    expect(p2).toBeGreaterThan(p1);
  });
});
