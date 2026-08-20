import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';
import { encodeGif, type GifFrame } from '../../../core/gif/encode';
import { PaletteMapper, buildPalette, mapFrame } from '../../../core/gif/palette';
import { forEachFrame, sampleFramePixels } from '../../../core/video/frames';
import { assertUsableVideo, probeVideo } from '../../../core/video/video-file.util';

/**
 * Vídeo → GIF, em três passos: paleta, quadros, arquivo.
 *
 * O TETO DE 30 SEGUNDOS é o número mais importante desta ferramenta, e ele não é
 * política: o GIF não tem compressão temporal, então o custo — de tempo, de
 * memória e de bytes no arquivo final — é linear em quadros e em pixels. Meio
 * minuto a 12 fps em 480 px de largura já são 360 quadros e um arquivo de vários
 * megabytes. Um limite maior não produziria um GIF maior; produziria um GIF que
 * ninguém consegue enviar.
 *
 * A MEMÓRIA é a razão de os quadros serem guardados INDEXADOS, e não em RGBA.
 * 360 quadros de 480x270 em RGBA são 186 MB; com um byte por pixel, 46 MB. É
 * também por isso que a paleta é construída numa passada separada, antes: sem
 * ela pronta, não há como indexar na hora e os quadros teriam de ficar crus.
 */

/** Teto de recorte. Ver o cabeçalho: é o formato que impõe, não o produto. */
export const MAX_GIF_SECONDS = 30;

export const GIF_WIDTHS = [240, 320, 480, 640] as const;
export const GIF_FPS = [8, 10, 12, 15, 20] as const;
export const GIF_COLORS = [64, 128, 256] as const;

export type GifWidth = (typeof GIF_WIDTHS)[number];
export type GifFps = (typeof GIF_FPS)[number];
export type GifColors = (typeof GIF_COLORS)[number];

export interface GifRequest {
  readonly startSec: number;
  readonly endSec: number;
  readonly fps: GifFps;
  readonly width: GifWidth;
  readonly colors: GifColors;
  readonly dither: boolean;
}

export interface GifOutput {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  /** Quantas cores a paleta acabou tendo — pode ser menos que o pedido. */
  readonly colors: number;
  /** Verdadeiro quando a paleta é a lista exata das cores do vídeo. */
  readonly exact: boolean;
}

export interface GifProgress {
  readonly percent: number;
  readonly stage: 'palette' | 'frames' | 'encode';
}

@Injectable({ providedIn: 'root' })
export class GifMakerService {
  /** Metadados para a interface montar os controles antes de gerar nada. */
  async inspect(file: File): Promise<{ duration: number; width: number; height: number }> {
    assertUsableVideo(file);
    const probe = await probeVideo(file);
    return { duration: probe.duration, width: probe.width, height: probe.height };
  }

  async make(
    file: File,
    request: GifRequest,
    onProgress?: (progress: GifProgress) => void,
    shouldStop?: () => boolean,
  ): Promise<GifOutput> {
    assertUsableVideo(file);

    const span = request.endSec - request.startSec;
    if (!(span > 0)) throw new AppError('gif_empty_range');
    if (span > MAX_GIF_SECONDS + 0.5) throw new AppError('gif_range_too_long');

    const range = {
      file,
      startSec: request.startSec,
      endSec: request.endSec,
      fps: request.fps,
      width: request.width,
    };

    onProgress?.({ percent: 2, stage: 'palette' });

    // 1. Paleta, de quadros espalhados pelo recorte inteiro.
    const { pixels } = await sampleFramePixels(range);
    if (shouldStop?.()) throw new AppError('cancelled');

    const palette = buildPalette(pixels, request.colors);
    const mapper = new PaletteMapper(palette);

    onProgress?.({ percent: 15, stage: 'frames' });

    // 2. Quadros, um de cada vez, já indexados.
    //
    // A grade vem do LEITOR, e não de um cálculo próprio: ele é quem tem as
    // dimensões reais do elemento carregado, e um WebM de MediaRecorder chega
    // com metadado incompleto o bastante para as duas contas discordarem. Se
    // discordassem, `mapFrame` receberia largura errada e o GIF sairia
    // embaralhado — não com aparência ruim, embaralhado mesmo.
    const frames: GifFrame[] = [];

    const grid = await forEachFrame(
      range,
      async (frame, index, frameGrid) => {
        frames.push({
          indices: mapFrame(
            frame.data,
            frameGrid.width,
            frameGrid.height,
            palette,
            mapper,
            request.dither,
          ),
          delayCs: frameGrid.delayCs,
        });

        onProgress?.({
          percent: 15 + Math.round(((index + 1) / frameGrid.count) * 75),
          stage: 'frames',
        });

        // Devolve a thread entre quadros. Sem isto a barra de progresso fica
        // congelada durante a parte longa, que é a hora em que ela existe para
        // dizer que o trabalho está andando.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      },
      shouldStop,
    );

    if (shouldStop?.()) throw new AppError('cancelled');
    if (frames.length === 0) throw new AppError('gif_empty_range');

    onProgress?.({ percent: 92, stage: 'encode' });

    const bytes = encodeGif(frames, {
      width: grid.width,
      height: grid.height,
      palette: palette.rgb,
    });

    onProgress?.({ percent: 100, stage: 'encode' });

    return {
      blob: new Blob([bytes as unknown as BlobPart], { type: 'image/gif' }),
      width: grid.width,
      height: grid.height,
      frames: frames.length,
      colors: palette.rgb.length,
      exact: palette.exact,
    };
  }
}
