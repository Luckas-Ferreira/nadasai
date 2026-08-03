import { type ApplicationConfig, ErrorHandler, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';

/**
 * Config usada SÓ na geração estática, em tempo de build. Não existe servidor:
 * o `ng build` roda o app no Node uma vez por rota, salva o HTML resultante e
 * descarta tudo. Em produção continuam saindo apenas arquivos, que é o que o
 * Cloudflare Pages serve e o que mantém verdadeira a frase "não há backend".
 *
 * Por isso não há `server.ts`, nem express, nem `ssr` no angular.json: ligar o
 * modo servidor exigiria Pages Functions e contradiria a arquitetura do
 * produto — o ganho pretendido aqui é só o HTML nascer pronto para o crawler.
 */
const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),

    /**
     * O CLI reporta apenas "erro ao pré-renderizar a rota X" e descarta a
     * exceção — sem arquivo, sem linha, sem pilha. Com 72 rotas e 31
     * ferramentas isso é indepurável. Este handler existe para que a próxima
     * pessoa que quebrar a geração estática veja a causa no log do build, em
     * vez de bissectar componentes.
     */
    {
      provide: ErrorHandler,
      useValue: {
        handleError: (error: unknown) => {
          const err = error as { stack?: string; message?: string };
          console.error('[prerender]', err?.stack ?? err?.message ?? error);
        },
      },
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
