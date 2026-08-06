import { MODE_PRESETS, suggestMode, vectorize } from './vectorize';

/**
 * Estes testes RENDERIZAM o SVG produzido e comparam pixel a pixel com o raster
 * de entrada. É a única verificação que fecha o laço: conferir a string do path
 * prova que a serialização não quebrou, não que o desenho está certo. Um erro de
 * sinal na convenção esquerda/direita de `planar.ts`, por exemplo, produz um
 * `d` perfeitamente bem formado que pinta o negativo da figura.
 *
 * Karma roda em Chrome de verdade, então há canvas e há decodificador de SVG.
 */
describe('vectorize', () => {
  /**
   * Desenha um raster a partir de ASCII, uma cor por char, com `scale` pixels
   * por char.
   *
   * A escala não é conveniência: a tolerância do ajuste de curva é dada em
   * PIXELS, então num desenho de 8x6 uma tolerância de 0,7 px é 10% da figura e
   * arredonda visivelmente um retângulo pequeno. Testar em 8x6 mediria o
   * comportamento do vetorizador num regime em que ele nunca opera, e uma
   * falha ali não diz nada sobre uma imagem de verdade. Onde a topologia é o
   * que está sob teste (planar.spec.ts) o desenho minúsculo é o certo, porque
   * lá não há ajuste de curva nenhum.
   */
  function raster(rows: string[], palette: Record<string, [number, number, number]>, scale = 1) {
    const h = rows.length * scale;
    const w = rows[0].length * scale;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = palette[rows[(y / scale) | 0][(x / scale) | 0]];
        const i = (y * w + x) * 4;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
      }
    }
    return { rgba, w, h };
  }

  /** Rasteriza um SVG de volta para pixels, no tamanho original. */
  async function renderSvg(svg: string, w: number, h: number): Promise<Uint8ClampedArray> {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG inválido: o navegador recusou desenhar'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h).data;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Fração de pixels cujo canal alfa ficou abaixo de opaco. É a medida direta
   *  de COSTURA: uma fresta entre duas regiões aparece como pixel translúcido,
   *  porque ali nenhum path pintou. */
  function transparentShare(px: Uint8ClampedArray): number {
    let holes = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 250) holes++;
    return holes / (px.length / 4);
  }

  /**
   * O alfa MAIS BAIXO da imagem — a severidade da pior costura, não quantos
   * pixels ela toca.
   *
   * Em borda curva a contagem é a métrica errada: o antialiasing do
   * rasterizador deixa uma faixa de pixels tecnicamente não-opacos ao longo de
   * toda fronteira, e ela existe mesmo num SVG perfeito. O que distingue "traço
   * de antialiasing" de "costura" é a PROFUNDIDADE. Medido neste caso: 153
   * pixels abaixo de 250, e o pior deles em 239 — 94% de cobertura, que ninguém
   * vê. O defeito que o `seamStroke` e a correção do `PathWriter` fecharam
   * deixava área estruturalmente descoberta, com alfa perto de zero.
   */
  function worstAlpha(px: Uint8ClampedArray): number {
    let min = 255;
    for (let i = 3; i < px.length; i += 4) if (px[i] < min) min = px[i];
    return min;
  }

  const BLACK: [number, number, number] = [0, 0, 0];
  const WHITE: [number, number, number] = [255, 255, 255];
  const RED: [number, number, number] = [220, 30, 30];
  const BLUE: [number, number, number] = [30, 60, 200];

  it('produz um SVG que o navegador aceita desenhar', async () => {
    const { rgba, w, h } = raster(
      ['aaaabbbb', 'aaaabbbb', 'aaaabbbb', 'aaaabbbb'],
      { a: RED, b: BLUE },
    );
    const out = vectorize(rgba, w, h, MODE_PRESETS.logo);

    expect(out.svg.startsWith('<svg')).toBe(true);
    expect(out.svg).toContain('viewBox="0 0 8 4"');
    expect(out.shapeCount).toBe(2);

    const px = await renderSvg(out.svg, w, h);
    expect(px.length).toBe(w * h * 4);
  });

  /**
   * O TESTE QUE JUSTIFICA A SUBDIVISÃO PLANAR.
   *
   * Um tabuleiro de regiões vizinhas é o pior caso para costura: são muitas
   * fronteiras internas, e cada uma é uma chance de sobrar meio pixel de nada.
   * Com traçado por região isolada, este teste acusa uma malha de linhas
   * transparentes; com arestas compartilhadas, tem de dar zero.
   */
  it('não deixa costura entre regiões vizinhas', async () => {
    const { rgba, w, h } = raster(
      [
        'aaaabbbbcccc',
        'aaaabbbbcccc',
        'aaaabbbbcccc',
        'ddddeeeeffff',
        'ddddeeeeffff',
        'ddddeeeeffff',
      ],
      { a: RED, b: BLUE, c: BLACK, d: BLUE, e: BLACK, f: RED },
      8,
    );

    const out = vectorize(rgba, w, h, { ...MODE_PRESETS.logo, minArea: 0 });
    const px = await renderSvg(out.svg, w, h);

    // Zero pixel translúcido: a partição cobre a imagem inteira.
    expect(transparentShare(px)).toBe(0);
  });

  /**
   * O teste acima usa retângulos alinhados à grade, e por isso NÃO pegava a
   * segunda causa de costura — a que só existe em borda curva.
   *
   * Numa borda diagonal ou curva o pixel é coberto PARCIALMENTE pelas duas
   * formas vizinhas, digamos 60% e 40%. O renderizador as compõe em sequência,
   * e 60% sobre 40% dá 76%, não 100%: sobram 24% de fundo aparecendo. É o
   * conflation artifact, é artefato do renderizador e não do arquivo, e a
   * geometria compartilhada não o resolve sozinha.
   *
   * Medido num logo de 400x300 com círculo e triângulo antes do `seamStroke`:
   * 11.900 de 120.000 pixels translúcidos, 9,9% da imagem. Este teste é a
   * versão pequena e determinística daquilo.
   */
  it('não deixa costura em borda CURVA (conflation artifact)', async () => {
    const w = 120;
    const h = 120;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Um disco sobre um fundo: a fronteira é curva em toda a volta.
        const inside = Math.hypot(x - w / 2, y - h / 2) < 40;
        const c = inside ? RED : WHITE;
        const i = (y * w + x) * 4;
        rgba[i] = c[0];
        rgba[i + 1] = c[1];
        rgba[i + 2] = c[2];
        rgba[i + 3] = 255;
      }
    }

    const out = vectorize(rgba, w, h, { ...MODE_PRESETS.logo, minArea: 0 });
    const px = await renderSvg(out.svg, w, h);

    // Nenhum pixel abaixo de 90% de cobertura. Medido com a correção: o pior
    // fica em 239/255 (94%). Sem ela, este mesmo desenho tinha 28% da área
    // estruturalmente descoberta — um `d` corrompido pelo separador omitido
    // errado, que o navegador aceita sem reclamar e desenha torto.
    expect(worstAlpha(px)).toBeGreaterThan(230);
  });

  /**
   * O separador mínimo do `d` é uma otimização de bytes que já corrompeu o
   * desenho uma vez: a regra olhava a string acumulada em vez do último token,
   * então `17 0 .33` saía `17 0.33` — dois números onde havia três. O `d`
   * continua bem formado e o navegador não reclama, que é o que fez o defeito
   * passar despercebido até um disco renderizar com 28% de buraco.
   */
  it('emite números que sobrevivem à ida e volta pelo parser', async () => {
    const w = 100;
    const h = 100;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = Math.hypot(x - 50, y - 50) < 33 ? BLUE : WHITE;
        const i = (y * w + x) * 4;
        rgba[i] = c[0];
        rgba[i + 1] = c[1];
        rgba[i + 2] = c[2];
        rgba[i + 3] = 255;
      }
    }

    const out = vectorize(rgba, w, h, { ...MODE_PRESETS.logo, minArea: 0 });
    const d = (out.svg.match(/ d="([^"]*)"/) ?? [])[1] ?? '';

    const numbersIn = (s: string): string[] => s.match(/-?(?:\d*\.\d+|\d+)/g) ?? [];

    expect(d.length).toBeGreaterThan(0);

    // Um subpath é `m <2 números> c <múltiplo de 6> z`. Se algum separador foi
    // omitido onde não podia, dois números viram um, a contagem deixa de fechar
    // e todo o resto do subpath anda deslocado.
    for (const sub of d.split('m').filter(Boolean)) {
      const [movePart, curvePart = ''] = sub.split('c');
      expect(numbersIn(movePart).length).toBe(2);
      expect(numbersIn(curvePart.replace(/z.*$/, '')).length % 6).toBe(0);
    }
  });

  it('reproduz as cores do original', async () => {
    const { rgba, w, h } = raster(
      ['aaaaaaaa', 'aaaaaaaa', 'bbbbbbbb', 'bbbbbbbb'],
      { a: RED, b: BLUE },
      10,
    );

    const out = vectorize(rgba, w, h, { ...MODE_PRESETS.logo, minArea: 0 });
    const px = await renderSvg(out.svg, w, h);

    const at = (x: number, y: number): [number, number, number] => {
      const i = (y * w + x) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    };

    // Longe das fronteiras, para não medir antialiasing do rasterizador.
    const top = at(w / 2, h / 4);
    const bottom = at(w / 2, (h * 3) / 4);
    expect(Math.abs(top[0] - RED[0])).toBeLessThan(30);
    expect(Math.abs(bottom[2] - BLUE[2])).toBeLessThan(30);
  });

  /** Um buraco tem de continuar sendo buraco. Errar o `fill-rule` produz um SVG
   *  que parece certo sobre branco e vaza sobre qualquer outro fundo. */
  it('preserva buraco como buraco', async () => {
    const { rgba, w, h } = raster(
      [
        'aaaaaaaa',
        'aaaaaaaa',
        'aabbbbaa',
        'aabbbbaa',
        'aaaaaaaa',
        'aaaaaaaa',
      ],
      { a: BLACK, b: WHITE },
      12,
    );

    const out = vectorize(rgba, w, h, { ...MODE_PRESETS.logo, minArea: 0 });

    // A região preta tem de sair com DOIS sub-caminhos — externo e buraco — e
    // portanto com fill-rule. Sem isso o buraco viraria preenchimento e o teste
    // de pixel abaixo passaria por acidente se o branco fosse pintado por cima.
    expect(out.svg).toContain('fill-rule="evenodd"');

    const px = await renderSvg(out.svg, w, h);
    const at = (x: number, y: number): number => px[(y * w + x) * 4];
    expect(at(6, 6)).toBeLessThan(60); // moldura preta
    expect(at(w / 2, h / 2)).toBeGreaterThan(200); // miolo branco
  });

  it('modo pixel não suaviza: as bordas continuam retas', async () => {
    const { rgba, w, h } = raster(
      ['abab', 'baba', 'abab', 'baba'],
      { a: BLACK, b: WHITE },
    );

    const out = vectorize(rgba, w, h, MODE_PRESETS.pixel);
    const px = await renderSvg(out.svg, w, h);

    // Cada pixel do xadrez continua sendo ele mesmo.
    const at = (x: number, y: number): number => px[(y * w + x) * 4];
    expect(at(0, 0)).toBeLessThan(60);
    expect(at(1, 0)).toBeGreaterThan(200);
    expect(at(0, 1)).toBeGreaterThan(200);
  });

  it('é determinístico: a mesma entrada dá o mesmo SVG', () => {
    const { rgba, w, h } = raster(
      ['aabbcc', 'aabbcc', 'ddeeff', 'ddeeff'],
      { a: RED, b: BLUE, c: BLACK, d: WHITE, e: RED, f: BLUE },
    );

    const a = vectorize(rgba, w, h, MODE_PRESETS.logo);
    const b = vectorize(rgba.slice(), w, h, MODE_PRESETS.logo);
    expect(a.svg).toBe(b.svg);
  });

  /** A precisão reduzida é uma otimização de bytes que não pode custar desenho.
   *  Se ela quebrasse a geometria, apareceria como costura. */
  it('a precisão de 2 casas não introduz buraco', async () => {
    const { rgba, w, h } = raster(
      ['aaabbb', 'aaabbb', 'cccddd', 'cccddd'],
      { a: RED, b: BLUE, c: BLUE, d: RED },
      10,
    );

    const out = vectorize(rgba, w, h, { ...MODE_PRESETS.logo, minArea: 0, precision: 2 });
    const px = await renderSvg(out.svg, w, h);
    expect(transparentShare(px)).toBe(0);
  });

  describe('suggestMode', () => {
    it('sprite pequeno de poucas cores -> pixel', () => {
      const { rgba, w, h } = raster(['abab', 'baba', 'abab', 'baba'], { a: BLACK, b: WHITE });
      expect(suggestMode(rgba, w, h)).toBe('pixel');
    });

    it('arte plana de poucas cores -> logo', () => {
      const w = 200;
      const h = 200;
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        const c = i % 3 === 0 ? RED : i % 3 === 1 ? BLUE : BLACK;
        rgba[i * 4] = c[0];
        rgba[i * 4 + 1] = c[1];
        rgba[i * 4 + 2] = c[2];
        rgba[i * 4 + 3] = 255;
      }
      expect(suggestMode(rgba, w, h)).toBe('logo');
    });

    it('muitas cores -> ilustração', () => {
      const w = 200;
      const h = 200;
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          rgba[i] = (x * 251) % 256;
          rgba[i + 1] = (y * 149) % 256;
          rgba[i + 2] = (x * y) % 256;
          rgba[i + 3] = 255;
        }
      }
      expect(suggestMode(rgba, w, h)).toBe('illustration');
    });
  });
});
