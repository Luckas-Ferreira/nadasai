/**
 * As duas portas da suíte, num lugar só.
 *
 * Elas são configuráveis porque 4200 pode estar ocupada na máquina de quem
 * desenvolve — e quando está, a suíte inteira falha por um motivo que não tem
 * relação nenhuma com o produto. Os padrões continuam sendo os de sempre.
 *
 * Isto é um módulo em vez de duas leituras de `process.env` porque os specs que
 * apontam para o build de produção (09-offline, 21-prerender) precisam da MESMA
 * porta que o `webServer` subiu: as duas cópias do número já existiam, e a
 * segunda não seguia a primeira.
 */
export const DEV_PORT = process.env['NADASAI_DEV_PORT'] ?? '4200';
export const PREVIEW_PORT = process.env['NADASAI_PREVIEW_PORT'] ?? '4300';

export const DEV_URL = `http://localhost:${DEV_PORT}`;
export const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
