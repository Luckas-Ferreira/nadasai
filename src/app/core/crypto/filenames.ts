import type { EnvelopeMeta } from './envelope';

/**
 * Filename and MIME recovery for encrypt-file, moved out of the component.
 *
 * A V2 envelope carries the original name and type, so this only really matters
 * on the V1 and headerless-legacy paths — but those are exactly the files that
 * have been sitting on people's disks the longest.
 */

/**
 * Restores an extension that a browser's duplicate-download suffix pushed out of
 * place: Chrome saves a second copy of `report.pdf.enc` as `report.pdf (1).enc`,
 * so stripping `.enc` leaves `report.pdf (1)` and the OS no longer sees a PDF.
 * This reflows it to `report (1).pdf`.
 *
 * The original of this regex was written with string-style double escapes inside
 * a regex LITERAL — `\\.` matches a literal backslash followed by any character,
 * so the branch could never fire and the whole function was a no-op on the case
 * it exists for.
 */
export function sanitizeDecryptedFilename(rawName: string): string {
  const name = rawName.replace(/\.enc$/i, '');
  const trapped = name.match(/^(.*)\.([a-zA-Z0-9]{2,6})\s*\(([^)]+)\)$/);
  if (trapped) {
    const [, base, ext, suffix] = trapped;
    return `${base} (${suffix}).${ext}`;
  }
  return name;
}

export function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3': return 'audio/mpeg';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'flac': return 'audio/flac';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain';
    case 'json': return 'application/json';
    case 'zip': return 'application/zip';
    default: return 'application/octet-stream';
  }
}

/**
 * Works out what to call the decrypted file. The envelope's metadata wins when
 * it is there; otherwise the name is reconstructed from the `.enc` filename.
 *
 * The `decrypted_` fallback covers the case where stripping changed nothing —
 * a legacy envelope that was renamed and no longer ends in `.enc` — because
 * writing the plaintext over the same name the user picked would be surprising.
 */
export function restoreName(
  sourceName: string,
  meta: EnvelopeMeta | null,
): { name: string; type: string } {
  let name = sanitizeDecryptedFilename(sourceName);
  let type = mimeFromFilename(name);

  if (meta?.name) name = meta.name;
  if (meta?.type) type = meta.type;

  name = sanitizeDecryptedFilename(name);
  if (!name || name === sourceName) {
    name = `decrypted_${sourceName.replace(/\.enc$/i, '')}`;
    type = mimeFromFilename(name);
  }

  return { name, type };
}
