import { PaletteMapper, buildPalette, mapFrame } from './palette';

/** RGBA a partir de uma lista de cores repetidas. */
function samplesOf(colors: ReadonlyArray<[number, number, number]>, repeat = 1): Uint8ClampedArray {
  const out = new Uint8ClampedArray(colors.length * repeat * 4);
  let at = 0;
  for (let r = 0; r < repeat; r++) {
    for (const [red, green, blue] of colors) {
      out[at++] = red;
      out[at++] = green;
      out[at++] = blue;
      out[at++] = 255;
    }
  }
  return out;
}

describe('buildPalette', () => {
  /**
   * O caso principal da ferramenta, e não uma exceção: gravação de tela é
   * interface chapada, com poucas cores distintas. Quando elas cabem em 256, a
   * paleta É a lista delas e a conversão não perde nada — se este teste cair, o
   * GIF de uma captura de tela passa a ter cor aproximada sem precisar.
   */
  it('uses the exact colours when they fit the cap', () => {
    const colors: Array<[number, number, number]> = [
      [255, 255, 255],
      [15, 23, 42],
      [37, 99, 235],
      [220, 38, 38],
    ];

    const palette = buildPalette(samplesOf(colors, 50), 256);

    expect(palette.exact).toBe(true);
    expect(palette.rgb.length).toBe(4);

    for (const [r, g, b] of colors) {
      expect(palette.rgb.some((c) => c.r === r && c.g === g && c.b === b))
        .withContext(`cor ${r},${g},${b} sumiu da paleta`)
        .toBe(true);
    }
  });

  it('clusters when there are more colours than the cap', () => {
    // Um degradê de 600 tons de cinza, apertado em 8 cores.
    const colors: Array<[number, number, number]> = [];
    for (let i = 0; i < 600; i++) {
      const v = Math.round((i / 599) * 255);
      colors.push([v, v, v]);
    }

    const palette = buildPalette(samplesOf(colors), 8);

    expect(palette.exact).toBe(false);
    expect(palette.rgb.length).toBe(8);

    // Os extremos precisam sobreviver: uma paleta que perde o preto e o branco
    // lava a imagem inteira, e é o defeito clássico de agrupar em RGB sem
    // inicialização cuidadosa.
    const darkest = Math.min(...palette.rgb.map((c) => c.r));
    const lightest = Math.max(...palette.rgb.map((c) => c.r));
    expect(darkest).toBeLessThan(40);
    expect(lightest).toBeGreaterThan(215);
  });

  /** Mesmo vídeo, mesmo GIF: o agrupamento usa PRNG semeado de propósito. */
  it('is deterministic', () => {
    const colors: Array<[number, number, number]> = [];
    for (let i = 0; i < 400; i++) colors.push([i % 256, (i * 3) % 256, (i * 7) % 256]);

    const a = buildPalette(samplesOf(colors), 16);
    const b = buildPalette(samplesOf(colors), 16);

    expect(a.rgb).toEqual(b.rgb);
  });

  it('never goes past 256 colours, whatever is asked for', () => {
    const colors: Array<[number, number, number]> = [];
    for (let i = 0; i < 2000; i++) colors.push([i % 256, (i * 11) % 256, (i * 29) % 256]);

    expect(buildPalette(samplesOf(colors), 4096).rgb.length).toBeLessThanOrEqual(256);
  });
});

describe('mapFrame', () => {
  it('maps every pixel to its own colour when the palette is exact', () => {
    const colors: Array<[number, number, number]> = [
      [255, 0, 0],
      [0, 0, 255],
    ];
    const frame = samplesOf(colors, 2); // 4 pixels: vermelho, azul, vermelho, azul
    const palette = buildPalette(frame, 256);
    const mapper = new PaletteMapper(palette);

    const indices = mapFrame(frame, 2, 2, palette, mapper, false);

    expect(indices.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      const chosen = palette.rgb[indices[i]];
      expect(chosen.r).withContext(`pixel ${i}`).toBe(frame[i * 4]);
      expect(chosen.b).withContext(`pixel ${i}`).toBe(frame[i * 4 + 2]);
    }
  });

  /**
   * O dithering não pode inventar índice fora da paleta nem mudar o tamanho do
   * quadro — o erro difundido satura, e um clamp esquecido produz índice
   * negativo, que no GIF vira uma cor qualquer.
   */
  it('keeps every index inside the palette while dithering a gradient', () => {
    const width = 32;
    const height = 8;
    const frame = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = Math.round((i / (width * height - 1)) * 255);
      frame[i * 4] = v;
      frame[i * 4 + 1] = v;
      frame[i * 4 + 2] = v;
      frame[i * 4 + 3] = 255;
    }

    const palette = buildPalette(frame, 4);
    const mapper = new PaletteMapper(palette);
    const indices = mapFrame(frame, width, height, palette, mapper, true);

    expect(indices.length).toBe(width * height);
    for (const index of indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(palette.rgb.length);
    }

    // Com quatro cores e difusão, um degradê tem de usar mais de uma cor por
    // faixa — se o dithering não estivesse fazendo nada, a saída seria idêntica
    // à sem difusão.
    const flat = mapFrame(frame, width, height, palette, mapper, false);
    expect(Array.from(indices)).not.toEqual(Array.from(flat));
  });
});
