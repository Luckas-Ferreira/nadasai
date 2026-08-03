import { Injectable } from '@angular/core';
import { AppError } from '../../../../core/errors';
import { type MetadataReport, readMetadata } from '../../../../core/exif/exif-parser';
import { DEFAULT_STRIP_OPTIONS, type StripOptions, isStrippable, stripMetadata } from '../../../../core/exif/strip';
import { suffixedName } from '../../../../core/image/image-file.util';

export interface InspectResult {
  readonly report: MetadataReport;
  readonly fileBytes: number;
}

export interface StripOutcome {
  readonly blob: Blob;
  readonly filename: string;
  readonly removedBytes: number;
  /** Read back off the OUTPUT, so the "0 bytes remaining" claim is observed. */
  readonly after: MetadataReport;
}

@Injectable({ providedIn: 'root' })
export class MetadataStripperService {
  async inspect(file: File): Promise<InspectResult> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isStrippable(bytes)) throw new AppError('exif_unsupported');
    return { report: readMetadata(bytes), fileBytes: file.size };
  }

  async strip(file: File, options: StripOptions = DEFAULT_STRIP_OPTIONS): Promise<StripOutcome> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { bytes: cleaned, removedBytes } = stripMetadata(bytes, options);

    // The extension carries over because nothing was transcoded. The old canvas
    // path re-encoded every PNG and WebP as JPEG while keeping the original
    // extension, so a .webp file came out holding JPEG bytes.
    const ext = file.name.includes('.') ? file.name.split('.').pop()! : 'jpg';

    return {
      blob: new Blob([cleaned], { type: file.type || 'application/octet-stream' }),
      filename: suffixedName(file.name, 'noexif', ext),
      removedBytes,
      after: readMetadata(cleaned),
    };
  }
}
