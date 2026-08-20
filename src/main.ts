// Instala Promise.try, que o pdf.js usa em toda troca de mensagem com o worker.
//
// Era obrigatório enquanto o zone.js trocava o Promise global por um
// ZoneAwarePromise que não o carregava. Sem zone.js o Promise volta a ser o
// nativo — e o polyfill continua aqui porque `Promise.try` é recente (Chrome
// 128, Safari 18.2, Firefox 134) e o guarda de `typeof` o torna no-op onde já
// existe. O que ele NÃO pode deixar de fazer é repassar `...args`; ver o
// arquivo para a falha, que é uma renderização que nunca termina e nunca
// reclama.
import './app/core/pdf/promise-try';

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
