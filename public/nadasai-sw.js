/**
 * O service worker do produto: o do Angular MAIS o alvo de compartilhamento.
 *
 * POR QUE ESTE ARQUIVO EXISTE. Um Web Share Target que recebe ARQUIVO só existe
 * por POST multipart, e um POST não tem página para cair: quem tem que atendê-lo
 * é o service worker. O ngsw do Angular é gerado no build e não se estende, então
 * a forma suportada de somar um comportamento é importá-lo aqui dentro.
 *
 * A ORDEM DOS LISTENERS É O DETALHE QUE IMPORTA. O `addEventListener` abaixo vem
 * ANTES do `importScripts`, de propósito: os dois listeners recebem todo fetch, e
 * quem chama `respondWith` primeiro vence. Registrando depois do ngsw, um dia em
 * que ele resolvesse responder a POST o compartilhamento passaria a cair no
 * cache do app — silenciosamente, e só no Android.
 *
 * Para todo o resto este arquivo não faz nada: o `return` sem `respondWith`
 * devolve o evento ao ngsw, que continua sendo quem serve o app offline.
 */

const SHARE_CACHE = 'nadasai-share';
const SHARE_KEY = '/__shared-file';

/**
 * Os dois caminhos do manifesto, um por língua. Escritos à mão porque um service
 * worker não importa o `TOOLS` — e são duas linhas que mudam junto com o
 * `share_target` do `manifest.webmanifest`, que também é escrito à mão.
 */
const SHARE_TARGETS = ['/pt/abrir', '/en/open'];

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'POST') return;

  const url = new URL(request.url);
  if (!SHARE_TARGETS.includes(url.pathname)) return;

  event.respondWith(
    (async () => {
      try {
        const form = await request.formData();
        const file = form.get('file');

        if (file && typeof file !== 'string') {
          const cache = await caches.open(SHARE_CACHE);
          // O nome vai codificado porque header HTTP é ASCII, e um arquivo
          // compartilhado do Android quase sempre tem acento ou espaço.
          await cache.put(
            SHARE_KEY,
            new Response(file, {
              headers: {
                'X-Shared-Name': encodeURIComponent(file.name || 'arquivo'),
                'X-Shared-Type': file.type || '',
              },
            }),
          );
        }
      } catch {
        // Um POST malformado não pode deixar o usuário numa tela de erro do
        // navegador: ele cai na página de abrir, que sabe pedir um arquivo.
      }

      // 303 e não 302: o redirecionamento de um POST tem que virar GET.
      return Response.redirect(url.pathname, 303);
    })(),
  );
});

importScripts('/ngsw-worker.js');
