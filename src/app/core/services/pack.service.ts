import { Injectable, computed, signal } from '@angular/core';
import { PACKS, PACK_CACHE, packById, type PackDef, type PackId } from '../packs/packs';
import {
  bytesForPack,
  filesForPack,
  installedBytes,
  stateOf,
  type PackInventory,
  type PackState,
  type RuntimeFacts,
} from '../packs/pack-files';
import { relaxedSimdSupported, simdSupported } from '../packs/wasm-features';

/**
 * Instalar, medir e apagar os pacotes de runtime.
 *
 * `providedIn: 'root'` pelo mesmo argumento que o cabeçalho do
 * `ModelPrefetchService` já escreve: um download é global, idempotente e
 * sobrevive à navegação — o oposto do estado por execução, que continua morando
 * no componente. Sair da tela de configuração no meio de 42 MB não pode cancelar
 * o download, e é este escopo que garante isso.
 *
 * NADA É LIDO NO CONSTRUTOR. `caches`, `navigator` e `localStorage` não existem
 * no Node do prerender, e este serviço é alcançado a partir de uma tela ligada na
 * barra do topo, que está em toda rota. É a armadilha que já derrubou as 72 rotas
 * de uma vez.
 *
 * O QUE ELE NÃO FAZ: servir os bytes de volta. Quem faz isso é o handler
 * cache-first do `public/nadasai-sw.js`, e é por isso que `supported()` é falso
 * sem service worker no controle — sem ele os bytes até entram no cache, mas
 * ninguém os lê, porque quem busca o `tessdata` é o worker do Tesseract, o `ort`
 * é o onnxruntime e o `pdfjs` é o worker do pdf.js. Nenhum deles passa por este
 * código.
 */

/** Uma linha da tela. Tudo aqui é medido ou vem do inventário; nada é estimado. */
export interface PackRow {
  readonly pack: PackDef;
  readonly state: PackState | 'installing' | 'removing';
  /** Bytes que este pacote ocupa AGORA. */
  readonly bytesOnDisk: number;
  /** Bytes que ele ocupará instalado, NESTE navegador. */
  readonly bytesTotal: number;
  /** 0–100 enquanto instala. */
  readonly percent: number;
  readonly failed: boolean;
}

const AUTO_KEY = 'nadasai.packs.auto';
const REMOVED_KEY = 'nadasai.packs.removed';

type Busy = 'installing' | 'removing' | null;

@Injectable({ providedIn: 'root' })
export class PackService {
  private readonly inventory = signal<PackInventory>({ files: {} });
  private readonly cached = signal<ReadonlySet<string>>(new Set());
  private readonly busy = signal<Readonly<Partial<Record<PackId, Busy>>>>({});
  private readonly percent = signal<Readonly<Partial<Record<PackId, number>>>>({});
  private readonly failed = signal<ReadonlySet<PackId>>(new Set());

  /** Verdadeiro quando o service worker está no controle: sem ele nada é servido. */
  readonly supported = signal(false);
  /** O primeiro `refresh()` terminou. Antes disso a tela não afirma nada. */
  readonly ready = signal(false);

  private readonly aborts = new Map<PackId, AbortController>();
  private facts: RuntimeFacts | null = null;

  readonly rows = computed<readonly PackRow[]>(() => {
    const inventory = this.inventory();
    const cached = this.cached();
    const busy = this.busy();
    const percent = this.percent();
    const failed = this.failed();
    const facts = this.runtimeFacts();

    return PACKS.map((pack) => ({
      pack,
      state: busy[pack.id] ?? stateOf(pack, inventory, facts, cached),
      bytesOnDisk: installedBytes(pack, inventory, cached),
      bytesTotal: bytesForPack(pack, inventory, facts),
      percent: percent[pack.id] ?? 0,
      failed: failed.has(pack.id),
    }));
  });

  /** O que está em disco, somado. É a leitura que a tela mostra no rodapé. */
  readonly totalOnDisk = computed(() => this.rows().reduce((sum, row) => sum + row.bytesOnDisk, 0));

  readonly anyBusy = computed(() =>
    this.rows().some((row) => row.state === 'installing' || row.state === 'removing'),
  );

  /**
   * Carrega o inventário e lê o cache. Idempotente: a tela chama a cada entrada.
   *
   * Nunca lança. Uma falha aqui vira "nada instalado", que é o pior caso honesto
   * — o contrário, afirmar instalado sem estar, mandaria alguém confiar num
   * offline que não existe.
   */
  async refresh(): Promise<void> {
    if (typeof window === 'undefined') return;

    this.supported.set('serviceWorker' in navigator && !!navigator.serviceWorker.controller);

    await Promise.all([this.loadInventory(), this.readCache()]);
    this.ready.set(true);
  }

  /**
   * Baixa o que FALTA do pacote.
   *
   * Só o que falta: um pacote pela metade continua de onde parou, e mandar
   * instalar um completo não custa rede nenhuma. O progresso é sobre os bytes que
   * faltam e não sobre o total — uma barra que começa em 90% porque quase tudo já
   * estava lá é a leitura certa, e é a mesma regra da barra do corte de vídeo.
   */
  async install(id: PackId): Promise<void> {
    if (this.busy()[id]) return;

    const pack = packById(id);
    const inventory = this.inventory();
    const missing = filesForPack(pack, inventory, this.runtimeFacts()).filter(
      (path) => !this.cached().has(path),
    );

    this.clearFailure(id);

    // Instalar é o oposto de remover: quem baixa de propósito desfaz a marca que
    // impede o prefetch ocioso de trazer o pacote de volta.
    this.setRemovedByHand(id, false);

    if (missing.length === 0) {
      await this.readCache();
      return;
    }

    const abort = new AbortController();
    this.aborts.set(id, abort);
    this.setBusy(id, 'installing');
    this.setPercent(id, 0);

    const total = missing.reduce((sum, path) => sum + (inventory.files[path] ?? 0), 0);
    let done = 0;

    try {
      const cache = await caches.open(PACK_CACHE);

      for (const path of missing) {
        await this.fetchInto(cache, path, abort.signal, (chunk) => {
          done += chunk;
          this.setPercent(id, total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0);
        });
      }
    } catch {
      // Cancelar é uma escolha, não um erro: o que já baixou fica, e o botão volta
      // a dizer "concluir download". Qualquer outra falha — rede caída, cota
      // estourada — precisa aparecer, porque um pacote incompleto que se diz
      // pronto é exatamente a mentira que esta tela existe para não contar.
      if (!abort.signal.aborted) this.markFailed(id);
    } finally {
      this.aborts.delete(id);
      this.setBusy(id, null);
      this.setPercent(id, 0);
      await this.readCache();
    }
  }

  /** Interrompe um download em curso. O que já chegou continua no cache. */
  cancel(id: PackId): void {
    this.aborts.get(id)?.abort();
  }

  /**
   * Apaga tudo o que existe sob os prefixos do pacote — inclusive o que não está
   * no inventário. Uma parte de um deploy anterior, ou a variante do core que este
   * navegador não usa, ocupam espaço igual, e deixá-las para trás faria o
   * "removido" da tela discordar do que o disco mostra.
   */
  async remove(id: PackId): Promise<void> {
    if (this.busy()[id]) return;

    const pack = packById(id);
    this.clearFailure(id);
    this.setBusy(id, 'removing');

    try {
      const cache = await caches.open(PACK_CACHE);
      const keys = await cache.keys();

      const mine = keys.filter((request) => {
        const path = this.pathOf(request.url);
        return path !== null && pack.prefixes.some((prefix) => path.startsWith(prefix));
      });

      await Promise.all(mine.map((request) => cache.delete(request)));

      // Sem esta marca o prefetch ocioso baixaria os 42 MB de volta na próxima
      // visita, e o botão de remover pareceria quebrado.
      this.setRemovedByHand(id, true);
    } catch {
      this.markFailed(id);
    } finally {
      this.setBusy(id, null);
      await this.readCache();
    }
  }

  async removeAll(): Promise<void> {
    for (const pack of PACKS) await this.remove(pack.id);
  }

  // ----------------------------------------------------------------- ajustes

  /**
   * O prefetch ocioso do modelo de IA continua ligado por padrão — ele é o que
   * faz o primeiro recorte ser só inferência em vez de uma espera de 42 MB. O que
   * mudou é que agora é uma decisão, lida aqui e no `ModelPrefetchService`.
   */
  autoDownloadEnabled(): boolean {
    return this.readStorage(AUTO_KEY) !== '0';
  }

  setAutoDownload(enabled: boolean): void {
    this.writeStorage(AUTO_KEY, enabled ? '1' : '0');
  }

  /** Este pacote foi removido À MÃO? Se foi, nada o traz de volta sozinho. */
  wasRemovedByHand(id: PackId): boolean {
    return this.removedByHand().includes(id);
  }

  // ------------------------------------------------------------------ interno

  private runtimeFacts(): RuntimeFacts {
    // Uma vez por sessão: `WebAssembly.validate` é barata, mas isto é lido por um
    // computed que reavalia a cada leitura do cache.
    this.facts ??= { simd: simdSupported(), relaxedSimd: relaxedSimdSupported() };
    return this.facts;
  }

  /**
   * Busca um arquivo e o guarda com os HEADERS DA RESPOSTA ORIGINAL.
   *
   * Copiar os headers não é detalhe: um `Content-Type` errado no
   * `ort-wasm-simd-threaded.mjs` faz o navegador recusar o módulo, e o sintoma
   * aparece longe daqui, dentro do onnxruntime. O `X-Nadasai-Install` diz ao
   * service worker para não guardar uma segunda cópia dos mesmos bytes — e é o
   * `put` daqui que deixa uma cota estourada chegar à tela em vez de sumir dentro
   * do worker.
   */
  private async fetchInto(
    cache: Cache,
    path: string,
    signal: AbortSignal,
    onBytes: (chunk: number) => void,
  ): Promise<void> {
    const url = new URL(path.slice(1), document.baseURI).href;
    const response = await fetch(url, { signal, headers: { 'X-Nadasai-Install': '1' } });
    if (!response.ok) throw new Error(`${path} ${response.status}`);

    const body = response.body;
    let bytes: Uint8Array;

    if (body) {
      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        length += value.byteLength;
        onBytes(value.byteLength);
      }

      bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } else {
      // Sem corpo legível o progresso avança de arquivo em arquivo, e não byte a
      // byte. Mesmo caso que o `fetchModel` já trata na remoção de fundo.
      bytes = new Uint8Array(await response.arrayBuffer());
      onBytes(bytes.byteLength);
    }

    await cache.put(url, new Response(bytes, { headers: response.headers }));
  }

  private async loadInventory(): Promise<void> {
    if (Object.keys(this.inventory().files).length > 0) return;

    try {
      const response = await fetch(new URL('packs.json', document.baseURI).href);
      if (!response.ok) return;
      const parsed = (await response.json()) as PackInventory;
      if (parsed && typeof parsed.files === 'object') this.inventory.set(parsed);
    } catch {
      // Sem inventário a tela não sabe tamanho nenhum, e mostrar zero é melhor do
      // que inventar. `ng serve` cai exatamente aqui: o `packs.json` é escrito no
      // postbuild, e é também onde não há service worker para servir coisa alguma.
    }
  }

  private async readCache(): Promise<void> {
    if (!('caches' in globalThis)) {
      this.cached.set(new Set());
      return;
    }

    try {
      const cache = await caches.open(PACK_CACHE);
      const keys = await cache.keys();
      const paths = new Set<string>();

      for (const request of keys) {
        const path = this.pathOf(request.url);
        if (path) paths.add(path);
      }

      this.cached.set(paths);
    } catch {
      this.cached.set(new Set());
    }
  }

  /** A URL absoluta de volta ao caminho do inventário, ou `null` se não for nossa. */
  private pathOf(url: string): string | null {
    try {
      const parsed = new URL(url);
      return parsed.origin === location.origin ? parsed.pathname : null;
    } catch {
      return null;
    }
  }

  private setBusy(id: PackId, value: Busy): void {
    this.busy.update((current) => ({ ...current, [id]: value }));
  }

  private setPercent(id: PackId, value: number): void {
    this.percent.update((current) => ({ ...current, [id]: value }));
  }

  private markFailed(id: PackId): void {
    this.failed.update((current) => new Set(current).add(id));
  }

  private clearFailure(id: PackId): void {
    this.failed.update((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  private removedByHand(): readonly PackId[] {
    try {
      const raw = this.readStorage(REMOVED_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as PackId[]) : [];
    } catch {
      return [];
    }
  }

  private setRemovedByHand(id: PackId, removed: boolean): void {
    const current = new Set(this.removedByHand());
    if (removed) current.add(id);
    else current.delete(id);
    this.writeStorage(REMOVED_KEY, JSON.stringify([...current]));
  }

  private readStorage(key: string): string | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
      // Safari em navegação privada lança ao só LER. Um ajuste inacessível é o
      // padrão, nunca uma exceção que sobe até o ErrorHandler global.
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      localStorage?.setItem(key, value);
    } catch {
      /* idem */
    }
  }

  /** Só para os testes: em produção o inventário vem do `packs.json`. */
  setInventoryForTest(inventory: PackInventory): void {
    this.inventory.set(inventory);
  }
}
