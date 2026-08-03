import { AppError } from '../errors';
import { ARMOR_BEGIN, ARMOR_END, armor, dearmor } from './armor';

describe('armor', () => {
  const bytes = new Uint8Array(Array.from({ length: 200 }, (_, i) => i % 256));

  it('round-trips', () => {
    expect(Array.from(dearmor(armor(bytes)))).toEqual(Array.from(bytes));
  });

  it('wraps the payload at 76 columns between the markers', () => {
    const lines = armor(bytes).split('\n');
    expect(lines[0]).toBe(ARMOR_BEGIN);
    expect(lines[lines.length - 1]).toBe(ARMOR_END);
    for (const line of lines.slice(1, -1)) expect(line.length).toBeLessThanOrEqual(76);
  });

  it('handles a payload larger than the fromCharCode argument limit', () => {
    // String.fromCharCode(...bytes) throws somewhere around 100k arguments, and
    // a pasted message can get there.
    const big = new Uint8Array(300_000).map((_, i) => i % 251);
    expect(Array.from(dearmor(armor(big)))).toEqual(Array.from(big));
  });
});

describe('dearmor tolerance', () => {
  const original = new Uint8Array([1, 2, 3, 250, 251, 252]);
  const block = armor(original);

  it('survives CRLF line endings', () => {
    expect(Array.from(dearmor(block.replace(/\n/g, '\r\n')))).toEqual(Array.from(original));
  });

  it('survives surrounding prose', () => {
    const mangled = `Oi, segue o texto:\n\n${block}\n\nAbraço!`;
    expect(Array.from(dearmor(mangled))).toEqual(Array.from(original));
  });

  it('survives missing markers', () => {
    // Chat apps strip them. The payload is still recoverable.
    const bare = block.split('\n').slice(1, -1).join('\n');
    expect(Array.from(dearmor(bare))).toEqual(Array.from(original));
  });

  it('survives rewrapped lines', () => {
    expect(Array.from(dearmor(block.replace(/\n/g, '\n   ')))).toEqual(Array.from(original));
  });

  it('rejects input with no payload at all', () => {
    expect(() => dearmor('   \n  ')).toThrowMatching(
      (e: unknown) => e instanceof AppError && e.code === 'crypto_bad_envelope',
    );
  });
});
