import { Injectable } from '@angular/core';
import { zipSync } from 'fflate';
import { AppError } from '../../../core/errors';
import { canvasToBlob } from '../../../core/image/image-file.util';
import { forEachFrame, frameGridFor } from '../../../core/video/frames';
import { assertUsableVideo, probeVideo } from '../../../core/video/video-file.util';

/**
 * Quadros de um vídeo, como imagem.
 *
 * A leitura é a MESMA de `video-to-gif` (`core/video/frames.ts`): posicionar um
 * `<video>` no instante pedido e desenhar num canvas. O que muda é o destino —
 * lá os quadros viram uma paleta e um arquivo animado, aqui viram PNG, JPG ou
 * WebP. Escrever um segundo leitor teria sido a forma mais fácil de as duas
 * ferramentas discordarem sobre qual instante é o quadro 12.
 *
 * DOIS MODOS, e eles atendem pedidos diferentes:
 *
 *  - UM quadro, no instante que a pessoa escolheu no player. É o caso comum —
 *    a capa de um vídeo, o print de um erro que aparece por meio segundo, a
 *    foto que ninguém tirou porque só havia a filmagem.
 *  - VÁRIOS, a cada N segundos, num zip. É contato de folha: dá para escolher
 *    depois, sem voltar ao vídeo.
 *
 * O TETO DE QUADROS é de memória, e é real: o zip é montado inteiro na RAM da
 * aba, com todos os quadros já codificados dentro. Cem PNGs de 1280x720 passam
 * de cem megabytes antes de virar arquivo. Por isso o número aparece no painel
 * ANTES de rodar, e o serviço recusa em vez de travar a aba no meio.
 */

export const FRAME_FORMATS = ['png', 'jpeg', 'webp'] as const;
export type FrameFormat = (typeof FRAME_FORMATS)[number];

/** Intervalos em segundos, para o modo de vários quadros. */
export const FRAME_INTERVALS = [0.5, 1, 2, 5, 10] as const;
export type FrameInterval = (typeof FRAME_INTERVALS)[number];

export const MAX_FRAMES = 100;

const MIME: Record<FrameFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const EXT: Record<FrameFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };

export interface FrameRequest {
  readonly mode: 'single' | 'interval';
  /** Instante do quadro único, em segundos. */
  readonly atSec: number;
  readonly intervalSec: FrameInterval;
  readonly format: FrameFormat;
  /** Largura de saída; 0 usa a do vídeo. */
  readonly width: number;
  readonly quality: number;
}

export interface FrameOutput {
  readonly blob: Blob;
  readonly filename: string;
  readonly isZip: boolean;
  readonly count: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Quantos quadros o modo atual produziria — o painel mostra antes de rodar.
 *
 * O arredondamento é o MESMO de `frameGridFor`, e isso não é detalhe: o painel
 * usava `floor` e a leitura usa `round`, então um vídeo de 2,88 s a cada segundo
 * era anunciado como 2 quadros e entregava 3. Um número prometido que difere do
 * entregue é pior do que não mostrar número nenhum — e o e2e pegou exatamente
 * esse caso, porque toda gravação de MediaRecorder tem duração quebrada.
 */
export function frameCountFor(
  duration: number,
  request: Pick<FrameRequest, 'mode' | 'intervalSec'>,
): number {
  if (request.mode === 'single') return 1;
  if (duration <= 0) return 0;
  return Math.max(1, Math.round(duration / request.intervalSec));
}

@Injectable({ providedIn: 'root' })
export class FrameExtractorService {
  async inspect(file: File): Promise<{ duration: number; width: number; height: number }> {
    assertUsableVideo(file);
    const probe = await probeVideo(file);
    return { duration: probe.duration, width: probe.width, height: probe.height };
  }

  async extract(
    file: File,
    request: FrameRequest,
    baseName: string,
    onProgress?: (percent: number) => void,
  ): Promise<FrameOutput> {
    assertUsableVideo(file);

    const probe = await probeVideo(file);
    const wanted = frameCountFor(probe.duration, request);

    if (wanted <= 0) throw new AppError('frames_empty');
    if (wanted > MAX_FRAMES) throw new AppError('frames_too_many');

    const width = request.width > 0 ? request.width : probe.width || 640;

    // O modo de quadro único é um intervalo de duração zero: `frameGridFor`
    // devolve um quadro só, e a leitura é a mesma do outro modo. Sem isso seriam
    // dois caminhos para a mesma coisa, e um deles envelheceria.
    const range =
      request.mode === 'single'
        ? {
            file,
            startSec: request.atSec,
            endSec: request.atSec,
            fps: 1,
            width,
          }
        : {
            file,
            startSec: 0,
            endSec: probe.duration,
            fps: 1 / request.intervalSec,
            width,
          };

    const grid = frameGridFor(probe, range);
    const canvas = document.createElement('canvas');
    canvas.width = grid.width;
    canvas.height = grid.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AppError('video_decode_failed');

    const mime = MIME[request.format];
    const ext = EXT[request.format];
    const shots: Array<{ name: string; bytes: Uint8Array }> = [];

    const finalGrid = await forEachFrame(range, async (frame, index, frameGrid) => {
      if (canvas.width !== frameGrid.width || canvas.height !== frameGrid.height) {
        canvas.width = frameGrid.width;
        canvas.height = frameGrid.height;
      }

      ctx.putImageData(frame, 0, 0);

      // PNG ignora o parâmetro de qualidade; passá-lo é inofensivo e evita um
      // ramo a mais aqui.
      const blob = await canvasToBlob(canvas, mime, request.quality);
      const bytes = new Uint8Array(await blob.arrayBuffer());

      const number = String(index + 1).padStart(3, '0');
      shots.push({ name: `${baseName}-frame-${number}.${ext}`, bytes });

      onProgress?.(Math.round(((index + 1) / Math.max(1, frameGrid.count)) * 100));
    });

    if (shots.length === 0) throw new AppError('frames_empty');

    if (shots.length === 1) {
      const single = shots[0];
      return {
        blob: new Blob([single.bytes as unknown as BlobPart], { type: mime }),
        filename: `${baseName}-frame.${ext}`,
        isZip: false,
        count: 1,
        width: finalGrid.width,
        height: finalGrid.height,
      };
    }

    const entries: Record<string, Uint8Array> = {};
    for (const shot of shots) entries[shot.name] = shot.bytes;

    return {
      blob: new Blob([zipSync(entries) as unknown as BlobPart], { type: 'application/zip' }),
      filename: `${baseName}-frames.zip`,
      isZip: true,
      count: shots.length,
      width: finalGrid.width,
      height: finalGrid.height,
    };
  }
}
