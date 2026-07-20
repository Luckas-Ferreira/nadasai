/**
 * Baixa os modelos de idioma do Tesseract para public/tessdata/.
 *
 * Mesmo contrato do fetch-model.mjs: roda no postinstall e no prebuild, e é
 * no-op quando os arquivos já estão em disco, então `npm ci && npm run build`
 * numa máquina limpa produz um deploy completo. Não são commitados.
 *
 * POR QUE ISSO EXISTE: por padrão o tesseract.js busca worker, core wasm e
 * traineddata no jsdelivr em tempo de execução. Isso quebra de duas formas.
 *
 *   1. O `Cross-Origin-Embedder-Policy: require-corp` que a app precisa para o
 *      SharedArrayBuffer (remoção de fundo multithread) bloqueia recurso
 *      cross-origin sem CORP — o OCR simplesmente não carregaria.
 *   2. Contradiz o "Seus arquivos nunca saem do seu dispositivo" do rodapé. É o
 *      mesmo motivo pelo qual o @imgly/background-removal foi removido: ele
 *      buscava pesos numa CDN de terceiro em runtime.
 *
 * Servindo same-origin as duas coisas se resolvem, e o OCR passa a funcionar
 * offline depois do primeiro uso (grupo lazy no ngsw-config.json).
 *
 * VARIANTE: o OcrService usa OEM 1 (LSTM_ONLY), então o conjunto certo é o
 * `4.0.0_best_int` — int8, bem menor que o `4.0.0` completo, que só é
 * necessário para o modelo Legacy. por: 1,4 MB vs 6,8 MB. eng: 3,0 vs 10,9.
 *
 * GZIP: os arquivos ficam .gz em disco e são servidos assim. O tesseract.js
 * detecta gzip pelos magic bytes (1F 8B), então funciona tanto se o host servir
 * os bytes crus quanto se ele mandar Content-Encoding: gzip e o browser
 * descomprimir antes — nos dois casos o dado que chega é válido.
 *
 * Licença: tessdata_best é Apache-2.0 (github.com/tesseract-ocr/tessdata_best),
 * distribuído em @tesseract.js-data. Compatível com uso comercial.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const LANGS = ['por', 'eng'];
const VARIANT = '4.0.0_best_int'; // pareia com OEM.LSTM_ONLY no OcrService
const OUT_DIR = resolve('public/tessdata');

// Um download truncado é pior que nenhum: falha alto em vez de gerar um deploy
// que só quebra na cara do usuário.
const MIN_BYTES = 500_000;

const missing = LANGS.filter((lang) => {
  const p = join(OUT_DIR, `${lang}.traineddata.gz`);
  return !existsSync(p) || statSync(p).size < MIN_BYTES;
});

if (missing.length === 0) {
  const total = LANGS.reduce((sum, l) => sum + statSync(join(OUT_DIR, `${l}.traineddata.gz`)).size, 0);
  console.log(`tessdata: already present (${(total / 1048576).toFixed(1)} MB, ${LANGS.join(', ')})`);
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
console.log(`tessdata: downloading ${missing.join(', ')} (~4 MB, once)…`);

for (const lang of missing) {
  const url = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/${VARIANT}/${lang}.traineddata.gz`;
  const response = await fetch(url);

  if (!response.ok) {
    console.error(`tessdata: download failed for ${lang} — HTTP ${response.status}`);
    process.exit(1);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < MIN_BYTES) {
    console.error(`tessdata: download truncated for ${lang} (${bytes.byteLength} bytes)`);
    process.exit(1);
  }

  // Confere os magic bytes do gzip: uma página de erro HTML tem o mesmo HTTP 200.
  if (!(bytes[0] === 0x1f && bytes[1] === 0x8b)) {
    console.error(`tessdata: ${lang} is not a gzip file — got ${bytes[0]} ${bytes[1]}`);
    process.exit(1);
  }

  writeFileSync(join(OUT_DIR, `${lang}.traineddata.gz`), bytes);
  console.log(`tessdata: ${lang} ready (${(bytes.byteLength / 1048576).toFixed(1)} MB)`);
}

console.log(`tessdata: ready → public/tessdata/`);
