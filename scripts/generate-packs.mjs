/**
 * Escreve o INVENTÁRIO dos pacotes de runtime: dist/nadasai/browser/packs.json.
 *
 * Um mapa plano `url → bytes` de tudo o que vive em /model/, /ort/, /tesseract/,
 * /tessdata/ e /pdfjs/ — os cinco diretórios que a página de configuração deixa
 * baixar e apagar.
 *
 * POR QUE É GERADO, e não uma lista escrita à mão em TypeScript. São duas coisas:
 *
 *   1. DERIVA. O `angular.json` copia `**\/*` de `node_modules/pdfjs-dist/cmaps`,
 *      `/wasm`, `/iccs` e `/standard_fonts` — 200 arquivos que mudam sozinhos no
 *      próximo upgrade do pdfjs-dist. Uma lista manual desincroniza em silêncio, e
 *      o sintoma seria um pacote que se diz instalado sem estar. É a mesma lição
 *      que fez o `route-map.ts` derivar de `TOOLS` em vez de repetir 28 entradas.
 *   2. TAMANHO ANTES DO DOWNLOAD. Saber que são 42,4 MB *antes* de clicar é a
 *      diferença entre uma decisão e uma surpresa. Medir lendo o cache só responde
 *      depois de baixado, e estimar seria inventar precisão — a mesma regra do
 *      medidor de rede, que é leitura e nunca texto.
 *
 * LÊ O `dist/`, e não o `public/` + `node_modules/`, porque só o dist é o conjunto
 * que foi de fato publicado: ler as origens seria repetir os globs do angular.json
 * aqui dentro e criar uma segunda chance de as duas listas discordarem.
 *
 * ORDEM NO POSTBUILD: antes do `generate-ngsw.mjs`. Ele monta o manifesto do
 * service worker a partir do diretório pronto, e o `packs.json` precisa estar lá
 * para entrar no grupo `app` — sem isso o inventário não existe offline, que é
 * justamente quando saber o que está em disco importa mais.
 */
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join('dist', 'nadasai', 'browser');

/** Os cinco prefixos. Precisa bater com PACK_PREFIXES no public/nadasai-sw.js. */
const DIRS = ['model', 'ort', 'tesseract', 'tessdata', 'pdfjs'];

if (!existsSync(DIST)) {
  // Nada a fazer: `ng build` não chegou a produzir saída.
  process.exit(0);
}

/** Caminhos de URL (sempre com `/`), não caminhos de disco. */
function walk(dir, prefix, out) {
  for (const entry of readdirSync(join(DIST, dir), { withFileTypes: true })) {
    const child = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(child, prefix, out);
    else out[`/${child}`] = statSync(join(DIST, child)).size;
  }
}

const files = {};
for (const dir of DIRS) {
  if (!existsSync(join(DIST, dir))) {
    // Um diretório ausente é um deploy pela metade: o pacote apareceria na tela
    // com zero arquivos e um botão de baixar que não baixaria nada.
    console.error(`[generate-packs] ${dir}/ não existe no dist. O build está incompleto.`);
    process.exit(1);
  }
  walk(dir, dir, files);
}

// Ordenado para o arquivo ser estável entre builds: um diff de packs.json deve
// significar que um asset mudou, não que o readdir devolveu outra ordem.
const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
const total = Object.values(sorted).reduce((sum, n) => sum + n, 0);

writeFileSync(join(DIST, 'packs.json'), JSON.stringify({ files: sorted }, null, 2));
console.log(
  `[generate-packs] ${Object.keys(sorted).length} arquivos, ${(total / 1048576).toFixed(1)} MB → packs.json`,
);
