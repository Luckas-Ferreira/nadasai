import type { Lab } from './color';
import { snapEdgeBands, transitionMask } from './edges';

describe('edges', () => {
  const WHITE: Lab = { L: 100, a: 0, b: 0 };
  const NAVY: Lab = { L: 20, a: 15, b: -45 };
  /** Exatamente no meio dos dois: é a cor que o antialiasing produz. */
  const BLEND: Lab = { L: 60, a: 7.5, b: -22.5 };
  /** Um cinza fora do eixo branco-azul: cor de verdade, não mistura. */
  const GREY: Lab = { L: 60, a: 0, b: 0 };

  /** Uma faixa vertical de `bandWidth` px da classe 2, entre a 0 e a 1. */
  function stripes(w: number, h: number, bandWidth: number): Int32Array {
    const out = new Int32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const mid = w / 2;
        out[y * w + x] = x < mid - bandWidth / 2 ? 0 : x < mid + bandWidth / 2 ? 2 : 1;
      }
    }
    return out;
  }

  describe('snapEdgeBands', () => {
    /**
     * O defeito que esta função existe para matar: a fita de transição vira
     * região, a região vira `<path>`, e o logotipo volta com uma casquinha clara
     * em volta de cada letra.
     */
    it('devolve a fita de um pixel às duas cores vizinhas', () => {
      const w = 20;
      const h = 6;
      const idx = stripes(w, h, 1);

      const changed = snapEdgeBands(idx, [WHITE, NAVY, BLEND], w, h);

      expect(changed).toBeGreaterThan(0);
      expect(Array.from(idx).filter((v) => v === 2).length).withContext('sobrou fita').toBe(0);
    });

    it('come também uma fita de dois pixels, em duas rodadas', () => {
      const w = 20;
      const h = 6;
      const idx = stripes(w, h, 2);

      snapEdgeBands(idx, [WHITE, NAVY, BLEND], w, h);
      expect(Array.from(idx).filter((v) => v === 2).length).toBe(0);
    });

    /**
     * A trava que impede a função de virar um destruidor de desenho: uma faixa
     * LARGA é conteúdo, mesmo que a cor dela esteja entre as vizinhas. Um
     * degradê é feito inteiro de cores que estão entre outras duas.
     */
    it('não toca numa faixa grossa, mesmo com a cor no meio das vizinhas', () => {
      const w = 30;
      const h = 8;
      const idx = stripes(w, h, 10);
      const before = Int32Array.from(idx);

      snapEdgeBands(idx, [WHITE, NAVY, BLEND], w, h);

      // O miolo da faixa não pode ter mudado.
      for (let y = 0; y < h; y++) {
        for (let x = 12; x < 18; x++) {
          expect(idx[y * w + x]).toBe(before[y * w + x]);
        }
      }
    });

    /** A outra trava: fina, mas a cor NÃO está entre as vizinhas — é um traço
     *  cinza de um pixel que o desenho tem, e apagá-lo seria apagar desenho. */
    it('não toca numa linha fina cuja cor não é mistura das vizinhas', () => {
      const w = 20;
      const h = 6;
      const idx = stripes(w, h, 1);
      const before = Int32Array.from(idx);

      snapEdgeBands(idx, [WHITE, NAVY, GREY], w, h);
      expect(idx).toEqual(before);
    });

    it('não mexe em pixel marcado como transparente', () => {
      const w = 20;
      const h = 6;
      const idx = stripes(w, h, 1);
      const skip = new Uint8Array(w * h).fill(1);
      const before = Int32Array.from(idx);

      snapEdgeBands(idx, [WHITE, NAVY, BLEND], w, h, skip);
      expect(idx).toEqual(before);
    });

    /** Reprodutibilidade: o mesmo mapa tem de dar o mesmo resultado, e não pode
     *  depender da direção da varredura. */
    it('é determinístico', () => {
      const w = 24;
      const h = 8;
      const a = stripes(w, h, 1);
      const b = stripes(w, h, 1);

      snapEdgeBands(a, [WHITE, NAVY, BLEND], w, h);
      snapEdgeBands(b, [WHITE, NAVY, BLEND], w, h);
      expect(a).toEqual(b);
    });
  });

  describe('transitionMask', () => {
    /** Meia imagem preta, meia branca: só a coluna da divisa é transição. */
    function halves(w: number, h: number): Uint8ClampedArray {
      const px = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const v = x < w / 2 ? 0 : 255;
          const i = (y * w + x) * 4;
          px[i] = v;
          px[i + 1] = v;
          px[i + 2] = v;
          px[i + 3] = 255;
        }
      }
      return px;
    }

    it('marca a divisa e deixa as áreas chapadas de fora', () => {
      const w = 40;
      const h = 10;
      const mask = transitionMask(halves(w, h), w, h);

      expect(mask).not.toBeNull();
      // As duas colunas que se tocam na divisa.
      expect(mask![5 * w + 19]).toBe(1);
      expect(mask![5 * w + 20]).toBe(1);
      // Longe dela, nada.
      expect(mask![5 * w + 3]).toBe(0);
      expect(mask![5 * w + 36]).toBe(0);
    });

    /**
     * Numa imagem que é toda transição (uma foto, um degradê) a máscara não
     * descreve nada — e devolver uma máscara que cobre tudo deixaria o k-means
     * sem amostra nenhuma.
     */
    it('desiste quando quase tudo é transição', () => {
      const w = 40;
      const h = 40;
      const px = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        const v = (i % 2) * 255;
        px[i * 4] = v;
        px[i * 4 + 1] = v;
        px[i * 4 + 2] = v;
        px[i * 4 + 3] = 255;
      }

      expect(transitionMask(px, w, h)).toBeNull();
    });

    it('não marca nada numa imagem de uma cor só', () => {
      const w = 20;
      const h = 20;
      const px = new Uint8ClampedArray(w * h * 4).fill(200);
      expect(transitionMask(px, w, h)).toBeNull();
    });
  });
});
