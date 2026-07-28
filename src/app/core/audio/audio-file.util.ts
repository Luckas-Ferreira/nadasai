import { AppError } from '../errors';

/**
 * What the file picker offers and what the drop gate accepts.
 *
 * The list is deliberately wider than what any single browser decodes: there is
 * no capability query for `decodeAudioData`, so the only honest test is to try
 * the decode and map the failure onto `audio_decode_failed`. Narrowing this list
 * to "what Chrome does" would reject files Firefox reads perfectly.
 *
 * The extensions are in the accept string alongside the MIME types on purpose —
 * Windows hands `.m4a` and `.flac` over with an empty `type` often enough that a
 * MIME-only filter hides them in the picker.
 */
export const ACCEPTED_AUDIO_MIME = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/opus',
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
  'audio/x-flac',
] as const;

export const ACCEPT_AUDIO_ATTR = [
  ...ACCEPTED_AUDIO_MIME,
  '.mp3',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.m4a',
  '.aac',
  '.flac',
  '.webm',
].join(',');

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

/**
 * The real ceiling is memory, not bytes on disk.
 *
 * `decodeAudioData` expands everything to 32-bit float PCM: 30 minutes of
 * stereo at 48 kHz is ~690 MB resident, and the cut allocates the result on top
 * of that plus the 16-bit WAV bytes. A 100 MB MP3 is roughly 100 minutes, which
 * would ask the tab for well over 2 GB and get killed — so the byte limit alone
 * is not a guard. This is checked after the decode, which is the first moment
 * the duration is known.
 */
export const MAX_AUDIO_SECONDS = 30 * 60;

export function isSupportedAudio(file: File): boolean {
  if ((ACCEPTED_AUDIO_MIME as readonly string[]).includes(file.type)) return true;
  // Empty or bogus `type` is common for m4a/flac on Windows; fall back to the name.
  return /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac|webm)$/i.test(file.name);
}

/** Throws AppError('audio_unsupported' | 'audio_too_large'). */
export function assertUsableAudio(file: File): void {
  if (!isSupportedAudio(file)) throw new AppError('audio_unsupported');
  if (file.size > MAX_AUDIO_BYTES) throw new AppError('audio_too_large');
}

/**
 * `m:ss.mmm`, which is what the time inputs read and write.
 *
 * Milliseconds are shown, not rounded away: the whole point of the numeric
 * inputs is to be the precise control the waveform drag cannot be, and a
 * timecode that truncates to whole seconds cannot express a sample-accurate
 * edit no matter how carefully it is typed.
 */
export function formatTimecode(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const whole = Math.floor(clamped);
  const ms = Math.round((clamped - whole) * 1000);
  // Rounding 59.9996 up must carry into the seconds, or it renders as "0:59.1000".
  const carried = ms === 1000 ? whole + 1 : whole;
  const mins = Math.floor(carried / 60);
  const secs = carried % 60;
  return `${mins}:${String(secs).padStart(2, '0')}.${String(ms === 1000 ? 0 : ms).padStart(3, '0')}`;
}

/** Coarse label for rulers and durations, where milliseconds are noise. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Parses what `formatTimecode` writes, plus what people actually type into it:
 * `90`, `1:30`, `1:30.5`, `01:30,500`, `1h02:03`. Returns null when there is no
 * number in there at all, so the caller can keep the previous value instead of
 * snapping the selection to zero while the field is half-typed.
 */
export function parseTimecode(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!text) return null;

  const parts = text.split(':');
  if (parts.length > 3) return null;

  let seconds = 0;
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isFinite(value) || value < 0) return null;
    seconds = seconds * 60 + value;
  }

  return seconds;
}
