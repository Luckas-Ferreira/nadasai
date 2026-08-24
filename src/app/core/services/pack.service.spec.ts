import { TestBed } from '@angular/core/testing';
import { PackService } from './pack.service';
import { PACK_CACHE } from '../packs/packs';
import type { PackInventory } from '../packs/pack-files';

/**
 * Este serviço é o único lugar do produto que APAGA algo do disco de alguém, e o
 * modo de falha que importa não é a exceção — é a tela afirmar um estado que o
 * disco não tem. Instalado sem estar manda a pessoa confiar num offline que não
 * existe; removido sem estar deixa 55 MB ocupados depois de ela mandar liberar.
 *
 * Por isso os testes são todos sobre o que sobra no CACHE depois da operação, e
 * não sobre o serviço ter chamado o que se esperava que chamasse.
 *
 * O `caches` global é substituído por uma implementação de mentira com o pedaço
 * da API que este serviço usa. A de verdade existe no Chrome do Karma, mas ela é
 * compartilhada entre os specs e persiste entre execuções: um teste que apaga um
 * cache real levaria junto o que outro tivesse acabado de escrever.
 */

const INVENTORY: PackInventory = {
  files: {
    '/model/isnet-q8.manifest.json': 100,
    '/model/isnet-q8.onnx.part0': 2_000,
    '/ort/ort-wasm-simd-threaded.wasm': 3_000,
    '/tessdata/por.traineddata.gz': 400,
    '/tessdata/eng.traineddata.gz': 600,
    '/tesseract/worker.min.js': 900,
    '/tesseract/tesseract-core-lstm.wasm.js': 1_000,
    '/tesseract/tesseract-core-simd-lstm.wasm.js': 1_100,
    '/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js': 1_200,
    '/pdfjs/pdf.worker.min.mjs': 700,
  },
};

/** O mínimo de `Cache` que o serviço toca, guardando os pares numa Map. */
class FakeCache {
  readonly entries = new Map<string, Response>();

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((url) => new Request(url));
  }

  async put(url: string, response: Response): Promise<void> {
    this.entries.set(new URL(url, location.origin).href, response);
  }

  async delete(request: Request): Promise<boolean> {
    return this.entries.delete(request.url);
  }

  /** Só para os testes: os caminhos guardados, sem a origem. */
  paths(): string[] {
    return [...this.entries.keys()].map((url) => new URL(url).pathname).sort();
  }

  seed(paths: readonly string[]): void {
    for (const path of paths) {
      this.entries.set(new URL(path, location.origin).href, new Response(new Uint8Array(1)));
    }
  }
}

describe('PackService', () => {
  let service: PackService;
  let cache: FakeCache;
  let realCaches: CacheStorage;
  let fetched: string[];

  /** Uma resposta com corpo legível, para o caminho de progresso do install. */
  function bodyFor(path: string): Response {
    const size = INVENTORY.files[path] ?? 1;
    return new Response(new Uint8Array(size), { headers: { 'Content-Type': 'application/octet-stream' } });
  }

  function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
    spyOn(window, 'fetch').and.callFake(((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetched.push(new URL(url, location.origin).pathname);
      return Promise.resolve(handler(url, init));
    }) as typeof fetch);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PackService);

    cache = new FakeCache();
    fetched = [];

    realCaches = window.caches;
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { open: async (name: string) => (name === PACK_CACHE ? cache : new FakeCache()) },
    });

    service.setInventoryForTest(INVENTORY);
    localStorage.removeItem('nadasai.packs.auto');
    localStorage.removeItem('nadasai.packs.removed');
  });

  afterEach(() => {
    Object.defineProperty(window, 'caches', { configurable: true, value: realCaches });
    localStorage.removeItem('nadasai.packs.auto');
    localStorage.removeItem('nadasai.packs.removed');
  });

  describe('refresh', () => {
    it('reads what is in the cache and reports it as installed', async () => {
      cache.seed(['/pdfjs/pdf.worker.min.mjs']);
      stubFetch(() => new Response('{}', { status: 404 }));

      await service.refresh();

      const pdf = service.rows().find((row) => row.pack.id === 'pdf-engine')!;
      expect(pdf.state).toBe('installed');
      expect(pdf.bytesOnDisk).toBe(700);
    });

    it('reports absent for a pack with nothing cached', async () => {
      stubFetch(() => new Response('{}', { status: 404 }));
      await service.refresh();

      expect(service.rows().find((row) => row.pack.id === 'remove-bg')!.state).toBe('absent');
      expect(service.totalOnDisk()).toBe(0);
    });

    it('never throws when the cache API refuses', async () => {
      // Firefox em navegação privada: `caches.open` rejeita. A resposta certa é
      // "nada instalado", nunca uma exceção que sobe até o ErrorHandler global.
      Object.defineProperty(window, 'caches', {
        configurable: true,
        value: { open: () => Promise.reject(new Error('denied')) },
      });
      stubFetch(() => new Response('{}', { status: 404 }));

      await expectAsync(service.refresh()).toBeResolved();
      expect(service.totalOnDisk()).toBe(0);
      expect(service.ready()).toBe(true);
    });
  });

  describe('install', () => {
    it('puts every file of the pack into the cache', async () => {
      stubFetch((url) => bodyFor(new URL(url, location.origin).pathname));
      await service.refresh();

      await service.install('remove-bg');

      expect(cache.paths()).toEqual([
        '/model/isnet-q8.manifest.json',
        '/model/isnet-q8.onnx.part0',
        '/ort/ort-wasm-simd-threaded.wasm',
      ]);
      expect(service.rows().find((row) => row.pack.id === 'remove-bg')!.state).toBe('installed');
    });

    it('fetches only what is MISSING', async () => {
      // Um pacote pela metade continua de onde parou. Rebaixar o que já está lá
      // custaria a rede inteira de novo e mediria uma barra desde o zero.
      cache.seed(['/model/isnet-q8.manifest.json']);
      stubFetch((url) => bodyFor(new URL(url, location.origin).pathname));
      await service.refresh();
      fetched.length = 0;

      await service.install('remove-bg');

      expect(fetched).not.toContain('/model/isnet-q8.manifest.json');
      expect(fetched).toContain('/model/isnet-q8.onnx.part0');
    });

    it('installs ONE tesseract core, not the three', async () => {
      stubFetch((url) => bodyFor(new URL(url, location.origin).pathname));
      await service.refresh();

      await service.install('ocr');

      const cores = cache.paths().filter((path) => path.includes('tesseract-core'));
      expect(cores.length).toBe(1);
    });

    it('marks the header the service worker looks for', async () => {
      // Sem `X-Nadasai-Install` o worker guarda a própria cópia, e os mesmos
      // 55 MB são escritos duas vezes no mesmo cache.
      let seen: HeadersInit | undefined;
      stubFetch((url, init) => {
        seen = init?.headers;
        return bodyFor(new URL(url, location.origin).pathname);
      });
      await service.refresh();

      await service.install('pdf-engine');

      expect(new Headers(seen).get('X-Nadasai-Install')).toBe('1');
    });

    it('leaves the pack PARTIAL and flags the failure when a file does not arrive', async () => {
      // O que já chegou fica. Um pacote incompleto que se diz pronto é a mentira
      // que esta tela existe para não contar.
      stubFetch((url) => {
        const path = new URL(url, location.origin).pathname;
        return path.endsWith('part0') ? new Response('', { status: 500 }) : bodyFor(path);
      });
      await service.refresh();

      await service.install('remove-bg');

      const row = service.rows().find((r) => r.pack.id === 'remove-bg')!;
      expect(row.state).toBe('partial');
      expect(row.failed).toBe(true);
      expect(cache.paths()).toContain('/model/isnet-q8.manifest.json');
    });

    it('measures what landed, not what was promised', async () => {
      stubFetch((url) => bodyFor(new URL(url, location.origin).pathname));
      await service.refresh();

      await service.install('ocr');

      const row = service.rows().find((r) => r.pack.id === 'ocr')!;
      expect(row.bytesOnDisk).toBe(row.bytesTotal);
    });
  });

  describe('remove', () => {
    it('deletes every file under the prefixes and leaves the other packs alone', async () => {
      cache.seed([
        '/model/isnet-q8.manifest.json',
        '/ort/ort-wasm-simd-threaded.wasm',
        '/pdfjs/pdf.worker.min.mjs',
      ]);
      stubFetch(() => new Response('{}', { status: 404 }));
      await service.refresh();

      await service.remove('remove-bg');

      expect(cache.paths()).toEqual(['/pdfjs/pdf.worker.min.mjs']);
      expect(service.rows().find((r) => r.pack.id === 'remove-bg')!.state).toBe('absent');
      expect(service.rows().find((r) => r.pack.id === 'pdf-engine')!.state).toBe('installed');
    });

    it('also deletes what the inventory does not know about', async () => {
      // Uma sobra de um deploy anterior, ou a variante do core que este navegador
      // não usa, ocupam espaço igual. Deixá-las faria o "removido" da tela
      // discordar do que o disco mostra.
      cache.seed(['/tessdata/deu.traineddata.gz', '/tesseract/worker.min.js']);
      stubFetch(() => new Response('{}', { status: 404 }));
      await service.refresh();

      await service.remove('ocr');

      expect(cache.paths()).toEqual([]);
    });

    it('records that the removal was BY HAND, so nothing brings it back', async () => {
      // Sem esta marca o prefetch ocioso rebaixaria os 42 MB na próxima visita e
      // o botão de remover pareceria quebrado.
      cache.seed(['/model/isnet-q8.manifest.json']);
      stubFetch(() => new Response('{}', { status: 404 }));
      await service.refresh();

      expect(service.wasRemovedByHand('remove-bg')).toBe(false);
      await service.remove('remove-bg');
      expect(service.wasRemovedByHand('remove-bg')).toBe(true);
    });

    it('clears that mark when the pack is installed again on purpose', async () => {
      stubFetch((url) => bodyFor(new URL(url, location.origin).pathname));
      await service.refresh();
      await service.remove('remove-bg');

      await service.install('remove-bg');

      expect(service.wasRemovedByHand('remove-bg')).toBe(false);
    });

    it('empties the whole cache with removeAll', async () => {
      cache.seed([
        '/model/isnet-q8.manifest.json',
        '/tessdata/por.traineddata.gz',
        '/pdfjs/pdf.worker.min.mjs',
      ]);
      stubFetch(() => new Response('{}', { status: 404 }));
      await service.refresh();

      await service.removeAll();

      expect(cache.paths()).toEqual([]);
      expect(service.totalOnDisk()).toBe(0);
    });
  });

  describe('automatic download', () => {
    it('is on unless it was turned off', () => {
      expect(service.autoDownloadEnabled()).toBe(true);

      service.setAutoDownload(false);
      expect(service.autoDownloadEnabled()).toBe(false);

      service.setAutoDownload(true);
      expect(service.autoDownloadEnabled()).toBe(true);
    });
  });

  describe('supported', () => {
    it('is false without a controlling service worker', async () => {
      // Sem ele os bytes entram no cache e ninguém os lê: quem busca o tessdata é
      // o worker do Tesseract, e ele não passa por este código.
      stubFetch(() => new Response('{}', { status: 404 }));
      await service.refresh();

      expect(service.supported()).toBe(!!navigator.serviceWorker?.controller);
    });
  });
});
