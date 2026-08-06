/// <reference lib="webworker" />

/**
 * O vetorizador roda AQUI, e não na main thread.
 *
 * É o trabalho de CPU mais pesado do produto: k-means sobre milhões de pixels,
 * componentes conexos, subdivisão planar e ajuste de Bézier por arco. Numa foto
 * de 12 MP são segundos. Na main thread isso não é "lento" — é a aba congelada,
 * sem scroll, sem cancelar, sem nem repintar o spinner que diria que algo está
 * acontecendo. O TBT já é o eixo fraco deste app (ver AUDITORIA.md §1.3) e este
 * seria, de longe, o maior bloqueio de todos.
 *
 * O ImageData vem por TRANSFERÊNCIA, não por cópia: `postMessage` com o buffer
 * na lista de transferíveis move a memória em vez de clonar. Um raster de 12 MP
 * é 48 MB de RGBA, e cloná-lo ida e volta custaria mais tempo e mais pico de
 * memória que boa parte do algoritmo.
 *
 * Consequência que o chamador precisa conhecer: depois de transferir, o buffer
 * fica NEUTRALIZADO do lado de quem enviou. Por isso `VectorizerService` sempre
 * re-extrai o ImageData do canvas a cada execução em vez de guardar um só e
 * reusar — reusar daria um array de comprimento zero na segunda vez, e o sintoma
 * seria um SVG vazio sem erro nenhum.
 */

import { type VectorizeOptions, vectorize } from './vectorize';

export interface VectorWorkerRequest {
  readonly id: number;
  readonly rgba: ArrayBuffer;
  readonly width: number;
  readonly height: number;
  readonly options: VectorizeOptions;
}

export type VectorWorkerResponse =
  | { readonly kind: 'progress'; readonly id: number; readonly stage: string; readonly fraction: number }
  | {
      readonly kind: 'done';
      readonly id: number;
      readonly svg: string;
      readonly shapeCount: number;
      readonly nodeCount: number;
      readonly colorCount: number;
      readonly gradientCount: number;
      readonly byteLength: number;
    }
  | { readonly kind: 'error'; readonly id: number; readonly message: string };

addEventListener('message', ({ data }: MessageEvent<VectorWorkerRequest>) => {
  const { id, rgba, width, height, options } = data;

  try {
    const pixels = new Uint8ClampedArray(rgba);

    // O progresso é limitado a uma mensagem por etapa. Postar por região faria
    // milhares de mensagens e a serialização delas custaria mais que a etapa
    // que elas relatam.
    const result = vectorize(pixels, width, height, options, (stage, fraction) => {
      postMessage({ kind: 'progress', id, stage, fraction } satisfies VectorWorkerResponse);
    });

    postMessage({
      kind: 'done',
      id,
      svg: result.svg,
      shapeCount: result.shapeCount,
      nodeCount: result.nodeCount,
      colorCount: result.colorCount,
      gradientCount: result.gradientCount,
      byteLength: result.byteLength,
    } satisfies VectorWorkerResponse);
  } catch (err) {
    // A mensagem atravessa como string: um Error não é estruturalmente clonável
    // em todos os navegadores, e um postMessage que lança dentro do worker mata
    // a execução sem que o chamador receba nada — a promessa ficaria pendente
    // para sempre, que é a pior falha possível numa UI com spinner.
    postMessage({
      kind: 'error',
      id,
      message: err instanceof Error ? err.message : String(err),
    } satisfies VectorWorkerResponse);
  }
});
