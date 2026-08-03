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
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('dist/imgwork/browser');
const PORT = Number(process.argv[2] ?? 4300);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);

  // normalize() collapses ../ before it can escape the build directory.
  const candidate = join(ROOT, normalize(path));
  const inRoot = candidate.startsWith(ROOT);

  const isFile = (p) => existsSync(p) && statSync(p).isFile();

  /**
   * Índice de diretório ANTES do fallback, que é o que um host estático faz.
   *
   * Sem este passo o servidor devolvia o shell para toda rota profunda, porque
   * `pt/pdf/juntar` não é um arquivo — e isso escondia por completo o
   * prerender: as 73 páginas geradas existiam em disco e nenhuma delas era
   * servida. O simulador precisa resolver como Cloudflare Pages, nginx
   * (`try_files`) e Netlify resolvem, ou a suíte mede um site que não existe.
   *
   * O fallback continua no fim, e continua sendo necessário: é ele que atende
   * as URLs legadas que `app.routes.ts` redireciona no cliente.
   */
  const file = !inRoot
    ? join(ROOT, 'index.html')
    : isFile(candidate)
      ? candidate
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
    // Cross-origin isolation, so onnxruntime can use SharedArrayBuffer and spread
    // inference across CPU cores. A real production host must send these too, or
    // background removal falls back to a single (much slower) thread. Safe here
    // because the app loads only same-origin assets — the privacy thesis pays off.
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  });

  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`preview: http://localhost:${PORT}`));
