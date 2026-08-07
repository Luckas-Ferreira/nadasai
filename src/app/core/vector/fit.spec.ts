import { detectCorners } from './fit';

describe('detectCorners', () => {
  /** Quadrado fechado, com o último ponto repetindo o primeiro — que é como
   *  `planar.ts` entrega todo ciclo. Os quatro cantos são de 90°. */
  function squareCycle(side = 20): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < side; i++) pts.push({ x: i, y: 0 });
    for (let i = 0; i < side; i++) pts.push({ x: side, y: i });
    for (let i = 0; i < side; i++) pts.push({ x: side - i, y: side });
    for (let i = 0; i < side; i++) pts.push({ x: 0, y: side - i });
    pts.push({ x: 0, y: 0 }); // a cópia da costura
    return pts;
  }

  it('acha os quatro cantos de um quadrado', () => {
    const corners = detectCorners(squareCycle(), true, 3, 50);
    const found = corners.slice(0, -1).filter(Boolean).length;
    expect(found).toBe(4);
  });

  /**
   * REGRESSÃO, e a mais cara deste módulo: o canto que cai na COSTURA do ciclo
   * era apagado.
   *
   * O ponto de emenda aparece duas vezes no array (o último é cópia do
   * primeiro), o afinamento enxergava "dois cantos colados", media os dois com
   * braço de comprimento zero, empatava e apagava o do índice 0. Como o traçado
   * começa num ponto arbitrário, isso destruía UM canto por forma fechada,
   * sempre em lugar diferente.
   *
   * E o estrago não parava no canto: sem a âncora, o ajuste impunha continuidade
   * G1 na esquina e resolvia as duas arestas vizinhas com tangentes a 45°. Na
   * moldura de uma imagem de 240x240 — quatro linhas retas — duas bordas saíam
   * como um S de ±10 px. Era a assinatura de "o recorte ficou estranho".
   */
  it('não perde o canto que cai na emenda do ciclo', () => {
    const square = squareCycle();
    // Gira o ciclo para que a emenda caia EXATAMENTE num canto.
    const m = square.length - 1;
    const start = square.findIndex((p) => p.x === 20 && p.y === 0);
    const rotated = Array.from({ length: m + 1 }, (_, i) => square[(start + i) % m]);

    const corners = detectCorners(rotated, true, 3, 50);

    expect(corners[0]).withContext('o canto da emenda').toBeTrue();
    expect(corners[corners.length - 1]).withContext('a cópia carrega a marca').toBeTrue();
    expect(corners.slice(0, -1).filter(Boolean).length).toBe(4);
  });

  /** No MIOLO: nas duas pontas de um traçado aberto o braço da medida é cortado
   *  pela borda do array, e ali um canto falso não custa nada — a ponta já é
   *  âncora de qualquer jeito, porque é um nó da subdivisão. */
  it('não vê canto numa escada de 45°, que é só amostragem', () => {
    const pts: { x: number; y: number }[] = [];
    for (let k = 0; k < 30; k++) {
      pts.push({ x: k, y: k });
      pts.push({ x: k + 1, y: k });
    }
    const corners = detectCorners(pts, false, 3, 50);
    expect(corners.slice(4, -4).filter(Boolean).length).toBe(0);
  });
});
