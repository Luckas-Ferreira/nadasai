import type { PackDef } from './packs';

/**
 * Quais arquivos um pacote instala, e quantos bytes isso pesa.
 *
 * Puro e sem Angular: recebe o inventário gerado no build, o pacote e os fatos de
 * runtime, e devolve listas. Toda a aritmética da tela de configuração sai daqui,
 * o que é o que permite testá-la sem navegador — mesma divisão do `core/audio/`
 * e do `core/photo/`.
 *
 * O INVENTÁRIO já é a expansão. `scripts/generate-packs.mjs` percorre o `dist/`
 * publicado, então `model/isnet-q8.onnx.part0` e as 169 tabelas do pdf.js já
 * chegam aqui como caminhos com tamanho — não há manifesto a ler nem diretório a
 * adivinhar. É por isso que este arquivo é filtro, e não descoberta.
 *
 * A ÚNICA regra que não é "tudo sob o prefixo" é a do core do Tesseract, e ela
 * está aqui porque é uma decisão sobre O QUE BAIXAR, não sobre como desenhar.
 */

/** O `packs.json` gerado no build: caminho de URL → bytes. */
export interface PackInventory {
  readonly files: Readonly<Record<string, number>>;
}

/** O que o navegador atual suporta, medido por `wasm-features.ts`. */
export interface RuntimeFacts {
  readonly simd: boolean;
  readonly relaxedSimd: boolean;
}

const TESSERACT_PREFIX = '/tesseract/';
const CORE_PREFIX = '/tesseract/tesseract-core';

/**
 * A variante do core que ESTE navegador vai pedir.
 *
 * Espelha `node_modules/tesseract.js/src/worker-script/browser/getCore.js`, na
 * ordem dele: SIMD relaxada primeiro, SIMD depois, base por último. Sempre a
 * `-lstm`, porque o `OcrService` constrói o worker com OEM 1 (LSTM_ONLY) — trocar
 * o OEM significa copiar as variantes Legacy no `angular.json` e mudar isto
 * junto, ou o core dá 404.
 */
export function tesseractCoreFile(facts: RuntimeFacts): string {
  if (facts.relaxedSimd) return '/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js';
  if (facts.simd) return '/tesseract/tesseract-core-simd-lstm.wasm.js';
  return '/tesseract/tesseract-core-lstm.wasm.js';
}

/** Todo caminho do inventário que pertence ao pacote, sem filtro nenhum. */
export function ownedPaths(pack: PackDef, inventory: PackInventory): readonly string[] {
  return Object.keys(inventory.files).filter((path) =>
    pack.prefixes.some((prefix) => path.startsWith(prefix)),
  );
}

/**
 * O que baixar. É `ownedPaths` menos as variantes do core que este navegador não
 * vai pedir: guardá-las custaria 7,4 MB que nada jamais lê.
 */
export function filesForPack(
  pack: PackDef,
  inventory: PackInventory,
  facts: RuntimeFacts,
): readonly string[] {
  const chosen = tesseractCoreFile(facts);

  return ownedPaths(pack, inventory)
    .filter((path) => !path.startsWith(CORE_PREFIX) || path === chosen)
    .sort();
}

/** Soma dos bytes de uma lista de caminhos, pelo inventário. */
export function bytesOf(paths: Iterable<string>, inventory: PackInventory): number {
  let total = 0;
  for (const path of paths) total += inventory.files[path] ?? 0;
  return total;
}

/** Quanto o pacote vai pesar depois de instalado. É o número que a tela anuncia. */
export function bytesForPack(
  pack: PackDef,
  inventory: PackInventory,
  facts: RuntimeFacts,
): number {
  return bytesOf(filesForPack(pack, inventory, facts), inventory);
}

export type PackState = 'absent' | 'partial' | 'installed';

/**
 * Em que estado o pacote está, dado o que existe no cache.
 *
 * `cached` é o conjunto de caminhos presentes — de TODO o cache, não só deste
 * pacote, porque quem chama tem uma listagem só.
 *
 * Um caminho no cache que não está no inventário (uma parte de um deploy
 * anterior, ou uma variante do core que o navegador buscou sozinho antes desta
 * tela existir) conta como presente para o estado mas pesa zero: o inventário é
 * a única fonte de tamanho, e inventar um número para um arquivo que não está
 * mais publicado seria pior do que somar zero. A remoção apaga tudo sob o
 * prefixo de qualquer forma, então nada fica órfão.
 */
export function stateOf(
  pack: PackDef,
  inventory: PackInventory,
  facts: RuntimeFacts,
  cached: ReadonlySet<string>,
): PackState {
  const wanted = filesForPack(pack, inventory, facts);
  if (wanted.length === 0) return 'absent';

  const present = wanted.filter((path) => cached.has(path)).length;
  if (present === 0) return 'absent';
  return present === wanted.length ? 'installed' : 'partial';
}

/** Quantos bytes deste pacote estão AGORA em disco. Medido, não prometido. */
export function installedBytes(
  pack: PackDef,
  inventory: PackInventory,
  cached: ReadonlySet<string>,
): number {
  return bytesOf(
    [...cached].filter((path) => pack.prefixes.some((prefix) => path.startsWith(prefix))),
    inventory,
  );
}
