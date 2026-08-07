import { detectCorners } from './fit';
import { DEFAULT_REFINE, refineLattice, snapCorners, snapToCoverage } from './refine';

/**
 * Os três passos que tiram o desenho do reticulado. Cada teste aqui mede a
 * propriedade que o passo existe para garantir — não a implementação, que pode
 * mudar de filtro sem que a garantia mude.
 */
describe('refine', () => {
  /** Escada de 45°: o pior caso de amostragem, amplitude meio pixel. */
  function staircase(steps: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k < steps; k++) {
      pts.push({ x: k, y: k });
      pts.push({ x: k + 1, y: k });
    }
    pts.push({ x: steps, y: steps });
    return pts;
  }

  /**
   * AMPLITUDE do zigue-zague: distância COM SINAL até a corda das pontas, e a
   * diferença entre a maior e a menor.
   *
   * O desvio absoluto seria a métrica errada, e enganosa: a corda de uma escada
   * liga dois pontos do MESMO tipo de degrau, então uma escada perfeitamente
   * alisada fica inteira a meio degrau da corda e "erra" 0,354 px por
   * construção. O que se quer medir é se os pontos ainda alternam.
   *
   * Medido só no miolo: as duas pontas de um arco aberto são nós da subdivisão e
   * não se movem, então o vizinho imediato de uma ponta não pode ser alisado por
   * completo. Medi-los mediria a trava, não o filtro.
   */
  function zigzag(pts: readonly { x: number; y: number }[], skip = 2): number {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = skip; i < pts.length - skip; i++) {
      const p = pts[i];
      const d = (dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    return hi - lo;
  }

  describe('refineLattice', () => {
    it('achata a escada de uma diagonal', () => {
      const pts = staircase(20);
      const before = zigzag(pts);
      const after = zigzag(refineLattice(pts, false, new Array(pts.length).fill(false)));

      // Um degrau inteiro de amplitude vira menos de um décimo de pixel.
      expect(before).toBeGreaterThan(0.65);
      expect(after).toBeLessThan(0.1);
    });

    /**
     * O laplaciano puro converge para a reta entre as pontas, o que transforma
     * um arco de círculo em corda. Taubin não pode: a área tem de sobreviver.
     * Sem esta garantia a suavização "funcionaria" e derreteria todo desenho
     * redondo — um defeito que só aparece comparando com o original.
     */
    it('não encolhe um círculo', () => {
      const pts: { x: number; y: number }[] = [];
      const n = 200;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push({ x: 100 + Math.cos(a) * 50, y: 100 + Math.sin(a) * 50 });
      }

      const out = refineLattice(pts, true, new Array(pts.length).fill(false), {
        ...DEFAULT_REFINE,
        passes: 40,
      });

      const radii = out.map((p) => Math.hypot(p.x - 100, p.y - 100));
      expect(Math.min(...radii)).toBeGreaterThan(49.5);
      expect(Math.max(...radii)).toBeLessThan(50.5);
    });

    it('não move as pontas de um arco aberto nem os cantos marcados', () => {
      const pts = staircase(12);
      const pinned = new Array(pts.length).fill(false);
      pinned[10] = true;

      const out = refineLattice(pts, false, pinned);

      expect(out[0]).toEqual(pts[0]);
      expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
      expect(out[10]).toEqual(pts[10]);
    });

    it('respeita o teto de deslocamento', () => {
      const pts = staircase(20);
      const out = refineLattice(pts, false, new Array(pts.length).fill(false), {
        ...DEFAULT_REFINE,
        passes: 60,
        maxShift: 0.3,
      });

      for (let i = 0; i < pts.length; i++) {
        expect(Math.hypot(out[i].x - pts[i].x, out[i].y - pts[i].y)).toBeLessThanOrEqual(0.3001);
      }
    });
  });

  describe('snapToCoverage', () => {
    /**
     * A prova de que a busca lê a IMAGEM e não a polilinha: o traçado entra
     * deslocado meio pixel do lugar certo (é o que o reticulado sempre entrega)
     * e tem de sair sobre a borda real, que aqui é uma reta conhecida.
     */
    it('leva o traçado para a borda que o antialiasing indica', () => {
      // Cobertura de uma borda horizontal exata em y = 10.35.
      const edge = 10.35;
      const coverage = (_x: number, y: number): number => {
        const t = y - edge + 0.5;
        return t < 0 ? 0 : t > 1 ? 1 : t;
      };

      const pts = Array.from({ length: 40 }, (_, i) => ({ x: i, y: i % 2 === 0 ? 10 : 11 }));
      const out = snapToCoverage(pts, false, new Array(pts.length).fill(false), coverage);

      // As pontas ficam onde estavam — são nós compartilhados.
      for (let i = 2; i < pts.length - 2; i++) {
        expect(Math.abs(out[i].y - edge)).toBeLessThan(0.1);
      }
    });

    it('não mexe em ponto nenhum quando não há cruzamento para achar', () => {
      const pts = staircase(10);
      const out = snapToCoverage(pts, false, new Array(pts.length).fill(false), () => 0.2);
      expect(out).toEqual(pts);
    });
  });

  describe('snapCorners', () => {
    /**
     * O canto é o único ponto que a cobertura não sabe mexer, e um canto preso
     * no reticulado arrasta um "joelho" de um pixel para dentro das duas
     * arestas vizinhas. Aqui as duas retas são exatas e a interseção é conhecida:
     * o vértice do V está em (20, 10).
     */
    it('põe o canto na interseção das duas retas', () => {
      const pts: { x: number; y: number }[] = [];
      for (let k = 0; k <= 20; k++) pts.push({ x: k, y: k / 2 });
      // O vértice entra 0,6 px fora do lugar, como sai do reticulado.
      pts[20] = { x: 20.4, y: 10.45 };
      for (let k = 1; k <= 20; k++) pts.push({ x: 20 + k, y: 10 - k / 2 });

      const corners = detectCorners(pts, false, 3, 40);
      expect(corners[20]).toBeTrue();

      const out = snapCorners(pts, false, corners);
      expect(out[20].x).toBeCloseTo(20, 1);
      expect(out[20].y).toBeCloseTo(10, 1);
    });

    it('recusa quando as duas retas são quase paralelas', () => {
      const pts = Array.from({ length: 30 }, (_, i) => ({ x: i, y: i * 0.02 }));
      const pinned = new Array(pts.length).fill(false);
      pinned[15] = true;

      const out = snapCorners(pts, false, pinned);
      expect(out[15]).toEqual(pts[15]);
    });
  });
});
