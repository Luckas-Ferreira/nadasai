// Mesmo polyfill do main.ts, e pela mesma razão: o zone.js troca o Promise
// global por um que não carrega Promise.try. Aqui ele importa menos (nada
// rasteriza PDF durante a geração estática), mas o bootstrap é o mesmo app, e
// deixar os dois pontos de entrada diferentes é como se descobre tarde que um
// deles não passa pelo mesmo caminho.
import './app/core/pdf/promise-try';

import { type BootstrapContext, bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

/**
 * O `context` NÃO é opcional aqui, apesar de a assinatura dizer que é.
 *
 * Na geração estática o Angular cria uma plataforma por rota e a entrega por
 * este parâmetro. Esquecê-lo faz o bootstrap procurar uma plataforma global que
 * não existe, e o build morre com um `NG0401` — cujo texto é apenas "No
 * platform exists!", emitido de dentro do extrator de rotas, sem dizer qual
 * rota nem qual arquivo. Foi assim que este arquivo quebrou na primeira versão.
 */
const bootstrap = (context: BootstrapContext): ReturnType<typeof bootstrapApplication> =>
  bootstrapApplication(AppComponent, config, context);

export default bootstrap;
