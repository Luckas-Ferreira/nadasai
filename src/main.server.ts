// Mesmo polyfill do main.ts, e pela mesma razão de sempre: manter os dois
// pontos de entrada idênticos é como se evita descobrir tarde que um deles não
// passa pelo mesmo caminho. Aqui ele importa menos — nada rasteriza PDF durante
// a geração estática — e desde a saída do zone.js ele é no-op em Node moderno,
// que já traz Promise.try.
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
