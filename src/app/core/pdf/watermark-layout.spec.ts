import {
  MAX_MARKS_PER_PAGE,
  drawOriginFor,
  rotatedBounds,
  watermarkPlacements,
  type LayoutRequest,
} from './watermark-layout';

const A4 = { pageWidth: 595, pageHeight: 842 };
const MARK = { width: 200, height: 40 };

function req(over: Partial<LayoutRequest> = {}): LayoutRequest {
  return {
    ...A4,
    mark: MARK,
    layout: 'single',
    position: 'center',
    rotationDegrees: 0,
    gapPercent: 50,
    marginPt: 24,
    ...over,
  };
}

/** Onde o centro da marca REALMENTE cai, dada a origem que o pdf-lib recebe. */
function centreOf(origin: { x: number; y: number }, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: origin.x + (MARK.width / 2) * Math.cos(rad) - (MARK.height / 2) * Math.sin(rad),
    y: origin.y + (MARK.width / 2) * Math.sin(rad) + (MARK.height / 2) * Math.cos(rad),
  };
}

describe('watermark layout', () => {
  /**
   * O bug que o módulo existe para não repetir: a versão anterior centralizava a
   * caixa NÃO girada e mandava o pdf-lib girar em torno da origem, então a 45°
   * o texto saía a mais de cem pontos do centro da página.
   */
  it('centraliza de verdade em qualquer ângulo', () => {
    for (const deg of [0, -45, 45, 90, 30]) {
      const [origin] = watermarkPlacements(req({ rotationDegrees: deg })).placements;
      const centre = centreOf(origin, deg);

      expect(centre.x).toBeCloseTo(A4.pageWidth / 2, 6);
      expect(centre.y).toBeCloseTo(A4.pageHeight / 2, 6);
    }
  });

  it('respeita a margem nos cantos, medindo a caixa já girada', () => {
    const deg = 45;
    const bounds = rotatedBounds(MARK, deg);

    const [origin] = watermarkPlacements(
      req({ position: 'bottom-left', rotationDegrees: deg }),
    ).placements;
    const centre = centreOf(origin, deg);

    expect(centre.x).toBeCloseTo(24 + bounds.width / 2, 6);
    expect(centre.y).toBeCloseTo(24 + bounds.height / 2, 6);
  });

  /** 'top' é y ALTO: o PDF tem a origem embaixo, ao contrário de um canvas. */
  it('põe "top" no alto da página, não embaixo', () => {
    const [top] = watermarkPlacements(req({ position: 'top' })).placements;
    const [bottom] = watermarkPlacements(req({ position: 'bottom' })).placements;

    expect(top.y).toBeGreaterThan(bottom.y);
  });

  it('centraliza uma marca maior que a página em vez de empurrá-la para fora', () => {
    const huge = { width: 2000, height: 2000 };
    const [origin] = watermarkPlacements(req({ mark: huge, position: 'top-right' })).placements;

    expect(origin.x + huge.width / 2).toBeCloseTo(A4.pageWidth / 2, 6);
    expect(origin.y + huge.height / 2).toBeCloseTo(A4.pageHeight / 2, 6);
  });

  describe('lado a lado', () => {
    /**
     * Cobrir só a largura deixaria os cantos vazios em qualquer ângulo que não
     * fosse múltiplo de 90°, porque a grade gira junto com a marca.
     */
    it('cobre os quatro cantos da página, inclinada', () => {
      const deg = -45;
      const { placements } = watermarkPlacements(req({ layout: 'tiled', rotationDegrees: deg }));
      const centres = placements.map((p) => centreOf(p, deg));

      for (const corner of [
        { x: 0, y: 0 },
        { x: A4.pageWidth, y: 0 },
        { x: 0, y: A4.pageHeight },
        { x: A4.pageWidth, y: A4.pageHeight },
      ]) {
        const nearest = Math.min(
          ...centres.map((c) => Math.hypot(c.x - corner.x, c.y - corner.y)),
        );
        // Uma marca de 200×40 com 50% de folga: nenhum canto pode estar mais
        // longe do que um passo da marca mais próxima, ou ali não há nada.
        expect(nearest).toBeLessThan(300);
      }
    });

    it('abre o passo com o espaçamento e produz menos marcas', () => {
      const dense = watermarkPlacements(req({ layout: 'tiled', gapPercent: 0 })).placements.length;
      const sparse = watermarkPlacements(req({ layout: 'tiled', gapPercent: 200 })).placements.length;

      expect(sparse).toBeLessThan(dense);
    });

    /**
     * Cada marca é um comando no content stream. Sem teto, um texto de 8pt lado
     * a lado passa de mil por página e engorda o arquivo para entregar um borrão.
     */
    it('respeita o teto de marcas por página e avisa quando abriu o passo', () => {
      const tiny = watermarkPlacements(
        req({ layout: 'tiled', mark: { width: 8, height: 8 }, gapPercent: 0 }),
      );

      expect(tiny.placements.length).toBeLessThanOrEqual(MAX_MARKS_PER_PAGE);
      expect(tiny.spacingClamped).toBeTrue();
    });

    it('não avisa de aperto quando não houve', () => {
      expect(watermarkPlacements(req({ layout: 'tiled' })).spacingClamped).toBeFalse();
    });
  });

  it('a origem de desenho não é o centro — é o canto que o pdf-lib gira', () => {
    const origin = drawOriginFor(100, 100, { width: 50, height: 20 }, 0);

    expect(origin.x).toBeCloseTo(75, 6);
    expect(origin.y).toBeCloseTo(90, 6);
  });
});
