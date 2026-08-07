import { ALPHA_CUTOFF, bleedTransparentColors } from './alpha';

describe('alpha', () => {
  /** Um quadrado opaco no meio de uma imagem transparente, com RGB zerado fora
   *  dele — que é o que um PNG recortado guarda sob o alfa. */
  function cutout(w: number, h: number, box: { x0: number; y0: number; x1: number; y1: number }) {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const inside = x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
        if (inside) {
          rgba[i] = 200;
          rgba[i + 1] = 40;
          rgba[i + 2] = 60;
          rgba[i + 3] = 255;
        }
      }
    }
    return rgba;
  }

  it('põe a cor do objeto na vizinhança transparente, sem tocar no alfa', () => {
    const w = 20;
    const h = 20;
    const rgba = cutout(w, h, { x0: 8, y0: 8, x1: 12, y1: 12 });

    bleedTransparentColors(rgba, w, h, 2);

    // Um pixel colado no objeto: recebeu a cor dele.
    const i = (10 * w + 7) * 4;
    expect(rgba[i]).toBe(200);
    expect(rgba[i + 1]).toBe(40);
    expect(rgba[i + 2]).toBe(60);
    // E continua transparente: quem decide o que é buraco é o ALPHA_CUTOFF.
    expect(rgba[i + 3]).toBe(0);
    expect(rgba[i + 3]).toBeLessThan(ALPHA_CUTOFF);
  });

  it('não vaza mais longe do que as rodadas pedidas', () => {
    const w = 20;
    const h = 20;
    const rgba = cutout(w, h, { x0: 8, y0: 8, x1: 12, y1: 12 });

    bleedTransparentColors(rgba, w, h, 2);

    // Três pixels de distância, com duas rodadas: intocado.
    const far = (10 * w + 5) * 4;
    expect(rgba[far]).toBe(0);
    expect(rgba[far + 1]).toBe(0);
  });

  it('não mexe em imagem sem transparência nenhuma', () => {
    const w = 8;
    const h = 8;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = i;
      rgba[i * 4 + 3] = 255;
    }
    const before = rgba.slice();

    bleedTransparentColors(rgba, w, h, 4);
    expect(rgba).toEqual(before);
  });

  /** Sem esta propriedade o resultado dependeria da ordem da varredura, e a
   *  vetorização deixaria de ser determinística. */
  it('propaga por camadas, não na direção do laço', () => {
    const w = 9;
    const h = 3;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Só o pixel do meio é opaco.
    const mid = (1 * w + 4) * 4;
    rgba[mid] = 100;
    rgba[mid + 3] = 255;

    bleedTransparentColors(rgba, w, h, 1);

    // Uma rodada = uma camada, simétrica dos dois lados.
    expect(rgba[(1 * w + 3) * 4]).toBe(100);
    expect(rgba[(1 * w + 5) * 4]).toBe(100);
    expect(rgba[(1 * w + 2) * 4]).toBe(0);
    expect(rgba[(1 * w + 6) * 4]).toBe(0);
  });
});
