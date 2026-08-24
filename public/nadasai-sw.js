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

/**
 * OS PACOTES DE RUNTIME: pesos, wasm e dados de idioma, num cache NOSSO.
 *
 * Estes cinco diretórios já foram do ngsw (grupos lazy `ai` e `pdf`). Saíram de
 * lá por uma razão só: DESINSTALAR. O nome e o formato do cache do ngsw são
 * detalhe interno do Angular — apagar entrada por entrada de lá funciona hoje e
 * quebra em silêncio num upgrade, que é o pior modo de falha possível num botão
 * cuja única promessa é liberar espaço. Com o cache sendo nosso, a página de
 * configuração instala, mede e apaga com `caches.open('nadasai-packs-v1')` e
 * nada mais.
 *
 * Isto é um cache-first simples, e o ngsw continua servindo TODO o resto: o
 * `return` sem `respondWith` devolve o evento a ele, exatamente como o listener
 * do Share Target acima.
 *
 * Na primeira publicação depois desta mudança, o ngsw descarta os caches dos
 * grupos que sumiram do manifesto dele. Quem já tinha os pesos baixa uma vez
 * mais, agora para cá. É uma migração de uma visita.
 */
const PACK_CACHE = 'nadasai-packs-v1';

/** Precisa bater com DIRS em scripts/generate-packs.mjs e com core/packs/packs.ts. */
const PACK_PREFIXES = ['/model/', '/ort/', '/tesseract/', '/tessdata/', '/pdfjs/'];

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Só GET: um POST aqui seria o Share Target, e ele já foi atendido acima.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!PACK_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(PACK_CACHE);

      // `ignoreVary` porque a CHAVE foi escrita pela página, e não por este
      // fetch: a tela de configuração guarda com `cache.put(url, ...)`, cuja
      // Request nasce sem headers. Se o host mandar `Vary: Accept-Encoding` — o
      // Cloudflare Pages manda —, esse cabeçalho viaja na resposta guardada e um
      // match padrão passaria a comparar algo que só um dos lados tem. Falharia
      // exatamente onde não dá para testar: passa no servidor de preview local,
      // e o pacote instalado deixa de ser servido em produção.
      const hit = await cache.match(request, { ignoreVary: true });
      if (hit) return hit;

      const response = await fetch(request);

      // A tela de configuração busca com este cabeçalho quando ela mesma está
      // instalando: ela lê o corpo para ter barra de progresso e faz o `put`
      // dela, com os headers da resposta original. Sem esta saída os mesmos
      // 55 MB seriam escritos duas vezes no mesmo cache — e o `put` dela é o que
      // deixa um QuotaExceededError chegar à tela em vez de sumir aqui dentro.
      if (request.headers.get('X-Nadasai-Install')) return response;

      // `cache.put` LANÇA em 206 (requisição com Range) e em resposta opaca — e
      // um throw aqui dentro vira "falha de rede" para quem pediu, sem dizer por
      // quê. Guardar só o 200 comum deixa o resto passar direto.
      if (response.status === 200 && response.type === 'basic') {
        await cache.put(request, response.clone());
      }

      return response;
    })(),
  );
});

importScripts('/ngsw-worker.js');
