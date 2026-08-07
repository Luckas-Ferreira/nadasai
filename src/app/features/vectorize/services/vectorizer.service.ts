import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';
import { loadImage } from '../../../core/image/image-file.util';
import { bleedTransparentColors } from '../../../core/vector/alpha';
import type { VectorizeOptions } from '../../../core/vector/vectorize';
import type { VectorWorkerRequest, VectorWorkerResponse } from '../../../core/vector/vector.worker';

/**
 * Embrulha o worker do vetorizador.
 *
 * Segue o formato das outras ferramentas: `providedIn: 'root'`, sem estado de
 * UI, recebe arquivo e opções, devolve dados, lança `AppError`, relata progresso
 * por callback. Todo estado de execução mora na componente, para o Angular
 * destruí-lo na navegação.
 *
 * O worker é criado sob demanda e mantido vivo entre execuções: a criação custa
 * dezenas de ms e um usuário ajustando o modo executa várias vezes seguidas.
 * `terminate()` existe para o cancelamento, que é a única forma real de
 * interromper um laço apertado de CPU — não há ponto de verificação dentro do
 * k-means para consultar uma flag.
 */
@Injectable({ providedIn: 'root' })
export class VectorizerService {
  private worker: Worker | null = null;
  private nextId = 1;

  /** Limite de pixels processados. Ver `sourcePixels`. */
  static readonly MAX_PIXELS = 4_000_000;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    // `new URL(..., import.meta.url)` é a forma que o esbuild do Angular
    // reconhece para empacotar o worker como chunk próprio. Criado aqui e não
    // no construtor de propósito: o serviço é root-provided e o prerender roda
    // em Node, onde `Worker` não existe — instanciar no construtor derrubaria
    // as 74 rotas na geração estática, que é exatamente a classe de falha que o
    // CLAUDE.md documenta para `localStorage` e `document.baseURI`.
    this.worker = new Worker(new URL('../../../core/vector/vector.worker', import.meta.url), {
      type: 'module',
    });
    return this.worker;
  }

  /**
   * Extrai os pixels de um arquivo, reduzindo se necessário.
   *
   * O teto não é sobre memória e sim sobre TEMPO: o custo é linear no número de
   * pixels e uma foto de 48 MP levaria mais de um minuto, ao fim do qual o SVG
   * teria dezenas de milhares de nós e seria inútil como vetor — ninguém edita
   * isso, e nenhum navegador desenha rápido. Reduzir para ~4 MP mantém todo
   * detalhe que sobrevive à quantização e deixa a execução na casa dos segundos.
   *
   * Re-extrai a cada execução, sempre. O buffer anterior foi TRANSFERIDO para o
   * worker e está neutralizado; reusá-lo devolveria um array vazio e um SVG em
   * branco, sem erro nenhum.
   */
  async sourcePixels(file: File): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
    const img = await loadImage(file);

    let { width, height } = img;
    const pixels = width * height;
    if (pixels > VectorizerService.MAX_PIXELS) {
      const scale = Math.sqrt(VectorizerService.MAX_PIXELS / pixels);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    // `encode_failed` para contexto nulo, que é o que `drawToCanvas` já usa em
    // `core/image/image-file.util.ts` — mesma causa, mesma mensagem.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new AppError('encode_failed');

    // NADA de fundo branco. Isto pintava `#ffffff` antes de desenhar, e todo PNG
    // recortado voltava com um retângulo branco atrás — na ferramenta cujo
    // vizinho de menu é a remoção de fundo. O motivo alegado (RGB indefinido sob
    // o alfa) é real, mas a resposta certa é `bleedTransparentColors`: cor
    // plausível debaixo do vazio, e o vazio continua vazio até o fim do
    // pipeline, onde vira buraco no SVG. Ver core/vector/alpha.ts.
    ctx.drawImage(img, 0, 0, width, height);

    const data = ctx.getImageData(0, 0, width, height).data;
    bleedTransparentColors(data, width, height);
    return { rgba: data, width, height };
  }

  /**
   * Vetoriza. Rejeita com `AppError` e relata progresso por `onProgress`.
   */
  run(
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
    options: VectorizeOptions,
    onProgress?: (stage: string, fraction: number) => void,
  ): Promise<{
    svg: string;
    shapeCount: number;
    nodeCount: number;
    colorCount: number;
    gradientCount: number;
    byteLength: number;
  }> {
    const worker = this.ensureWorker();
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const onMessage = ({ data }: MessageEvent<VectorWorkerResponse>): void => {
        // Uma execução antiga que chega tarde não pode escrever sobre a nova. O
        // id é o que separa: o cancelamento não espera o worker terminar.
        if (data.id !== id) return;

        if (data.kind === 'progress') {
          onProgress?.(data.stage, data.fraction);
          return;
        }

        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);

        if (data.kind === 'error') {
          reject(new AppError('vector_failed'));
          return;
        }

        resolve({
          svg: data.svg,
          shapeCount: data.shapeCount,
          nodeCount: data.nodeCount,
          colorCount: data.colorCount,
          gradientCount: data.gradientCount,
          byteLength: data.byteLength,
        });
      };

      const onError = (): void => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        reject(new AppError('vector_failed'));
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);

      const request: VectorWorkerRequest = {
        id,
        rgba: rgba.buffer as ArrayBuffer,
        width,
        height,
        options,
      };
      // O buffer vai TRANSFERIDO — ver o cabeçalho do worker. 48 MB não são
      // clonados ida e volta.
      worker.postMessage(request, [request.rgba]);
    });
  }

  /**
   * Cancela derrubando o worker.
   *
   * Não há como interromper de dentro: o k-means e o ajuste de curva são laços
   * apertados sem ponto de verificação, e enfiar um `if (cancelled)` neles
   * custaria mais que o cancelamento vale. O próximo `run()` cria outro worker.
   */
  cancel(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
