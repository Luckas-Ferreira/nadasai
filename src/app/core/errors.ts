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
  | 'video_unsupported'
  | 'video_too_large'
  | 'video_too_long'
  | 'video_decode_failed'
  | 'video_no_audio'
  // A captura de tela tem três finais distintos e nenhum deles é "deu erro":
  // o navegador não oferece a API (todo iOS), a pessoa fechou o seletor sem
  // escolher, ou a fonte escolhida não tem vídeo. Só o primeiro é definitivo.
  | 'capture_unsupported'
  | 'capture_denied'
  | 'capture_no_video'
  // Desistir não é falhar: quem cancela uma captura de 20 minutos já sabe o que
  // aconteceu, e um alerta vermelho ali só acusa a pessoa da própria escolha. O
  // código existe para que o `catch` distinga isso do resto e não mostre nada.
  | 'cancelled'
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
  // O vetorizador roda num Worker, e um erro lá chega como string por
  // postMessage — não como o objeto lançado. Não há como distinguir a causa do
  // lado de cá, e inventar uma distinção seria o mesmo erro que o bloco de
  // cripto acima documenta. Uma chave só, e o `console.error` do worker fica
  // para quem estiver depurando.
  | 'vector_failed'
  // O GIF não tem compressão temporal, então o recorte é o controle de tamanho —
  // e um recorte vazio ou longo demais é escolha do usuário, não falha de
  // arquivo. Duas chaves porque as respostas são opostas: uma pede que ele marque
  // um trecho, a outra que ele marque um trecho MENOR.
  | 'gif_empty_range'
  | 'gif_range_too_long'
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
  video_unsupported: 'error.video_unsupported',
  video_too_large: 'error.video_too_large',
  video_too_long: 'error.video_too_long',
  video_decode_failed: 'error.video_decode_failed',
  video_no_audio: 'error.video_no_audio',
  capture_unsupported: 'error.capture_unsupported',
  capture_denied: 'error.capture_denied',
  capture_no_video: 'error.capture_no_video',
  cancelled: 'error.cancelled',
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
  vector_failed: 'error.vector_failed',
  gif_empty_range: 'error.gif_empty_range',
  gif_range_too_long: 'error.gif_range_too_long',
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
