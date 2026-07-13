import type { TranslationKey } from './services/translation.service';

export type ErrorCode =
  | 'unsupported_file'
  | 'too_large'
  | 'too_many_pixels'
  | 'decode_failed'
  | 'encode_failed'
  | 'model_failed'
  | 'generic';

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
