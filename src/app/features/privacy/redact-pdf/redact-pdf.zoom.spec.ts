import { FIT_ZOOM, ZOOM_STEPS, stepZoom } from './redact-pdf.component';

/**
 * Só o degrau do zoom. O resto do componente é E2E (spec 19) porque o que
 * importa ali — a tarja cair no lugar certo da página — não é observável sem
 * um PDF de verdade e um raster.
 *
 * O que se pina aqui é a saturação nas pontas: `ZOOM_STEPS[i + 1]` fora do
 * array devolve `undefined`, a altura da folha vira `calc(min(…) * undefined)`,
 * o CSS descarta a declaração inteira e a página some da tela sem nenhum erro
 * no console.
 */
describe('stepZoom', () => {
  const first = ZOOM_STEPS[0]!;
  const last = ZOOM_STEPS[ZOOM_STEPS.length - 1]!;

  it('walks one step at a time in both directions', () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1.5, -1)).toBe(1);
  });

  it('saturates at both ends instead of running off the table', () => {
    expect(stepZoom(last, 1)).toBe(last);
    expect(stepZoom(first, -1)).toBe(first);
  });

  it('never returns a non-finite zoom, whatever it is handed', () => {
    for (const start of [...ZOOM_STEPS, 0.01, 999, FIT_ZOOM]) {
      for (const dir of [1, -1] as const) {
        const next = stepZoom(start, dir);
        expect(Number.isFinite(next)).withContext(`${start} ${dir}`).toBe(true);
        expect(ZOOM_STEPS).withContext(`${start} ${dir}`).toContain(next);
      }
    }
  });

  it('snaps a zoom that is not on the table to a neighbouring step', () => {
    // 1.4 fica entre 1 e 1.5; ampliar dali tem de subir, não voltar.
    expect(stepZoom(1.4, 1)).toBe(2);
    expect(stepZoom(1.4, -1)).toBe(1);
  });

  it('starts fitted, and the fit is one of the steps', () => {
    expect(ZOOM_STEPS).toContain(FIT_ZOOM);
  });
});
