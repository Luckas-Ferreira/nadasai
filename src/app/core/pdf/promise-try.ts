/**
 * `Promise.try` para o pdf.js. Importar este módulo instala o polyfill.
 *
 * ## Por que é necessário
 *
 * O Angular carrega zone.js, que **substitui o `Promise` global** por
 * `ZoneAwarePromise` — uma reimplementação que não traz `Promise.try`. Então,
 * mesmo num Chrome que tem `Promise.try` nativo, dentro do app ele não existe.
 *
 * ## Por que os argumentos extras não são opcionais
 *
 * O `MessageHandler` do pdf.js despacha toda ação com estado assim:
 *
 *     Promise.try(action, data.data, streamSink)
 *
 * Um polyfill com a assinatura `(fn) => new Promise(r => r(fn()))` chama
 * `action()` sem nada. O handler então desestrutura `undefined` e estoura
 * `"undefined is not iterable (cannot read property Symbol(Symbol.iterator))"`,
 * que o pdf.js embrulha em `UnknownErrorException` e devolve pela ponte do
 * worker — longe do ponto onde a informação se perdeu.
 *
 * O sintoma disso no editor de PDF era `getOperatorList - ignoring XObject`, um
 * por imagem: as imagens da página falhavam, e como o pdf.js registra cada
 * imagem como uma *dependência* do operator list e essa dependência nunca era
 * resolvida, a promise de `page.render()` **ficava pendente para sempre**. O
 * canvas ficava pintado pela metade (o pdf.js pinta em blocos, conforme os
 * operadores chegam), mas nada no app marcava a página como renderizada e
 * nenhum erro era lançado — então o overlay de texto continuava no modo
 * "canvas falhou", desenhando texto preto por cima do texto do canvas.
 *
 * ## Por que um módulo só
 *
 * Havia duas cópias — uma em `main.ts` e outra em `pdfjs.ts` — ambas com a
 * assinatura errada. Consertar a segunda não mudou nada: a de `main.ts` roda no
 * bootstrap, e o guard `typeof !== 'function'` da outra passava a encontrar a
 * versão quebrada já instalada. Uma implementação, importada nos dois lugares.
 */
if (typeof (Promise as { try?: unknown }).try !== 'function') {
  (Promise as unknown as Record<string, unknown>)['try'] = function <T>(
    fn: (...args: unknown[]) => T | PromiseLike<T>,
    ...args: unknown[]
  ): Promise<T> {
    return new Promise<T>((resolve) => resolve(fn(...args)));
  };
}
