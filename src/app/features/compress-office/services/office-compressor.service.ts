import { Injectable } from '@angular/core';
import { AppError } from '../../../core/errors';
import { canvasToBlob } from '../../../core/image/image-file.util';
import {
  COMPRESS_LEVELS,
  fitWithin,
  findMedia,
  mediaShare,
  totalBytes,
  type OfficeMediaEntry,
} from '../../../core/office/media';
import { officeKindOf, type OfficeKind } from '../../../core/office/metadata';

export type OfficeCompressLevel = keyof typeof COMPRESS_LEVELS;

export interface OfficeScan {
  readonly kind: OfficeKind;
  readonly entries: Record<string, Uint8Array>;
  readonly media: readonly OfficeMediaEntry[];
  readonly mediaBytes: number;
  /** Fração do arquivo que é imagem recomprimível — o teto do ganho possível. */
  readonly share: number;
}

export interface OfficeCompressResult {
  readonly blob: Blob;
  readonly ext: string;
  /** Quantas imagens de fato encolheram. */
  readonly rewritten: number;
  readonly keptOriginal: boolean;
}

/**
 * COMPRIME UM ARQUIVO DO OFFICE RECOMPRIMINDO AS IMAGENS DENTRO DELE.
 *
 * O documento em si — o XML do texto, os estilos, as relações, as fontes
 * embutidas — é copiado byte a byte, exatamente como o `cleanOfficeMetadata`
 * faz. Isso não é economia de esforço: é o que garante que o arquivo continue
 * abrindo. Reescrever OOXML é reescrever uma especificação que só o Word
 * implementa por inteiro, e a diferença entre um arquivo menor e um arquivo
 * quebrado está justamente em não mexer no que não se entende.
 *
 * O que muda é só o conteúdo de `word/media/`, `ppt/media/` e `xl/media/`, e
 * cada imagem só é substituída se a versão nova for MENOR. Uma foto já
 * otimizada volta intacta em vez de crescer — a mesma regra que o compressor de
 * PDF aplica ao documento inteiro.
 */
@Injectable({ providedIn: 'root' })
export class OfficeCompressorService {
  /** Abre o zip e mede, sem recomprimir nada. É o que o painel mostra antes. */
  async scan(file: File): Promise<OfficeScan> {
    const kind = officeKindOf(file.name);
    if (!kind) throw new AppError('office_unsupported');

    const { unzipSync } = await import('fflate');

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    } catch {
      throw new AppError('office_unsupported');
    }

    const media = findMedia(entries);

    return {
      kind,
      entries,
      media,
      mediaBytes: totalBytes(media),
      share: mediaShare(entries),
    };
  }

  async compress(
    file: File,
    scan: OfficeScan,
    level: OfficeCompressLevel,
    onProgress?: (done: number, total: number) => void,
  ): Promise<OfficeCompressResult> {
    const { zipSync } = await import('fflate');
    const { maxSide, quality } = COMPRESS_LEVELS[level];

    const out: Record<string, Uint8Array> = { ...scan.entries };
    let rewritten = 0;

    // SEQUENCIAL, e não `Promise.all`: cada imagem vira um canvas, e uma
    // apresentação com quarenta fotos de 12 MP seguraria gigabytes de RGBA ao
    // mesmo tempo. É a mesma regra do `encodePdfFromImages`.
    for (let i = 0; i < scan.media.length; i++) {
      const entry = scan.media[i];
      const smaller = await this.recompress(entry, maxSide, quality);

      if (smaller && smaller.byteLength < entry.bytes.byteLength) {
        out[entry.path] = smaller;
        rewritten++;
      }

      onProgress?.(i + 1, scan.media.length);
    }

    const bytes = zipSync(out);
    const blob = new Blob([bytes as BlobPart], { type: file.type || 'application/octet-stream' });

    /**
     * Um compressor que devolve arquivo maior é a falha que ninguém perdoa, e
     * ela acontece: um `.docx` cujas imagens já estavam otimizadas sai maior só
     * pela diferença de compressão do zip. Melhor devolver o original e dizer.
     */
    if (blob.size >= file.size) {
      return {
        blob: file.slice(0, file.size, file.type),
        ext: scan.kind,
        rewritten: 0,
        keptOriginal: true,
      };
    }

    return { blob, ext: scan.kind, rewritten, keptOriginal: false };
  }

  /**
   * Decodifica, reduz e recodifica UMA imagem. `null` quando não dá.
   *
   * Falhar aqui é normal e não é erro: um PNG corrompido, um formato que o
   * navegador diz conhecer e não decodifica, um blob que na verdade era outra
   * coisa. Nesses casos a entrada original é mantida e o arquivo continua
   * válido — perder uma imagem para ganhar bytes seria o pior negócio possível.
   */
  private async recompress(
    entry: OfficeMediaEntry,
    maxSide: number,
    quality: number,
  ): Promise<Uint8Array | null> {
    const blob = new Blob([entry.bytes as BlobPart]);
    const url = URL.createObjectURL(blob);

    try {
      const image = await loadBitmap(url);
      const { w, h } = fitWithin(image.width, image.height, maxSide);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      /**
       * Sem alfa quando a origem não tem, com alfa quando pode ter.
       *
       * Um PNG de logo com fundo transparente recodificado como JPEG ganha um
       * fundo PRETO, e num slide isso é um retângulo preto onde havia um logo.
       * Por isso o que pode ter transparência continua PNG, mesmo que renda
       * menos: o ganho não vale o risco de estragar a página.
       */
      const ctx = canvas.getContext('2d', { alpha: entry.mayHaveAlpha });
      if (!ctx) return null;

      if (!entry.mayHaveAlpha) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }

      ctx.drawImage(image, 0, 0, w, h);
      if ('close' in image) image.close();

      const type = entry.mayHaveAlpha ? 'image/png' : 'image/jpeg';
      const encoded = await canvasToBlob(canvas, type, quality);

      canvas.width = 0;
      canvas.height = 0;

      return new Uint8Array(await encoded.arrayBuffer());
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * `createImageBitmap` quando existe, `<img>` quando não.
 *
 * O bitmap é preferido porque decodifica fora da thread principal e pode ser
 * liberado explicitamente — numa apresentação com dezenas de fotos isso é a
 * diferença entre a aba responder e não responder.
 */
async function loadBitmap(url: string): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    const response = await fetch(url);
    return createImageBitmap(await response.blob());
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new AppError('decode_failed'));
    image.src = url;
  });
}
