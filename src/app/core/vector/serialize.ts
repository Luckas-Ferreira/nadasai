/**
 * Emissão do SVG.
 *
 * O tamanho do arquivo se decide aqui, e por três coisas que quase todo
 * vetorizador deixa na mesa:
 *
 * 1. PRECISÃO. `12.34567890123` e `12.35` desenham igual num viewBox de 1000 —
 *    a diferença é um centésimo de pixel, muito abaixo do que qualquer tela
 *    mostra. Mas o primeiro custa 13 bytes por número e um path tem centenas.
 *    Arredondar para 2 casas costuma cortar 40% do arquivo sozinho.
 *
 * 2. COMANDOS RELATIVOS. `c` em vez de `C`: os números viram deltas, que são
 *    pequenos (dezenas) em vez de absolutos (milhares). Menos dígitos por
 *    número, e o gzip do servidor ainda gosta mais da repetição que sobra.
 *
 * 3. SEPARADORES MÍNIMOS. A gramática de `d` deixa omitir a vírgula quando o
 *    número seguinte começa com sinal ou quando o ponto é inequívoco: `1-2` é
 *    "1, -2" e `.5.5` é "0.5, 0.5". Isso é um byte por número, e são milhares.
 *
 * O que NÃO é feito: `<use>` para formas repetidas, e agrupamento por cor com
 * `<g fill>`. O primeiro só ganha em padrões sintéticos; o segundo conflita com
 * a ordem de pintura que a subdivisão planar não exige mas que os buracos por
 * `evenodd` exigem.
 */

import type { Cubic, Pt } from './fit';
import type { Gradient } from './gradient';

export interface VectorShape {
  /** Sub-caminhos: o externo e um por buraco. */
  readonly subpaths: ReadonlyArray<readonly Cubic[]>;
  readonly fill: { r: number; g: number; b: number };
  /** Quando presente, substitui `fill`. */
  readonly gradient?: Gradient;
}

export interface SvgOptions {
  readonly width: number;
  readonly height: number;
  /** Casas decimais. 2 é imperceptível e corta ~40% do arquivo. */
  readonly precision: number;
  /** Fundo sólido antes de tudo. `null` deixa o SVG transparente. */
  readonly background: { r: number; g: number; b: number } | null;
  /**
   * Contorno da própria cor, em unidades de usuário, para fechar a fresta de
   * ANTIALIASING. 0 desliga.
   *
   * ISTO NÃO É A GAMBIARRA DE DILATAR QUE `planar.ts` critica, e a diferença é
   * substantiva. Lá o problema era geométrico: cada região traçada isolada
   * produzia DUAS fronteiras diferentes para o mesmo limite, e dilatar era uma
   * tentativa de esconder o desencontro. Aqui a fronteira é uma só — a
   * subdivisão planar garante isso, e `planar.spec.ts` prova.
   *
   * O que sobra é um artefato do RENDERIZADOR, não do arquivo, e todo
   * renderizador de SVG tem: numa borda curva, o pixel é coberto parcialmente
   * pelas duas formas vizinhas — digamos 60% por uma e 40% pela outra. Elas são
   * compostas em SEQUÊNCIA, e compor 60% sobre 40% não dá 100%: dá 76%. Sobra
   * 24% de fundo aparecendo, numa linha ao longo de cada fronteira interna.
   * Chama-se conflation artifact e é conhecido desde o PostScript.
   *
   * Medido antes desta opção, num logo sintético de 400x300 com círculo e
   * triângulo: 11.900 de 120.000 pixels saíam translúcidos — 9,9% da imagem,
   * numa malha de linhas claras que é exatamente o defeito que a subdivisão
   * planar existe para eliminar. O teste unitário não pegava porque usava
   * retângulos alinhados à grade, onde não há cobertura parcial.
   *
   * Um contorno sub-pixel da mesma cor do preenchimento resolve: cada forma
   * cobre meio pixel a mais, o vizinho pintado depois cobre por cima, e a
   * fronteira efetiva se desloca no máximo 0,4 px — abaixo do que qualquer tela
   * mostra. A GEOMETRIA continua exata e continua compartilhada: tirar o
   * `stroke` devolve a partição perfeita, o que é justamente o que a gambiarra
   * de dilatar não permite fazer.
   */
  readonly seamStroke: number;
}

/** Arredonda e remove zeros à direita e o zero antes do ponto: `0.50` -> `.5`. */
function num(v: number, precision: number): string {
  let s = v.toFixed(precision);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') return '0';
  return s.startsWith('0.') ? s.slice(1) : s.startsWith('-0.') ? '-' + s.slice(2) : s;
}

/**
 * Acumula tokens de um `d` com o mínimo de separador que a gramática aceita.
 *
 * A decisão depende do ÚLTIMO TOKEN, nunca da string inteira acumulada — e essa
 * distinção é a diferença entre um path correto e um path corrompido em
 * silêncio. A primeira versão testava `stringAcumulada.includes('.')`, então
 * bastava QUALQUER número anterior ter tido ponto para todos os `.x` seguintes
 * grudarem no token anterior: `17 0 .33` saía como `17 0.33`, que o parser lê
 * como DOIS números em vez de três. O `d` continua bem formado, o navegador não
 * reclama, e o desenho sai errado — foi assim que um disco simples renderizou
 * com 28% da área sem cobertura.
 *
 * As três omissões legais:
 *   - depois de uma letra de comando nunca precisa separador (`c5`, `c-5`, `c.5`);
 *   - um sinal de menos já separa (`1-2` é "1, -2");
 *   - um ponto separa SE o token anterior já tem ponto (`0.5.33` é "0.5, .33"),
 *     porque um número não pode ter dois pontos.
 */
class PathWriter {
  private out = '';
  private lastToken = '';

  command(letter: string): void {
    this.out += letter;
    this.lastToken = '';
  }

  number(token: string): void {
    if (this.out === '' || this.lastToken === '' || token.startsWith('-')) {
      this.out += token;
    } else if (token.startsWith('.') && this.lastToken.includes('.')) {
      this.out += token;
    } else {
      this.out += ' ' + token;
    }
    this.lastToken = token;
  }

  toString(): string {
    return this.out;
  }
}

function pathData(subpaths: ReadonlyArray<readonly Cubic[]>, precision: number): string {
  const w = new PathWriter();
  let cx = 0;
  let cy = 0;

  for (const curves of subpaths) {
    if (curves.length === 0) continue;

    const start = curves[0].p0;
    // `m` relativo ao ponto corrente — no primeiro subpath o corrente é 0,0, e
    // nos seguintes é onde o anterior fechou, o que já economiza dígitos.
    w.command('m');
    w.number(num(start.x - cx, precision));
    w.number(num(start.y - cy, precision));
    cx = start.x;
    cy = start.y;

    // Uma letra `c` só: comandos iguais em sequência podem omitir a repetição, e
    // são seis números por curva, então isso é um byte economizado por segmento.
    w.command('c');

    for (const c of curves) {
      w.number(num(c.c1.x - cx, precision));
      w.number(num(c.c1.y - cy, precision));
      w.number(num(c.c2.x - cx, precision));
      w.number(num(c.c2.y - cy, precision));
      w.number(num(c.p3.x - cx, precision));
      w.number(num(c.p3.y - cy, precision));
      cx = c.p3.x;
      cy = c.p3.y;
    }

    w.command('z');
    // `z` devolve o ponto corrente ao início do subpath — esquecer isto faz todo
    // `m` seguinte sair deslocado, e o sintoma é um SVG com as formas espalhadas
    // que não parece um erro de serialização.
    cx = start.x;
    cy = start.y;
  }

  return w.toString();
}

const hex = (c: { r: number; g: number; b: number }): string => {
  const h = (v: number): string => v.toString(16).padStart(2, '0');
  const s = `${h(c.r)}${h(c.g)}${h(c.b)}`;
  // #aabbcc -> #abc quando possível: três bytes a menos por cor.
  return s[0] === s[1] && s[2] === s[3] && s[4] === s[5] ? `#${s[0]}${s[2]}${s[4]}` : `#${s}`;
};

export function toSvg(shapes: readonly VectorShape[], opts: SvgOptions): string {
  const p = opts.precision;
  const defs: string[] = [];
  const body: string[] = [];

  if (opts.background) {
    body.push(`<rect width="${opts.width}" height="${opts.height}" fill="${hex(opts.background)}"/>`);
  }

  shapes.forEach((shape, i) => {
    const d = pathData(shape.subpaths, p);
    if (!d) return;

    let fill: string;
    if (shape.gradient) {
      const id = `g${i}`;
      const g = shape.gradient;
      if (g.kind === 'linear') {
        defs.push(
          `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
            `x1="${num(g.x1, p)}" y1="${num(g.y1, p)}" x2="${num(g.x2, p)}" y2="${num(g.y2, p)}">` +
            `<stop offset="0" stop-color="${hex(g.from)}"/>` +
            `<stop offset="1" stop-color="${hex(g.to)}"/>` +
            `</linearGradient>`,
        );
      } else {
        defs.push(
          `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
            `cx="${num(g.cx, p)}" cy="${num(g.cy, p)}" r="${num(g.r, p)}">` +
            `<stop offset="0" stop-color="${hex(g.from)}"/>` +
            `<stop offset="1" stop-color="${hex(g.to)}"/>` +
            `</radialGradient>`,
        );
      }
      fill = `url(#${id})`;
    } else {
      fill = hex(shape.fill);
    }

    // `fill-rule="evenodd"` só quando há buraco: o atributo custa 24 bytes e a
    // esmagadora maioria das formas tem um subpath só.
    const rule = shape.subpaths.length > 1 ? ' fill-rule="evenodd"' : '';
    // A COR do contorno é por forma (é a própria cor de preenchimento); só a
    // largura e as junções são compartilhadas, e essas vão no <g> lá embaixo.
    const stroke = opts.seamStroke > 0 ? ` stroke="${fill}"` : '';
    body.push(`<path fill="${fill}"${stroke}${rule} d="${d}"/>`);
  });

  // O contorno anti-fresta vai num `<g>` e não repetido em cada path: são três
  // atributos que valem para todas as formas, e repeti-los por path custaria
  // ~40 bytes vezes o número de formas. `stroke="context-fill"` seria o ideal,
  // mas só existe em SVG 2 e nenhum navegador implementa fora de <marker> — daí
  // o `paint-order`, que ao menos garante que o contorno fique ATRÁS do
  // preenchimento e não engorde visualmente a forma.
  const seam =
    opts.seamStroke > 0
      ? ` stroke-width="${num(opts.seamStroke, opts.precision)}" stroke-linejoin="round" paint-order="stroke"`
      : '';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${opts.width} ${opts.height}" ` +
    `width="${opts.width}" height="${opts.height}">` +
    (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
    (seam ? `<g${seam}>` : '') +
    body.join('') +
    (seam ? `</g>` : '') +
    `</svg>`
  );
}

/** Conta os nós emitidos — o número que a UI mostra e que diz se o resultado é
 *  editável ou uma sopa. */
export function countNodes(shapes: readonly VectorShape[]): number {
  let n = 0;
  for (const s of shapes) for (const sp of s.subpaths) n += sp.length;
  return n;
}

export type { Pt };
