import { Injectable } from '@angular/core';
import { AppError } from '../../../../core/errors';
import type { Region } from '../../../../core/geometry/region';
import { burnRegions } from '../../../../core/image/redact';
import { canvasToBlob, loadImage, suffixedName } from '../../../../core/image/image-file.util';

export interface RedactImageOptions {
  readonly file: File;
  readonly regions: readonly Region[];
}

export interface RedactImageOutcome {
  readonly blob: Blob;
  readonly filename: string;
}

/** Formats that cannot carry the output; PNG is the safe landing place. */
const OUTPUT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

@Injectable({ providedIn: 'root' })
export class ImageRedactorService {
  async redact(options: RedactImageOptions): Promise<RedactImageOutcome> {
    const { file, regions } = options;
    if (regions.length === 0) throw new AppError('generic');

    // loadImage rejects properly. The component used to hand-roll
    // `new Promise(resolve => img.onload = resolve)`, which never rejects, so a
    // corrupt file left the tool spinning forever.
    const image = await loadImage(file);

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new AppError('encode_failed');

    ctx.drawImage(image, 0, 0);

    // The burn happens ONCE, here, at natural resolution — not on every pointer
    // move as it used to.
    burnRegions(canvas, regions);

    const type = OUTPUT_TYPES.has(file.type) ? file.type : 'image/png';
    const blob = await canvasToBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined);

    canvas.width = 0;
    canvas.height = 0;

    const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
    return { blob, filename: suffixedName(file.name, 'redacted', ext) };
  }
}
