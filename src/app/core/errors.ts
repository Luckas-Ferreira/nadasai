import type { TranslationKey } from './services/translation.service';

export type ErrorCode =
  | 'unsupported_file'
  | 'too_large'
  | 'too_many_pixels'
  | 'decode_failed'
  | 'encode_failed'
  | 'model_failed'
  | 'pdf_unsupported'
  | 'pdf_too_large'
  | 'pdf_encrypted'
  | 'pdf_export_failed'
  | 'pdf_no_text'
  | 'audio_unsupported'
  | 'audio_too_large'
  | 'audio_too_long'
  | 'audio_decode_failed'
  | 'audio_empty_selection'
  | 'audio_needs_two'
  | 'audio_rate_mismatch'
  // A wrong password and a corrupted file are cryptographically INDISTINGUISHABLE:
  // AES-GCM's authentication tag is a single yes/no, and SubtleCrypto.decrypt throws
  // the same bare OperationError for a wrong key and for a flipped ciphertext bit.
  // Do not invent a distinction that does not exist. What IS distinguishable happens
  // before the decrypt call, and that is the whole point of the split below:
  // a header that does not parse is `bad_envelope`, a header that parses and then
  // fails the tag is `decrypt_failed` (worded to name both possible causes).
  | 'crypto_unsupported'
  | 'crypto_too_large'
  | 'crypto_bad_envelope'
  | 'crypto_decrypt_failed'
  | 'exif_unsupported'
  | 'exif_malformed'
  | 'hash_too_large'
  | 'text_too_large'
  | 'pdf_no_pages'
  | 'pdf_no_regions'
  | 'generic';

/**
 * The message IS the code, deliberately. `features/pdf/pdf.component.ts` catches
 * by reading `err.message` and building `error.<message>`, which is how the PDF
 * editor mapped its failures before AppError reached that side of the app —
 * so throwing AppError there keeps working without touching that handler.
 */
export class AppError extends Error {
  constructor(readonly code: ErrorCode, cause?: unknown) {
    super(code, { cause });
    this.name = 'AppError';
  }
}

const MESSAGE_KEYS: Record<ErrorCode, TranslationKey> = {
  unsupported_file: 'error.unsupported_file',
  too_large: 'error.too_large',
  too_many_pixels: 'error.too_many_pixels',
  decode_failed: 'error.decode_failed',
  encode_failed: 'error.encode_failed',
  model_failed: 'error.model_failed',
  pdf_unsupported: 'error.pdf_unsupported',
  pdf_too_large: 'error.pdf_too_large',
  pdf_encrypted: 'error.pdf_encrypted',
  pdf_export_failed: 'error.pdf_export_failed',
  pdf_no_text: 'error.pdf_no_text',
  audio_unsupported: 'error.audio_unsupported',
  audio_too_large: 'error.audio_too_large',
  audio_too_long: 'error.audio_too_long',
  audio_decode_failed: 'error.audio_decode_failed',
  audio_empty_selection: 'error.audio_empty_selection',
  audio_needs_two: 'error.audio_needs_two',
  audio_rate_mismatch: 'error.audio_rate_mismatch',
  crypto_unsupported: 'error.crypto_unsupported',
  crypto_too_large: 'error.crypto_too_large',
  crypto_bad_envelope: 'error.crypto_bad_envelope',
  crypto_decrypt_failed: 'error.crypto_decrypt_failed',
  exif_unsupported: 'error.exif_unsupported',
  exif_malformed: 'error.exif_malformed',
  hash_too_large: 'error.hash_too_large',
  text_too_large: 'error.text_too_large',
  pdf_no_pages: 'error.pdf_no_pages',
  pdf_no_regions: 'error.pdf_no_regions',
  generic: 'error.generic',
};

/**
 * Maps any thrown value to a translation key. Every catch block in the app runs
 * through here so failures surface in the UI instead of only in the console.
 */
export function toMessageKey(err: unknown): TranslationKey {
  if (err instanceof AppError) return MESSAGE_KEYS[err.code];
  return MESSAGE_KEYS.generic;
}
