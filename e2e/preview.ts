import { basename } from 'node:path';

/**
 * QUEM PRECISA DO BUILD DE PRODUÇÃO, e por que isso é uma lista e não um "sempre".
 *
 * Três specs apontam para o artefato real na porta de preview: o `ng serve` não
 * emite `ngsw-worker.js`, então sem ele não há service worker, não há
 * prerender e não há os cabeçalhos do `_headers` — que é justamente o que esses
 * três existem para provar.
 *
 * Os outros quarenta e tantos rodam contra o servidor de desenvolvimento e não
 * têm nada a ver com o artefato. Subir o servidor de preview para eles custa um
 * segundo processo e, antes desta mudança, um build inteiro — e foi de lá que
 * saíram três diagnósticos falsos seguidos.
 */
export const PREVIEW_SPECS = ['09-offline', '21-prerender', '36-csp'] as const;

/**
 * O servidor de preview é necessário nesta execução?
 *
 * Sem filtro de arquivo na linha de comando, a suíte inteira roda e a resposta é
 * sim. Com filtro, só quando algum dos três casa — o Playwright filtra por
 * substring do caminho do spec, então a comparação aqui usa o mesmo critério.
 *
 * O que NÃO dá para fazer é ler a lista de testes selecionados: esta decisão
 * acontece enquanto o arquivo de configuração é avaliado, antes de existir
 * runner. Daí a leitura do `argv`, que é grosseira de propósito — na dúvida,
 * ela sobe o servidor.
 */
export function previewNeeded(argv: readonly string[]): boolean {
  const args = argv.slice(2).filter((arg) => !arg.startsWith('-'));

  // `npx playwright test` sem argumento: tudo roda, inclusive os três.
  const filters = args.filter((arg) => arg !== 'test' && basename(arg) !== 'playwright');
  if (filters.length === 0) return true;

  return filters.some((filter) => PREVIEW_SPECS.some((spec) => spec.includes(filter) || filter.includes(spec)));
}
