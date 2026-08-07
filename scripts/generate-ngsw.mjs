// Regera o ngsw.json DEPOIS que o prerender foi achatado e a raiz voltou a ter
// um index.html.
//
// O manifesto do service worker é montado pelo `ng build`, no meio do build —
// antes de qualquer script de postbuild. Com o prerender ligado, nesse instante
// o diretório de saída não tem nenhum dos arquivos que o `ngsw-config.json`
// descreve:
//
//   * a raiz não tem `index.html`. O Angular chama o shell de `index.csr.html`,
//     e é o `spa-fallback.mjs` que o copia de volta — depois;
//   * as páginas geradas ainda são `rota/index.html`, e só viram `rota.html`
//     no `flatten-prerender.mjs` — também depois.
//
// Então o glob `/index.html` do grupo `app` não casava com nada, e o manifesto
// saía com `"index": "/index.csr.html"` — um arquivo que assetGroup nenhum
// lista. O resultado media 340 recursos no hashTable e ZERO HTML. O worker
// instalava, prefetchava os 340 e mesmo assim toda navegação offline falhava:
// o ngsw atende uma navegação servindo o índice declarado no manifesto, o
// índice não estava em cache, e a requisição caía na rede que não existia.
//
// Ou seja: o offline não quebrou por causa do service worker. Quebrou porque o
// prerender mudou o formato da saída embaixo dele, sem erro em lugar nenhum —
// nem no build, nem na instalação do worker. Gerar o manifesto no fim do
// postbuild é o que faz ele descrever o build que foi de fato publicado.
//
// `angular.json` mantém `"serviceWorker": "ngsw-config.json"` de propósito: é
// dali que vêm o `ngsw-worker.js` e o `safety-worker.js` copiados para o dist.
// Só o manifesto é reescrito aqui.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join('dist', 'nadasai', 'browser');
const CLI = join('node_modules', '@angular', 'service-worker', 'ngsw-config.js');

if (!existsSync(DIST)) {
  // Nada a fazer: `ng build` não chegou a produzir saída.
  process.exit(0);
}

if (!existsSync(join(DIST, 'ngsw-worker.js'))) {
  // Build de desenvolvimento: `serviceWorker` só está ligado na configuração de
  // produção, e sem worker um manifesto é lixo que confunde quem for depurar.
  console.log('[generate-ngsw] build sem service worker; nada a regerar.');
  process.exit(0);
}

execFileSync(process.execPath, [CLI, DIST, 'ngsw-config.json', '/'], { stdio: 'inherit' });

const manifest = JSON.parse(readFileSync(join(DIST, 'ngsw.json'), 'utf8'));

// A verificação que faltava. Um manifesto cujo índice não está no hashTable
// atravessa o build inteiro sem um aviso, instala sem erro, e só falha no
// momento em que alguém puxa o cabo — que é a única coisa que este app promete.
if (!Object.hasOwn(manifest.hashTable, manifest.index)) {
  console.error(
    `[generate-ngsw] o índice ${manifest.index} não está no hashTable do manifesto. ` +
      `O service worker não teria HTML para servir offline.`,
  );
  process.exit(1);
}

const cached = Object.keys(manifest.hashTable).length;
console.log(`[generate-ngsw] ngsw.json regerado: index=${manifest.index}, ${cached} recursos.`);
