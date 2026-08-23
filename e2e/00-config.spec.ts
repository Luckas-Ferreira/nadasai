import { expect, test } from '@playwright/test';
import { previewNeeded } from './preview';

/**
 * O único spec daqui que não abre navegador.
 *
 * `previewNeeded()` decide se o servidor do build de produção sobe, e errar
 * para menos é caro: o `09-offline` falha por porta fechada e a falha parece do
 * produto. A primeira versão comparava o filtro com o NOME da suíte, então
 * `09-offline` casava e `e2e/0` não — e `e2e/0` é exatamente como se roda um
 * lote. Esta tabela existe por causa disso.
 *
 * `argv` começa com dois lugares que o Node ocupa (executável e script), que é
 * o que o `slice(2)` descarta.
 */
const argv = (...args: string[]) => ['node', 'playwright', 'test', ...args];

test.describe('Seleção do servidor de preview', () => {
  test('sobe para a suíte inteira e para quem cita um dos três', () => {
    expect(previewNeeded(argv())).toBe(true);
    expect(previewNeeded(argv('09-offline'))).toBe(true);
    expect(previewNeeded(argv('21-prerender'))).toBe(true);
    expect(previewNeeded(argv('36-csp'))).toBe(true);
    expect(previewNeeded(argv('e2e/09-offline.spec.ts'))).toBe(true);
    expect(previewNeeded(argv('e2e\\09-offline.spec.ts'))).toBe(true);
  });

  /** Rodar um LOTE é um filtro de caminho, e foi aí que a primeira versão errou. */
  test('reconhece o filtro de lote pelo caminho', () => {
    expect(previewNeeded(argv('e2e/0'))).toBe(true);
    expect(previewNeeded(argv('e2e/2'))).toBe(true);
    expect(previewNeeded(argv('e2e/3'))).toBe(true);
  });

  test('não sobe para um spec que não olha o artefato', () => {
    expect(previewNeeded(argv('54-id-photo'))).toBe(false);
    expect(previewNeeded(argv('e2e/1'))).toBe(false);
    expect(previewNeeded(argv('e2e/5'))).toBe(false);
    expect(previewNeeded(argv('-g', 'algo', '48-crop-video'))).toBe(false);
  });

  test('basta um dos filtros pedir', () => {
    expect(previewNeeded(argv('54-id-photo', '36-csp'))).toBe(true);
  });
});
