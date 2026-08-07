/**
 * Transparência.
 *
 * O vetorizador nasceu tratando a imagem como OPACA — a partição cobre todo
 * pixel, e o alfa não era consultado em lugar nenhum. Duas consequências, e as
 * duas eram visíveis no resultado:
 *
 * 1. O serviço pintava BRANCO antes de desenhar, para que os pixels
 *    transparentes não entrassem com RGB indefinido (tipicamente preto). Então
 *    todo PNG recortado voltava com um retângulo branco atrás — quem vetoriza um
 *    recorte quer exatamente o contrário.
 *
 * 2. Sem o branco, era pior. Um logo de uma cor só com a forma inteiramente
 *    descrita pelo alfa (o caso mais comum de PNG recortado: RGB constante,
 *    silhueta no canal alfa) chega ao quantizador como UMA cor em todo pixel.
 *    Medido: um disco vermelho sobre transparente saía como um retângulo
 *    vermelho cobrindo a imagem inteira. Não era um erro de traçado — não havia
 *    nada para traçar, porque a informação estava no canal que ninguém lia.
 *
 * A saída são duas peças que se completam:
 *
 *   - `bleedTransparentColors` põe cor plausível debaixo do que é transparente,
 *     para que nem o filtro nem o quantizador vejam uma borda falsa contra o
 *     preto/branco do fundo inexistente;
 *   - `ALPHA_CUTOFF` faz o pixel transparente virar uma REGIÃO como qualquer
 *     outra na segmentação, que no fim simplesmente não é emitida. Buraco no
 *     SVG, não forma branca.
 *
 * O limiar único (e não uma faixa de alfa parcial) é deliberado: SVG não tem
 * como expressar "esta forma tem uma borda de opacidade variável" sem um degradê
 * por borda, e a borda com antialiasing de um recorte tem tipicamente um pixel.
 * Meio pixel para dentro ou para fora é o erro de amostragem que já existe em
 * todo o resto do traçado.
 */

/** Alfa a partir do qual o pixel conta como desenho. */
export const ALPHA_CUTOFF = 128;

/**
 * Empurra a cor dos pixels opacos para dentro da área transparente.
 *
 * POR QUE ISTO É NECESSÁRIO E NÃO É COSMÉTICO
 *
 * Um PNG recortado guarda, quase sempre, RGB=0 sob o alfa=0 — o codificador não
 * tem motivo para guardar outra coisa. Se esse preto chega ao pipeline, ele é
 * uma cor de verdade para o quantizador: rouba uma entrada da paleta, e o filtro
 * que preserva aresta (`preprocess.ts`) enxerga a borda mais forte da imagem
 * exatamente onde não há borda nenhuma, borrando a cor real do objeto contra um
 * preto que ninguém vai ver.
 *
 * Preencher com a cor do vizinho opaco mais próximo resolve os dois: a área
 * transparente deixa de ter contraste com o objeto, e o que for lido ali (pelo
 * filtro, pela janela do quantizador, pelo ajuste de degradê) é a cor que o
 * objeto tem na borda. O alfa não é tocado — quem decide o que é buraco é o
 * `ALPHA_CUTOFF`, depois.
 *
 * Propaga por camadas de um pixel, em `passes` rodadas. Não vai até o fim da
 * imagem de propósito: o que precisa de cor é a vizinhança da borda (o filtro
 * usa raio 2, a quantização olha pixel a pixel), e uma dilatação completa numa
 * imagem de 4 MP custaria tempo para pintar uma área que ninguém consulta.
 *
 * @param rgba modificado NO LUGAR — o chamador já é dono do buffer
 */
export function bleedTransparentColors(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  passes = 4,
): void {
  const n = w * h;

  const filled = new Uint8Array(n);
  let anyTransparent = false;
  for (let i = 0; i < n; i++) {
    if (rgba[i * 4 + 3] >= ALPHA_CUTOFF) filled[i] = 1;
    else anyTransparent = true;
  }
  if (!anyTransparent) return;

  for (let pass = 0; pass < passes; pass++) {
    // A camada desta rodada é decidida contra o estado do INÍCIO dela. Marcar
    // enquanto percorre faria a cor escorrer para dentro na direção da varredura
    // (esquerda para a direita, de cima para baixo) e o resultado dependeria da
    // ordem do laço em vez da geometria.
    const grew: number[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;

        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;

        if (x > 0 && filled[i - 1]) {
          r += rgba[(i - 1) * 4];
          g += rgba[(i - 1) * 4 + 1];
          b += rgba[(i - 1) * 4 + 2];
          count++;
        }
        if (x < w - 1 && filled[i + 1]) {
          r += rgba[(i + 1) * 4];
          g += rgba[(i + 1) * 4 + 1];
          b += rgba[(i + 1) * 4 + 2];
          count++;
        }
        if (y > 0 && filled[i - w]) {
          r += rgba[(i - w) * 4];
          g += rgba[(i - w) * 4 + 1];
          b += rgba[(i - w) * 4 + 2];
          count++;
        }
        if (y < h - 1 && filled[i + w]) {
          r += rgba[(i + w) * 4];
          g += rgba[(i + w) * 4 + 1];
          b += rgba[(i + w) * 4 + 2];
          count++;
        }

        if (count === 0) continue;

        rgba[i * 4] = Math.round(r / count);
        rgba[i * 4 + 1] = Math.round(g / count);
        rgba[i * 4 + 2] = Math.round(b / count);
        grew.push(i);
      }
    }

    if (grew.length === 0) return;
    for (const i of grew) filled[i] = 1;
  }
}
