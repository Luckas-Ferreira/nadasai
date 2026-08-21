import { takeSharedFile } from './share-target';

const SHARE_CACHE = 'nadasai-share';
const SHARE_KEY = '/__shared-file';

/**
 * A metade cliente do Web Share Target. O service worker atende o POST da folha
 * de compartilhamento do Android, guarda o arquivo no Cache Storage e
 * redireciona; esta função o retira de lá.
 *
 * O teste que mais importa é o do APAGAMENTO. Num produto cujo argumento é que
 * nada fica guardado, ressuscitar o último arquivo compartilhado semanas depois
 * seria a pior forma de vazamento possível — local, mas real. O `cache.delete`
 * é uma linha, e uma linha que some sem quebrar nada visível é exatamente o tipo
 * de coisa que precisa de teste.
 */
describe('takeSharedFile', () => {
  beforeEach(async () => {
    await caches.delete(SHARE_CACHE);
  });

  afterAll(async () => {
    await caches.delete(SHARE_CACHE);
  });

  async function stash(bytes: Uint8Array, name: string, type: string): Promise<void> {
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      SHARE_KEY,
      new Response(bytes, {
        headers: {
          'X-Shared-Name': encodeURIComponent(name),
          'X-Shared-Type': type,
        },
      }),
    );
  }

  it('returns null when nothing was shared', async () => {
    expect(await takeSharedFile()).toBeNull();
  });

  it('hands back the file with its name and type intact', async () => {
    await stash(new Uint8Array([1, 2, 3, 4]), 'foto de férias.png', 'image/png');

    const file = await takeSharedFile();

    expect(file).not.toBeNull();
    expect(file!.name).toBe('foto de férias.png');
    expect(file!.type).toBe('image/png');
    expect(file!.size).toBe(4);
  });

  /** O ponto todo: a leitura consome. Ler de novo não pode devolver nada. */
  it('deletes the entry as it reads, so a second visit gets nothing', async () => {
    await stash(new Uint8Array([9]), 'doc.pdf', 'application/pdf');

    expect(await takeSharedFile()).not.toBeNull();
    expect(await takeSharedFile()).toBeNull();

    const cache = await caches.open(SHARE_CACHE);
    expect(await cache.match(SHARE_KEY)).toBeUndefined();
  });

  /**
   * Sem cabeçalho de nome o arquivo ainda tem de chegar: o dropzone da página de
   * abrir aceita qualquer arquivo, e recusar por falta de metadado seria perder
   * o arquivo por causa do rótulo dele.
   */
  it('falls back to a generic name when the header is missing', async () => {
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(SHARE_KEY, new Response(new Uint8Array([1])));

    const file = await takeSharedFile();

    expect(file).not.toBeNull();
    expect(file!.name).toBe('arquivo');
    expect(file!.type).toBe('');
  });

  /**
   * Cache indisponível — aba privada em alguns navegadores — não é erro que o
   * usuário possa resolver. A página cai no dropzone, que é a mesma tela.
   */
  it('answers null instead of throwing when the cache is unavailable', async () => {
    const open = caches.open;
    caches.open = () => Promise.reject(new Error('sem cache'));

    try {
      await expectAsync(takeSharedFile()).toBeResolvedTo(null);
    } finally {
      caches.open = open;
    }
  });
});
