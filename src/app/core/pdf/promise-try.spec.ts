import './promise-try';

/**
 * O contrato que importa não é "Promise.try existe" — é que ele **encaminha os
 * argumentos extras**. Um polyfill de aridade 1 satisfaz o `typeof` e passa
 * despercebido, mas faz o `MessageHandler` do pdf.js chamar cada ação sem
 * argumento nenhum. O sintoma fica a três saltos de distância: as imagens da
 * página falham, a dependência delas nunca resolve, e `page.render()` fica
 * pendente para sempre — canvas pela metade, sem erro nenhum no console.
 */
describe('Promise.try', () => {
  const P = Promise as unknown as {
    try: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>;
  };

  it('existe (o zone.js remove o Promise.try nativo ao trocar o Promise global)', () => {
    expect(typeof P.try).toBe('function');
  });

  it('encaminha os argumentos extras para a função', async () => {
    await expectAsync(P.try((a, b) => `${a}-${b}`, 'x', 'y')).toBeResolvedTo('x-y');
  });

  it('encaminha a aridade exata que o pdf.js usa (action, data, streamSink)', async () => {
    await expectAsync(P.try((...args) => args.length, 1, 2)).toBeResolvedTo(2);
  });

  it('rejeita quando a função lança, em vez de propagar de forma síncrona', async () => {
    await expectAsync(
      P.try(() => {
        throw new Error('boom');
      }),
    ).toBeRejectedWithError('boom');
  });
});
