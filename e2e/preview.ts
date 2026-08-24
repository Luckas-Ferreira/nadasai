/**
 * QUEM PRECISA DO BUILD DE PRODUÇÃO, e por que isso é uma lista e não um "sempre".
 *
 * Quatro specs apontam para o artefato real na porta de preview: o `ng serve`
 * não emite `ngsw-worker.js`, então sem ele não há service worker, não há
 * prerender, não há os cabeçalhos do `_headers` e não há o `packs.json` (escrito
 * no postbuild) — que é justamente o que esses quatro existem para provar.
 *
 * Os outros quarenta e tantos rodam contra o servidor de desenvolvimento e não
 * têm nada a ver com o artefato. Subir o servidor de preview para eles custa um
 * segundo processo e, antes desta mudança, um build inteiro — e foi de lá que
 * saíram três diagnósticos falsos seguidos.
 */
export const PREVIEW_SPECS = ['09-offline', '21-prerender', '36-csp', '57-packs'] as const;

const PREVIEW_PATHS = PREVIEW_SPECS.map((spec) => `e2e/${spec}.spec.ts`);

/**
 * O servidor de preview é necessário nesta execução?
 *
 * Sem filtro de arquivo na linha de comando, a suíte inteira roda e a resposta é
 * sim. Com filtro, a comparação usa o mesmo critério do Playwright: o argumento
 * é casado contra o CAMINHO do spec, como substring e como expressão regular.
 *
 * As duas formas são necessárias, e a primeira versão disto só tinha meia:
 * comparar o filtro com o NOME da suíte fazia `09-offline` casar e `e2e/0` não,
 * e `e2e/0` é exatamente como se roda um lote. O servidor não subia, o
 * `09-offline` falhava por porta fechada, e o defeito parecia do produto.
 *
 * Na dúvida a função responde SIM: um servidor a mais custa segundos, e um
 * servidor a menos custa quatro testes vermelhos que não dizem o que houve.
 */
export function previewNeeded(argv: readonly string[]): boolean {
  const filters = argv
    .slice(2)
    .filter((arg) => !arg.startsWith('-'))
    .filter((arg) => arg !== 'test' && !arg.endsWith('playwright'))
    .map((arg) => arg.replace(/\\/g, '/'));

  // `npx playwright test` sem argumento: tudo roda, inclusive os três.
  if (filters.length === 0) return true;

  return filters.some((filter) =>
    PREVIEW_PATHS.some((path) => path.includes(filter) || matchesAsRegExp(path, filter)),
  );
}

function matchesAsRegExp(path: string, filter: string): boolean {
  try {
    return new RegExp(filter).test(path);
  } catch {
    // Um filtro que não compila como regex é só um caminho — o `includes` acima
    // já respondeu por ele.
    return false;
  }
}
