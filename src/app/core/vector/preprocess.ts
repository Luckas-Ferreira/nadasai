/**
 * Filtro que preserva aresta, aplicado ANTES de quantizar.
 *
 * POR QUE ELE É OBRIGATÓRIO
 *
 * JPEG comprime em blocos de 8x8 no domínio da frequência. O que volta na
 * decodificação não é a imagem original: é ela mais um ruído estruturado —
 * "ringing" ao redor de toda borda dura e variação de ±3 níveis dentro de áreas
 * que eram perfeitamente chapadas. O olho não vê, porque o olho integra.
 *
 * O quantizador vê. Uma área que era uma cor só vira dezenas de cores próximas,
 * o segmentador acha centenas de componentes conexos de 3 px cada, e o resultado
 * é o defeito nº 6 da lista: ruído de compressão virando geometria. O despeckle
 * de `segment.ts` limpa o que sobra, mas ele funde por ÁREA — não distingue uma
 * manchinha de artefato de um detalhe pequeno e legítimo. Filtrar antes é o que
 * faz o artefato não chegar a existir como região.
 *
 * POR QUE FILTRO GUIADO E NÃO BILATERAL
 *
 * O bilateral é o nome que todo mundo conhece e é O(r²) por pixel: com raio 4
 * são 81 vizinhos por pixel, e numa foto de 12 MP isso é um bilhão de operações
 * — segundos, na main thread, para o passo mais barato do pipeline.
 *
 * O filtro guiado (He, Sun, Tang, 2010) resolve o mesmo problema — suavizar
 * dentro das regiões e não através das bordas — em O(1) por pixel,
 * independentemente do raio, porque tudo se reduz a médias de janela e média de
 * janela sai de tabela de soma acumulada em quatro leituras. A qualidade é
 * comparável e ele não tem o artefato de "gradiente reverso" que o bilateral
 * produz perto de bordas fortes.
 *
 * A intuição: para cada janela, ajusta-se c_out = a*c_in + b por mínimos
 * quadrados. Onde a janela é chapada, a variância é ~0, `a` vai a zero e a saída
 * vira a média local — suavização máxima. Onde há borda, a variância é alta, `a`
 * vai a 1 e a saída é a entrada — nenhuma suavização. O parâmetro `eps` é o que
 * define "chapado o bastante", e é ele que se calibra contra o ruído de JPEG.
 *
 * Cada canal é filtrado com ele mesmo como guia (self-guided), que é o modo
 * "edge-preserving smoothing" do artigo.
 */

/** Tabela de soma acumulada, para média de janela em tempo constante. */
function integral(src: Float32Array, w: number, h: number): Float64Array {
  // (w+1)x(h+1) com a primeira linha e coluna zeradas: evita testar borda dentro
  // do laço de leitura, que é o laço quente.
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += src[y * w + x];
      sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  return sat;
}

/** Média numa janela quadrada de raio r, com a janela recortada nas bordas. */
function boxMean(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const sat = integral(src, w, h);
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);

      const a = sat[y0 * (w + 1) + x0];
      const b = sat[y0 * (w + 1) + (x1 + 1)];
      const c = sat[(y1 + 1) * (w + 1) + x0];
      const d = sat[(y1 + 1) * (w + 1) + (x1 + 1)];

      // Recortar a janela nas bordas em vez de espelhar: espelhar inventa
      // conteúdo, e numa imagem cujo objeto encosta na borda (logo recortado
      // justo) o conteúdo inventado vira região.
      out[y * w + x] = (d - b - c + a) / ((x1 - x0 + 1) * (y1 - y0 + 1));
    }
  }
  return out;
}

export interface PreprocessOptions {
  /** Raio da janela, em pixels. 0 desliga o filtro. */
  readonly radius: number;
  /**
   * Quanta variância ainda conta como "chapado". Na escala 0-255 ao quadrado.
   *
   * ~1e-4 * 255² ≈ 6.5 é o que a literatura usa para suavização suave. Aqui o
   * padrão é mais alto porque o alvo não é estética e sim impedir que o
   * quantizador enxergue estrutura onde há artefato.
   */
  readonly epsilon: number;
}

export const DEFAULT_PREPROCESS: PreprocessOptions = { radius: 2, epsilon: 60 };

/**
 * Filtro guiado auto-guiado, canal a canal, in-place num novo buffer.
 *
 * O alfa é COPIADO e nunca filtrado, e isso é uma dependência, não um detalhe:
 * quem decide o que é buraco (`alpha.ts`) e quem localiza a borda de um recorte
 * em sub-pixel (`refine.ts`) leem o alfa DESTE buffer. Borrá-lo aqui empurraria
 * a silhueta do recorte para dentro — o detalhe que quem vetoriza um recorte
 * mais quer preservar.
 */
export function preprocess(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  opts: PreprocessOptions = DEFAULT_PREPROCESS,
): Uint8ClampedArray {
  if (opts.radius <= 0) return rgba;

  const n = w * h;
  const out = new Uint8ClampedArray(rgba);
  const channel = new Float32Array(n);

  for (let ch = 0; ch < 3; ch++) {
    for (let i = 0; i < n; i++) channel[i] = rgba[i * 4 + ch];

    const meanI = boxMean(channel, w, h, opts.radius);

    // E[I²] pela mesma tabela, para tirar a variância sem uma segunda passada
    // por janela: Var = E[I²] - E[I]².
    const sq = new Float32Array(n);
    for (let i = 0; i < n; i++) sq[i] = channel[i] * channel[i];
    const meanII = boxMean(sq, w, h, opts.radius);

    const a = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const varI = meanII[i] - meanI[i] * meanI[i];
      // varI pode sair levemente negativo por erro de ponto flutuante numa
      // janela perfeitamente uniforme; o max com 0 evita um `a` negativo, que
      // inverteria o contraste local naquele pixel.
      a[i] = Math.max(0, varI) / (Math.max(0, varI) + opts.epsilon);
      b[i] = meanI[i] - a[i] * meanI[i];
    }

    // Média dos coeficientes — é este segundo box que remove a descontinuidade
    // entre janelas vizinhas. Sem ele o resultado sai em blocos, e blocos são
    // exatamente o que não se quer entregar ao segmentador.
    const meanA = boxMean(a, w, h, opts.radius);
    const meanB = boxMean(b, w, h, opts.radius);

    for (let i = 0; i < n; i++) out[i * 4 + ch] = Math.round(meanA[i] * channel[i] + meanB[i]);
  }

  return out;
}
