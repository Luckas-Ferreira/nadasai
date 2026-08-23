/**
 * Serves the production build.
 *
 * The offline suite cannot run against `ng serve`: the dev server does not emit
 * ngsw-worker.js, so there is no service worker, so the one thing those tests
 * exist to prove is absent. They need the real artifact, served the way a static
 * host would serve it.
 *
 * No dependency on purpose — a devDependency to serve six MIME types is not a
 * trade worth making.
 *
 *   node e2e/preview-server.mjs [port]
 */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('dist/nadasai/browser');
const PORT = Number(process.argv[2] ?? 4300);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

if (!existsSync(ROOT)) {
  console.error(`No build at ${ROOT}. Run: npm run build`);
  process.exit(1);
}

/**
 * RECUSA SERVIR UM ARTEFATO VELHO.
 *
 * Este servidor entrega um retrato congelado do `dist/`, e é o único lugar da
 * suíte onde o que está sendo testado pode não ser o que está no código. Já
 * aconteceu: um servidor órfão de uma execução anterior continuou de pé, a
 * execução seguinte o reaproveitou, e o `09-offline` reprovou por causa de um
 * arquivo que a versão nova já tinha. Três diagnósticos falsos saíram daí.
 *
 * A comparação é por data de modificação: qualquer arquivo em `src/` ou
 * `public/` mais novo que o `index.html` gerado significa build defasado. O
 * servidor então SAI dizendo o comando, em vez de servir bytes que ninguém
 * conferiu.
 */
function newestMtime(dir) {
  let newest = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Spec não entra no bundle: o tsconfig.app.json o exclui. Contar um deles
    // invalidaria o build a cada teste unitário escrito, e o servidor passaria
    // a recusar subir por uma mudança que não muda o artefato.
    if (entry.isFile() && entry.name.endsWith('.spec.ts')) continue;

    const full = join(dir, entry.name);
    const at = entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs;
    if (at > newest) newest = at;
  }

  return newest;
}

const builtAt = statSync(join(ROOT, 'index.html')).mtimeMs;
const sourceAt = Math.max(newestMtime(resolve('src')), newestMtime(resolve('public')));

if (sourceAt > builtAt) {
  console.error(
    `The build at ${ROOT} is older than src/ or public/. The offline, prerender` +
      ` and CSP specs would be checking the previous version. Run: npm run build`,
  );
  process.exit(1);
}

/**
 * Os headers globais saem do `public/_headers` DE VERDADE, e não de uma cópia.
 *
 * O arquivo que o Cloudflare Pages lê é o mesmo que este servidor aplica, então
 * a suíte testa a configuração de produção em vez de testar um servidor de teste
 * que por acaso concorda com ela. Foi escrito quando a CSP entrou: uma CSP
 * apertada demais quebra a ferramenta em silêncio, e uma CSP que só existe no
 * arquivo de deploy não é exercitada por teste nenhum.
 *
 * Só o bloco `/*` interessa aqui — as outras faixas são regras de cache por
 * caminho, que nada nesta suíte observa.
 */
function globalHeaders() {
  const file = resolve('public/_headers');
  if (!existsSync(file)) return {};

  const out = {};
  let inGlobal = false;

  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    // Uma linha sem indentação abre uma faixa nova; indentada, é um header dela.
    if (!/^\s/.test(line)) {
      inGlobal = line.trim() === '/*';
      continue;
    }

    if (!inGlobal) continue;
    const at = line.indexOf(':');
    if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }

  return out;
}

const GLOBAL_HEADERS = globalHeaders();

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);

  // normalize() collapses ../ before it can escape the build directory.
  const candidate = join(ROOT, normalize(path));
  const inRoot = candidate.startsWith(ROOT);

  const isFile = (p) => existsSync(p) && statSync(p).isFile();

  /**
   * Barra final -> forma sem barra, como as regras de `public/_redirects`.
   *
   * Precisa vir antes de qualquer resolução: as URLs com barra são as que o
   * Google resolveu enquanto o build ainda era `rota/index.html`, e o que a
   * suíte tem de provar é que elas chegam na canônica por um 308, e não no
   * shell vazio do fallback.
   */
  if (path.length > 1 && path.endsWith('/')) {
    const withoutSlash = path.replace(/\/+$/, '');
    res.writeHead(308, { Location: withoutSlash });
    res.end();
    return;
  }

  /**
   * `rota.html` ANTES de `rota/index.html`, que é a ordem do Cloudflare Pages.
   *
   * Sem o primeiro passo o servidor devolvia o shell para toda rota profunda,
   * porque `pt/pdf/juntar` não é um arquivo — e isso escondia por completo o
   * prerender: as 73 páginas geradas existiam em disco e nenhuma delas era
   * servida. O índice de diretório continua no meio porque `ng build` sozinho
   * (sem o postbuild que achata) ainda produz esse formato.
   *
   * O fallback continua no fim, e continua sendo necessário: é ele que atende
   * as URLs legadas que `app.routes.ts` redireciona no cliente.
   */
  const file = !inRoot
    ? join(ROOT, 'index.html')
    : isFile(candidate)
      ? candidate
      : isFile(`${candidate}.html`)
        ? `${candidate}.html`
        : isFile(join(candidate, 'index.html'))
          ? join(candidate, 'index.html')
          : join(ROOT, 'index.html'); // SPA fallback: deep links are client-routed.

  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    // The service worker must be free to update itself, and a cached ngsw.json
    // would pin the app to a stale build forever.
    'Cache-Control': 'no-cache',
    // Required for ngsw-worker.js to control the whole scope.
    'Service-Worker-Allowed': '/',
    // Cross-origin isolation (COOP/COEP), a CSP e o resto vêm do `_headers` de
    // produção. Ficavam escritos aqui à mão, e a cópia só concordava com o
    // original enquanto ninguém mexesse em nenhum dos dois.
    ...GLOBAL_HEADERS,
  });

  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`preview: http://localhost:${PORT}`));
