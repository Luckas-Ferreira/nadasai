import {
  DIGITS,
  LOWER,
  SYMBOLS,
  UPPER,
  alphabet,
  entropyBits,
  generatePassword,
  poolSize,
  strengthOf,
} from './entropy';

const ALL = { upper: true, lower: true, digits: true, symbols: true };

describe('entropy', () => {
  it('derives the pool size from the alphabet, so symbols count 26 and not 28', () => {
    // The component hardcoded 28 while the symbol string held 26 characters,
    // overstating the entropy of every password that included them.
    expect(SYMBOLS.length).toBe(26);
    expect(poolSize({ upper: false, lower: false, digits: false, symbols: true })).toBe(26);
    expect(poolSize(ALL)).toBe(UPPER.length + LOWER.length + DIGITS.length + SYMBOLS.length);
    expect(poolSize(ALL)).toBe(alphabet(ALL).length);
  });

  it('is zero when nothing is selected or the length is zero', () => {
    expect(entropyBits(16, { upper: false, lower: false, digits: false, symbols: false })).toBe(0);
    expect(entropyBits(0, ALL)).toBe(0);
  });

  it('computes length * log2(pool)', () => {
    expect(entropyBits(16, { upper: false, lower: true, digits: false, symbols: false }))
      .toBe(Math.round(16 * Math.log2(26)));
  });

  it('bands at exactly 40, 65 and 90 bits', () => {
    expect(strengthOf(39)).toBe('weak');
    expect(strengthOf(40)).toBe('medium');
    expect(strengthOf(64)).toBe('medium');
    expect(strengthOf(65)).toBe('strong');
    expect(strengthOf(89)).toBe('strong');
    expect(strengthOf(90)).toBe('very_strong');
  });
});

describe('generatePassword', () => {
  it('returns the requested length', () => {
    expect(generatePassword(24, ALL).length).toBe(24);
    expect(generatePassword(1, ALL).length).toBe(1);
  });

  it('returns nothing when no class is selected', () => {
    expect(generatePassword(16, { upper: false, lower: false, digits: false, symbols: false })).toBe('');
    expect(generatePassword(0, ALL)).toBe('');
  });

  it('uses only characters from the selected classes', () => {
    const flags = { upper: false, lower: true, digits: true, symbols: false };
    const pool = alphabet(flags);
    for (const ch of generatePassword(64, flags)) expect(pool).toContain(ch);
  });

  it('includes at least one character from every selected class', () => {
    // Without this, "include digits" could return a password with no digit and
    // the entropy readout beside it would be wrong.
    for (let i = 0; i < 40; i++) {
      const pw = generatePassword(8, ALL);
      expect(pw.split('').some((c) => UPPER.includes(c))).toBe(true);
      expect(pw.split('').some((c) => LOWER.includes(c))).toBe(true);
      expect(pw.split('').some((c) => DIGITS.includes(c))).toBe(true);
      expect(pw.split('').some((c) => SYMBOLS.includes(c))).toBe(true);
    }
  });

  it('does not overshoot when the length is under the number of classes', () => {
    expect(generatePassword(2, ALL).length).toBe(2);
  });

  it('draws roughly uniformly — catches a reintroduced modulo bias', () => {
    const flags = { upper: false, lower: false, digits: true, symbols: false };
    const counts = new Map<string, number>();
    const draws = 20_000;
    for (const ch of generatePassword(draws, flags)) counts.set(ch, (counts.get(ch) ?? 0) + 1);

    const expected = draws / DIGITS.length;
    for (const digit of DIGITS) {
      // Wide enough not to flake, tight enough that a skewed generator fails.
      expect(counts.get(digit) ?? 0).toBeGreaterThan(expected * 0.8);
      expect(counts.get(digit) ?? 0).toBeLessThan(expected * 1.2);
    }
  });
});
