import { AppError } from '../errors';

/**
 * ASCII armour for encrypt-text: the SAME V2 envelope bytes as encrypt-file,
 * Base64'd between markers so they survive an email client.
 *
 * One format, deliberately — the contents of a .enc file can be pasted into the
 * text tool and vice versa, and there is no second crypto implementation to
 * keep in step.
 *
 * `dearmor` is tolerant on purpose. By the time a block comes back it has often
 * been through a mail client that rewrapped the lines, a chat app that stripped
 * the markers, and a copy that picked up the surrounding sentence. Refusing any
 * of that would fail on the normal case.
 */

export const ARMOR_BEGIN = '-----BEGIN NADASAI ENCRYPTED MESSAGE-----';
export const ARMOR_END = '-----END NADASAI ENCRYPTED MESSAGE-----';

const LINE_WIDTH = 76;

export function armor(bytes: Uint8Array): string {
  // String.fromCharCode(...bytes) blows the argument limit somewhere around a
  // hundred thousand bytes, which a pasted message can reach.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const b64 = btoa(binary);

  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += LINE_WIDTH) lines.push(b64.slice(i, i + LINE_WIDTH));

  return [ARMOR_BEGIN, ...lines, ARMOR_END].join('\n');
}

export function dearmor(text: string): Uint8Array {
  let body = text;

  const begin = body.indexOf(ARMOR_BEGIN);
  if (begin !== -1) body = body.slice(begin + ARMOR_BEGIN.length);
  const end = body.indexOf(ARMOR_END);
  if (end !== -1) body = body.slice(0, end);

  // Whatever is left, keep only Base64 characters: that absorbs the rewrapping
  // and the CRLFs. Surrounding prose is discarded by the marker slice above —
  // once the markers are gone, "hello" is indistinguishable from payload and
  // gets concatenated into it, which fails the atob below. Recovering from that
  // would mean guessing where the block starts; failing is the honest outcome.
  const b64 = body.replace(/[^A-Za-z0-9+/=]/g, '');
  if (!b64) throw new AppError('crypto_bad_envelope');

  let binary: string;
  try {
    binary = atob(b64);
  } catch (cause) {
    throw new AppError('crypto_bad_envelope', cause);
  }

  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
