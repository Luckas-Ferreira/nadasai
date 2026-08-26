/**
 * ONDE este build vai rodar — decidido em tempo de BUILD, nunca detectado em
 * tempo de execução.
 *
 * Este arquivo é a versão WEB e é o padrão. A configuração `android` do
 * `angular.json` o troca por `platform.android.ts` via `fileReplacements`.
 *
 * Por que assim, e não `Capacitor.isNativePlatform()`:
 *
 *   * o bundle da web não ganha `@capacitor/core` nem uma linha de código de
 *     empacotamento — o valor é uma constante, então o esbuild elimina o ramo
 *     morto inteiro em vez de embarcá-lo e não executá-lo;
 *   * a checagem funciona durante o PRERENDER, onde não existe Capacitor
 *     nenhum e uma detecção de runtime devolveria a resposta errada em Node;
 *   * e o custo em tempo de execução é zero, nos dois lados.
 *
 * ESTA É A ÚNICA COSTURA DE PLATAFORMA DO PRODUTO. A regra que a mantém útil:
 * nenhuma FERRAMENTA pode ler isto. Diferença de plataforma vive atrás da porta
 * única do serviço que já existe (`core/pdf/pdfjs.ts`, `core/video/reencode.ts`,
 * `BackgroundRemovalService`) — um `if` num serviço, não `if (PACKAGED)`
 * espalhado por 57 componentes, que é o fork que um repositório só existe para
 * evitar.
 */
export const PACKAGED = false;
