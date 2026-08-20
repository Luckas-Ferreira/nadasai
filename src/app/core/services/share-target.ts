/**
 * A metade cliente do Web Share Target.
 *
 * O service worker (`public/nadasai-sw.js`) intercepta o POST da folha de
 * compartilhamento do Android, guarda o arquivo no Cache Storage e redireciona
 * para a página de abrir. Esta função é o que essa página chama para retirá-lo
 * de lá.
 *
 * CACHE STORAGE, E NÃO IndexedDB NEM postMessage. O Cache guarda `Response`, que
 * já é exatamente o que um `File` vira — sem serializar, sem copiar para memória
 * duas vezes (importa: o arquivo compartilhado pode ter centenas de MB). E
 * sobrevive ao redirecionamento, que é onde um `postMessage` se perderia: quem
 * recebe a mensagem é a página que fez o POST, e ela deixa de existir.
 *
 * A leitura APAGA a entrada. Sem isso, abrir a página de novo semanas depois
 * ressuscitaria o último arquivo compartilhado — que num produto cujo argumento é
 * que nada fica guardado seria a pior forma possível de vazamento: local, mas
 * real.
 */

const SHARE_CACHE = 'nadasai-share';
const SHARE_KEY = '/__shared-file';

export async function takeSharedFile(): Promise<File | null> {
  if (typeof caches === 'undefined') return null;

  try {
    const cache = await caches.open(SHARE_CACHE);
    const hit = await cache.match(SHARE_KEY);
    if (!hit) return null;

    await cache.delete(SHARE_KEY);

    const name = decodeURIComponent(hit.headers.get('X-Shared-Name') ?? 'arquivo');
    const type = hit.headers.get('X-Shared-Type') ?? '';

    return new File([await hit.blob()], name, { type });
  } catch {
    // Cache indisponível (aba privada em alguns navegadores) não é erro que o
    // usuário possa resolver: a página cai no dropzone, que é a mesma tela.
    return null;
  }
}
