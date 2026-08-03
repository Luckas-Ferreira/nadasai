import { FIT_ZOOM, MAX_ZOOM, MIN_ZOOM, clampZoom } from './redact-pdf.component';

/**
 * Só o clamp do zoom. O resto é E2E (spec 19), porque o que importa ali — a
 * tarja continuar sobre o mesmo trecho do documento depois de ampliar — não é
 * observável sem um PDF de verdade e um raster.
 *
 * O que se pina aqui é que NUNCA sai um valor inutilizável. A altura da folha é
 * `calc(min(…) * zoom)`: com NaN o CSS descarta a declaração inteira e a página
 * some da tela, sem erro nenhum no console. O campo de porcentagem aceita texto
 * digitado, então esse NaN tem uma porta de entrada real.
 */
describe('clampZoom', () => {
  it('keeps a value that is already in range', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it('saturates instead of leaving the range', () => {
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(-3)).toBe(MIN_ZOOM);
  });

  it('falls back to the fit when handed something that is not a number', () => {
    // O campo vazio e o texto colado chegam aqui como NaN.
    expect(clampZoom(NaN)).toBe(FIT_ZOOM);
    expect(clampZoom(Infinity)).toBe(FIT_ZOOM);
    expect(clampZoom(-Infinity)).toBe(FIT_ZOOM);
  });

  it('never returns anything the CSS cannot use', () => {
    for (const v of [NaN, Infinity, -Infinity, -1, 0, 0.29, 1, 2.999, 1000]) {
      const z = clampZoom(v);
      expect(Number.isFinite(z)).withContext(`${v}`).toBe(true);
      expect(z).withContext(`${v}`).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(z).withContext(`${v}`).toBeLessThanOrEqual(MAX_ZOOM);
    }
  });

  it('rounds off the float dust that repeated +0.1 leaves behind', () => {
    // 1.7999999999999998 apareceria inteiro no campo de porcentagem.
    expect(clampZoom(1.7999999999999998)).toBe(1.8);
    expect(clampZoom(0.1 + 0.2)).toBe(0.3);
  });

  it('starts fitted, and the fit is inside the range', () => {
    expect(FIT_ZOOM).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(FIT_ZOOM).toBeLessThanOrEqual(MAX_ZOOM);
  });
});
