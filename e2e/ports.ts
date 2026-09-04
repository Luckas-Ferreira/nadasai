/**
 * As duas portas da suíte, num lugar só.
 *
 * Isto é um módulo em vez de duas leituras de `process.env` porque os specs que
 * apontam para o build de produção (09-offline, 21-prerender) precisam da MESMA
 * porta que o `webServer` subiu: as duas cópias do número já existiam, e a
 * segunda não seguia a primeira.
 *
 * ── POR QUE O PADRÃO NÃO É MAIS 4200 ────────────────────────────────────────
 *
 * Porque 4200 é o padrão de TODO projeto Angular, e o `reuseExistingServer: true`
 * do `ng serve` não pergunta de quem é o servidor que já está de pé. Numa máquina
 * com um segundo projeto Angular aberto, a suíte inteira roda contra O OUTRO
 * PRODUTO — e não falha dizendo isso: falha dizendo que não achou o link "Nada
 * Sai", 19 vezes, o que se lê como a casca ter quebrado. Aconteceu, e custou uma
 * execução inteira até alguém olhar a captura e ver a tela de login de outra
 * empresa.
 *
 * Reusar continua certo (o `ng serve` observa arquivo, então nunca está
 * desatualizado — ver `playwright.config.ts`); o que estava errado era escolher a
 * porta mais disputada do ecossistema para isso. 4444 é do projeto, e o
 * `angular.json` a declara para que `npm start` e a suíte concordem sem ninguém
 * passar `--port`.
 *
 * A guarda em `e2e/fixtures/generate.ts` fecha o resto: se um dia houver outra
 * coisa NESTA porta, a execução para na primeira linha e diz o quê.
 *
 * As duas continuam configuráveis pelo ambiente, que é o que resolve a colisão
 * seguinte sem editar arquivo.
 */
export const DEV_PORT = process.env['NADASAI_DEV_PORT'] ?? '4444';
export const PREVIEW_PORT = process.env['NADASAI_PREVIEW_PORT'] ?? '4300';

export const DEV_URL = `http://localhost:${DEV_PORT}`;
export const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
