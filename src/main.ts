// Instala Promise.try, que o zone.js remove ao trocar o Promise global e o
// pdf.js precisa em toda troca de mensagem com o worker. Precisa vir antes do
// bootstrap; ver o arquivo para o que quebra sem ele.
import './app/core/pdf/promise-try';

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
