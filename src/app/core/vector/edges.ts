/**
 * A FAIXA DE BORDA — o pixel que não é nenhuma das duas cores.
 *
 * O DEFEITO
 *
 * Numa imagem real, a borda entre duas cores não é uma linha: é uma fileira de
 * pixels com a MISTURA das duas, porque foi assim que o desenho foi rasterizado
 * (antialiasing) ou porque o JPEG borrou o que era duro. Para o olho isso é a
 * borda. Para o quantizador é uma cor legítima, com muitos pixels — todas as
 * bordas do desenho — e ele gasta uma entrada de paleta com ela.
 *
 * E aí essa cor vira REGIÃO, e a região vira `<path>`: uma fita de um pixel de
 * largura acompanhando cada letra, cada ícone. Num logotipo azul sobre branco o
 * resultado é uma "casquinha" clara em volta de cada letra e uma trinca clara
 * dentro das hastes — medido num logo de 9,9 kB: 64 formas, 1020 nós e nove
 * cores para um desenho de duas. O SVG saía TRÊS VEZES MAIOR que o PNG que ele
 * deveria substituir, e pior de olhar.
 *
 * Não adianta apertar o despeckle de `segment.ts`: ele funde por ÁREA, e uma
 * fita de 1 px de largura por 300 de comprimento tem área 300 — grande. Nem
 * baixar o número de cores: some com a cor real do desenho junto.
 *
 * O CRITÉRIO
 *
 * O pixel de borda tem duas propriedades ao mesmo tempo, e é preciso exigir as
 * duas:
 *
 *   1. a classe dele é LOCALMENTE FINA — no máximo dois dos quatro vizinhos são
 *      da mesma cor. Uma região de verdade, mesmo estreita, tem miolo;
 *   2. a cor dele fica ENTRE as de dois vizinhos, em Lab. É o que distingue
 *      "mistura de azul com branco" de "um traço cinza que existe no desenho".
 *
 * Só a primeira condição apagaria linhas finas legítimas (a haste de um "l", o
 * contorno de um ícone). Só a segunda apagaria degradês inteiros, onde todo
 * pixel está entre dois vizinhos. Juntas, elas descrevem exatamente a fita de
 * transição — e o pixel vai para a mais próxima das duas cores, que é onde o
 * olho já o via.
 */

import { type Lab, deltaE76 } from './color';

/**
 * Marca os pixels que estão EM CIMA de uma transição, para que a paleta não seja
 * escolhida por eles.
 *
 * O `snapEdgeBands` abaixo conserta o mapa de rótulos depois que a paleta já
 * existe — e isso não basta, porque o estrago começa antes. O k-means enxerga a
 * fita de transição como uma cor com MUITOS pixels (todas as bordas do desenho
 * somadas) e gasta centróides com ela; o k automático então cresce para
 * acomodar tons que ninguém pediu, e a paleta de um logotipo de três cores sai
 * com seis. Medido no logo sintético com ruído: a contagem de formas oscilava
 * entre 24 e 337 conforme o filtro de ruído, e a variável que mandava não era o
 * ruído — era quantas cores intermediárias a paleta tinha adotado naquela
 * rodada.
 *
 * O limiar é por QUANTIL e não por valor fixo: "borda" é relativo ao contraste
 * de cada imagem, e um número absoluto que serve para um logo chapado marca a
 * imagem inteira numa foto. Se o corte marcar mais que metade dos pixels, a
 * imagem não tem áreas chapadas para amostrar (é textura, não desenho) e a
 * máscara é descartada em vez de deixar o k-means sem amostra.
 */
export function transitionMask(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  quantile = 0.75,
): Uint8Array | null {
  const n = w * h;
  if (n < 16) return null;

  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    luma[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }

  // Amplitude local (max - min) na vizinhança 4. Mais barato que Sobel e mede o
  // que interessa aqui: existe outra cor encostada?
  const range = new Uint8Array(n);
  const hist = new Int32Array(256);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let lo = luma[i];
      let hi = luma[i];
      if (x > 0) {
        lo = Math.min(lo, luma[i - 1]);
        hi = Math.max(hi, luma[i - 1]);
      }
      if (x < w - 1) {
        lo = Math.min(lo, luma[i + 1]);
        hi = Math.max(hi, luma[i + 1]);
      }
      if (y > 0) {
        lo = Math.min(lo, luma[i - w]);
        hi = Math.max(hi, luma[i - w]);
      }
      if (y < h - 1) {
        lo = Math.min(lo, luma[i + w]);
        hi = Math.max(hi, luma[i + w]);
      }
      const v = Math.min(255, Math.round(hi - lo));
      range[i] = v;
      hist[v]++;
    }
  }

  // Quantil por histograma: uma passada, sem ordenar um milhão de valores.
  const target = n * quantile;
  let acc = 0;
  let cut = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) {
      cut = v;
      break;
    }
  }

  // Um piso absoluto impede que uma imagem já chapada (onde o quantil cai em 1)
  // tenha 25% dos pixels marcados por diferença de arredondamento.
  cut = Math.max(cut, 12);

  const mask = new Uint8Array(n);
  let marked = 0;
  for (let i = 0; i < n; i++) {
    if (range[i] > cut) {
      mask[i] = 1;
      marked++;
    }
  }

  return marked > n * 0.5 || marked === 0 ? null : mask;
}

/**
 * Espessura máxima, em pixels, do que ainda conta como fita de transição.
 *
 * Contar vizinhos iguais — a primeira versão — só enxergava fita de UM pixel:
 * num filete vertical de dois, cada pixel tem três vizinhos da própria classe
 * (o de cima, o de baixo e o do lado) e a regra o dava como região sólida. E
 * fita de dois pixels é o caso comum depois de um filtro de ruído de raio 3, ou
 * em qualquer imagem que já foi ampliada uma vez.
 *
 * Medir a espessura ao longo de cada eixo é a pergunta certa e responde as duas:
 * anda-se para os dois lados até achar outra classe, e o que estiver entre duas
 * classes DIFERENTES a menos de `MAX_BAND` pixels é fita.
 */
const MAX_BAND = 2;

/** As duas cores precisam ser distinguíveis, ou "entre elas" não quer dizer
 *  nada. ΔE76 de 15 é bem acima do limiar de percepção (~2,3). */
const MIN_SEPARATION = 15;

/**
 * Quão longe do segmento A-B a cor pode estar para ainda ser considerada uma
 * mistura das duas: uma fração do comprimento E um teto absoluto em Lab.
 *
 * O teto absoluto é o que faz a diferença. Só com a fração, um cinza médio entre
 * branco e azul-marinho passa: a distância dele ao segmento é 20, e 20 é 22% de
 * um segmento de comprimento 93. Mas 20 em Lab é uma cor claramente OUTRA — e
 * apagá-la seria apagar um traço cinza que o desenho tem. Uma mistura de
 * verdade fica a menos de 5 do segmento, mesmo depois do filtro e do
 * arredondamento.
 */
const MAX_OFF_AXIS_RATIO = 0.35;
const MAX_OFF_AXIS_ABS = 10;

/** Fração do segmento em que a cor precisa cair. Fora disso ela já é uma das
 *  pontas, e o que existe ali é uma borda dura, não uma fita. */
const T_MIN = 0.12;
const T_MAX = 0.88;

/**
 * Reatribui os pixels de fita de borda à cor vizinha mais próxima, no lugar.
 *
 * @param indices índice de paleta por pixel; MODIFICADO
 * @param colors  a paleta, em Lab
 * @param skip    1 onde o pixel não deve ser tocado (transparente), ou null
 * @param passes  fitas de 2 px precisam de duas rodadas
 * @returns quantos pixels mudaram de classe
 */
export function snapEdgeBands(
  indices: Int32Array,
  colors: readonly Lab[],
  w: number,
  h: number,
  skip: Uint8Array | null = null,
  passes = 2,
): number {
  if (colors.length < 3) return 0; // com duas cores não existe cor "no meio"

  let changed = 0;

  for (let pass = 0; pass < passes; pass++) {
    // A decisão de todos os pixels sai do estado do INÍCIO da rodada. Decidir
    // sobre o resultado parcial faria a fita ser comida da esquerda para a
    // direita, na ordem do laço, e o resultado dependeria da varredura em vez da
    // geometria — além de deixar de ser reprodutível.
    const before = Int32Array.from(indices);
    let hits = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (skip && skip[i]) continue;

        const c = before[i];
        const own = colors[c];
        if (!own) continue;

        /**
         * Anda até sair da classe atual, no máximo `MAX_BAND` passos. Devolve a
         * classe encontrada e quantos pixels da fita ficaram para trás.
         */
        const walk = (dx: number, dy: number): { klass: number; run: number } | null => {
          for (let k = 1; k <= MAX_BAND + 1; k++) {
            const nx = x + dx * k;
            const ny = y + dy * k;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) return null;
            const j = ny * w + nx;
            if (skip && skip[j]) return null;
            if (before[j] !== c) return { klass: before[j], run: k - 1 };
          }
          return null;
        };

        // O eixo em que a fita é mais fina manda: numa quina, um dos dois eixos
        // atravessa a fita e o outro corre ao longo dela.
        let side: [number, number] | null = null;
        let thinnest = Infinity;

        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
        ] as const) {
          const fwd = walk(dx, dy);
          const back = walk(-dx, -dy);
          if (!fwd || !back) continue;
          if (fwd.klass === back.klass) continue; // mesma cor dos dois lados: não é transição
          const thickness = fwd.run + back.run + 1;
          if (thickness > MAX_BAND || thickness >= thinnest) continue;
          thinnest = thickness;
          side = [back.klass, fwd.klass];
        }

        if (!side) continue;

        const ranked: Array<[number, number]> = [
          [side[0], 0],
          [side[1], 0],
        ];
        const a = colors[side[0]];
        const b = colors[side[1]];
        if (!a || !b) continue;

        if (deltaE76(a, b) < MIN_SEPARATION) continue;

        const dL = b.L - a.L;
        const dA = b.a - a.a;
        const dB = b.b - a.b;
        const len2 = dL * dL + dA * dA + dB * dB;
        if (len2 === 0) continue;

        const t = ((own.L - a.L) * dL + (own.a - a.a) * dA + (own.b - a.b) * dB) / len2;
        if (t <= T_MIN || t >= T_MAX) continue;

        // Distância ao segmento, para não capturar uma cor que só por acaso tem
        // projeção no meio (um verde entre azul e branco projeta no meio e não
        // está entre eles).
        const px = a.L + dL * t - own.L;
        const py = a.a + dA * t - own.a;
        const pz = a.b + dB * t - own.b;
        const offAxis = Math.sqrt(px * px + py * py + pz * pz);
        if (offAxis > Math.min(MAX_OFF_AXIS_RATIO * Math.sqrt(len2), MAX_OFF_AXIS_ABS)) continue;

        indices[i] = t < 0.5 ? ranked[0][0] : ranked[1][0];
        hits++;
      }
    }

    changed += hits;
    if (hits === 0) break;
  }

  return changed;
}
