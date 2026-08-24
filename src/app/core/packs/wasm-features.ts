/**
 * Detecção de SIMD e SIMD relaxada, para escolher UMA variante do core do
 * Tesseract em vez de baixar as três.
 *
 * O `getCore.js` do tesseract.js decide em tempo de execução entre
 * `tesseract-core-lstm.wasm.js`, `-simd-lstm` e `-relaxedsimd-lstm` — 3,7 MB
 * cada. Quem instala o pacote de OCR pela tela precisa acertar a MESMA escolha,
 * senão baixa 11,1 MB para usar 3,7, ou pior: baixa o arquivo errado, o pacote
 * se diz instalado, e o OCR falha offline buscando um quarto arquivo que não
 * está lá.
 *
 * POR QUE NÃO O `wasm-feature-detect`. Ele existe em `node_modules` — mas só
 * como dependência TRANSITIVA do tesseract.js, e este repositório já pagou por
 * confiar numa dessas (o `fflate` resolvia só porque o jspdf o arrastava, e teria
 * sumido num upgrade). São dois módulos de trinta bytes; copiá-los custa menos
 * que uma dependência nova ou que a aposta de que a transitiva continua ali.
 *
 * São SÍNCRONAS de propósito. `WebAssembly.validate` é síncrona; o
 * wasm-feature-detect as embrulha em `async` por uniformidade da API dele, e
 * herdar isso só espalharia `await` por código que não espera nada.
 */

/** Os mesmos bytes do wasm-feature-detect: um módulo mínimo que usa `i8x16.splat`. */
const SIMD_MODULE = [
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15,
  253, 98, 11,
];

/** Idem, usando `i32x4.relaxed_trunc_f32x4_s`. */
const RELAXED_SIMD_MODULE = [
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15,
  65, 2, 253, 15, 253, 128, 2, 11,
];

function validates(bytes: readonly number[]): boolean {
  // O prerender roda este app no Node, onde `WebAssembly` existe — mas um
  // ambiente sem ele não pode derrubar a rota inteira por causa de um detalhe de
  // qual variante baixar. Sem WebAssembly a resposta certa é "nenhum recurso".
  if (typeof WebAssembly === 'undefined') return false;
  try {
    return WebAssembly.validate(new Uint8Array(bytes));
  } catch {
    return false;
  }
}

export function simdSupported(): boolean {
  return validates(SIMD_MODULE);
}

export function relaxedSimdSupported(): boolean {
  return validates(RELAXED_SIMD_MODULE);
}
