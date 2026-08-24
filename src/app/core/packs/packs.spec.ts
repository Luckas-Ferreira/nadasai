import { PACKS, PACK_CACHE, packById, packForPath } from './packs';

describe('pack registry', () => {
  it('has unique ids', () => {
    const ids = PACKS.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('writes every prefix with a leading and a trailing slash', () => {
    // `/model` sem barra final casaria `/models/…` de um vizinho que ainda não
    // existe; sem a inicial não casa nada, porque os caminhos do inventário são
    // absolutos.
    for (const pack of PACKS) {
      for (const prefix of pack.prefixes) {
        expect(prefix.startsWith('/')).withContext(`${pack.id}: ${prefix}`).toBe(true);
        expect(prefix.endsWith('/')).withContext(`${pack.id}: ${prefix}`).toBe(true);
      }
    }
  });

  it('gives every prefix to exactly one pack', () => {
    // Dois pacotes sobre o mesmo prefixo significam que desinstalar um apaga os
    // arquivos do outro, que continuaria se dizendo instalado.
    const all = PACKS.flatMap((pack) => pack.prefixes);
    expect(new Set(all).size).toBe(all.length);

    for (const a of all) {
      for (const b of all) {
        if (a === b) continue;
        expect(a.startsWith(b)).withContext(`${a} está dentro de ${b}`).toBe(false);
      }
    }
  });

  it('resolves a path to its owner, and only a real one', () => {
    expect(packForPath('/model/isnet-q8.onnx.part0')?.id).toBe('remove-bg');
    expect(packForPath('/tessdata/por.traineddata.gz')?.id).toBe('ocr');
    expect(packForPath('/pdfjs/cmaps/Adobe-Japan1-0.bcmap')?.id).toBe('pdf-engine');
    expect(packForPath('/main-ABC123.js')).toBeNull();
    expect(packForPath('/index.html')).toBeNull();
  });

  it('throws on an unknown id rather than returning undefined', () => {
    expect(() => packById('nope' as never)).toThrow();
  });

  /**
   * O acordo que não tem compilador: o service worker é JavaScript solto em
   * `public/`, então os prefixos vivem escritos duas vezes. Um prefixo declarado
   * só aqui produz um pacote que a tela mostra, que baixa, e que o worker nunca
   * serve de volta — o pacote fica "instalado" e a ferramenta falha offline.
   *
   * O Karma serve `public/` como assets, então o arquivo pode ser buscado. É a
   * mesma técnica do `sitemap.spec.ts`.
   */
  describe('acordo com o public/nadasai-sw.js', () => {
    let source: string;

    beforeAll(async () => {
      source = await (await fetch('/nadasai-sw.js')).text();
    });

    it('serves exactly the prefixes the registry declares', () => {
      const match = source.match(/const PACK_PREFIXES = \[([^\]]*)\]/);
      expect(match).withContext('PACK_PREFIXES não encontrado no service worker').toBeTruthy();

      const inWorker = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      const declared = PACKS.flatMap((pack) => pack.prefixes);

      expect(inWorker.sort()).toEqual([...declared].sort());
    });

    it('agrees on the cache name', () => {
      expect(source).toContain(`const PACK_CACHE = '${PACK_CACHE}'`);
    });
  });
});
