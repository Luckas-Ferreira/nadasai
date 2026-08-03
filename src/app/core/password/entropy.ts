/**
 * Password generation and the entropy readout beside it.
 *
 * The readout is the whole product here, so the two defects it shipped with
 * both mattered: the entropy added 28 for symbols while the symbol string held
 * 26, overstating every password that used them; and nothing guaranteed a
 * character from each selected class, so "include digits" could produce a
 * password with no digit — and then the number beside it was wrong a second way.
 *
 * `poolSize` now derives from `alphabet()`, so the count and the characters
 * cannot drift apart again.
 */

export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const LOWER = 'abcdefghijklmnopqrstuvwxyz';
export const DIGITS = '0123456789';
export const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

export interface CharsetFlags {
  readonly upper: boolean;
  readonly lower: boolean;
  readonly digits: boolean;
  readonly symbols: boolean;
}

export type Strength = 'weak' | 'medium' | 'strong' | 'very_strong';

export function alphabet(f: CharsetFlags): string {
  return (
    (f.upper ? UPPER : '') +
    (f.lower ? LOWER : '') +
    (f.digits ? DIGITS : '') +
    (f.symbols ? SYMBOLS : '')
  );
}

export function poolSize(f: CharsetFlags): number {
  return alphabet(f).length;
}

export function entropyBits(length: number, f: CharsetFlags): number {
  const pool = poolSize(f);
  if (pool === 0 || length <= 0) return 0;
  return Math.round(length * Math.log2(pool));
}

export function strengthOf(bits: number): Strength {
  if (bits < 40) return 'weak';
  if (bits < 65) return 'medium';
  if (bits < 90) return 'strong';
  return 'very_strong';
}

/**
 * Uniform index into `max` values, by rejection.
 *
 * With a 94-character pool the modulo skew is about one part in 45 million —
 * negligible in every practical sense, and still worth six lines in the one
 * tool whose entire value proposition is the quality of its randomness.
 */
function randomIndex(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

function shuffle(chars: string[]): void {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
}

/**
 * Guarantees at least one character from every selected class, then fills the
 * rest and shuffles — otherwise a 24-character password could come back with no
 * digit while "Numbers" was ticked, which fails many corporate policies and
 * makes the entropy figure a lie.
 *
 * The shuffle uses getRandomValues, not Math.random: seeding a CSPRNG's output
 * through a predictable permutation would give most of the entropy back.
 */
export function generatePassword(length: number, f: CharsetFlags): string {
  const pool = alphabet(f);
  if (!pool || length <= 0) return '';

  const required: string[] = [];
  if (f.upper) required.push(UPPER);
  if (f.lower) required.push(LOWER);
  if (f.digits) required.push(DIGITS);
  if (f.symbols) required.push(SYMBOLS);

  const chars: string[] = [];
  // A length shorter than the number of selected classes cannot satisfy all of
  // them; take as many as fit rather than overshooting the requested length.
  for (const set of required.slice(0, length)) chars.push(set[randomIndex(set.length)]);
  while (chars.length < length) chars.push(pool[randomIndex(pool.length)]);

  shuffle(chars);
  return chars.join('');
}
