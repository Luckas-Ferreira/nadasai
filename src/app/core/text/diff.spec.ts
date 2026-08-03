import { AppError } from '../errors';
import { MAX_DIFF_LINES, diffLines, splitLines, toUnifiedDiff } from './diff';

describe('diffLines', () => {
  const texts = (r: ReturnType<typeof diffLines>) => r.lines.map((l) => `${l.type[0]}${l.text}`);

  it('reports identical inputs as entirely unchanged', () => {
    const r = diffLines(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(r.stats).toEqual({ added: 0, removed: 0, unchanged: 3 });
  });

  it('handles a pure insertion', () => {
    const r = diffLines(['a', 'c'], ['a', 'b', 'c']);
    expect(texts(r)).toEqual(['ua', 'ab', 'uc']);
    expect(r.stats.added).toBe(1);
    expect(r.stats.removed).toBe(0);
  });

  it('handles a pure deletion', () => {
    const r = diffLines(['a', 'b', 'c'], ['a', 'c']);
    expect(texts(r)).toEqual(['ua', 'rb', 'uc']);
    expect(r.stats.removed).toBe(1);
    expect(r.stats.added).toBe(0);
  });

  it('handles a replacement in the middle', () => {
    const r = diffLines(['a', 'b', 'c'], ['a', 'x', 'c']);
    expect(r.stats.added).toBe(1);
    expect(r.stats.removed).toBe(1);
    expect(r.stats.unchanged).toBe(2);
    expect(r.lines[0].text).toBe('a');
    expect(r.lines[r.lines.length - 1].text).toBe('c');
  });

  it('handles an empty side', () => {
    expect(diffLines([], ['a', 'b']).stats).toEqual({ added: 2, removed: 0, unchanged: 0 });
    expect(diffLines(['a', 'b'], []).stats).toEqual({ added: 0, removed: 2, unchanged: 0 });
    expect(diffLines([], []).lines).toEqual([]);
  });

  it('numbers lines on both sides', () => {
    const r = diffLines(['a', 'b'], ['a', 'x', 'b']);
    const added = r.lines.find((l) => l.type === 'added');
    expect(added?.leftNo).toBeNull();
    expect(added?.rightNo).toBe(2);

    const last = r.lines[r.lines.length - 1];
    expect(last.leftNo).toBe(2);
    expect(last.rightNo).toBe(3);
  });

  it('honours ignoreWhitespace and ignoreCase without altering the text shown', () => {
    const r = diffLines(['Hello   World'], ['hello world'], { ignoreWhitespace: true, ignoreCase: true });
    expect(r.stats.unchanged).toBe(1);
    // The comparison is normalised; what the user sees is not.
    expect(r.lines[0].text).toBe('Hello   World');
  });

  it('refuses inputs past the line limit', () => {
    const huge = new Array(MAX_DIFF_LINES + 1).fill('x');
    expect(() => diffLines(huge, ['a'])).toThrowMatching(
      (e: unknown) => e instanceof AppError && e.code === 'text_too_large',
    );
  });

  it('diffs 5000x5000 lines quickly — the O(m*n) regression test', () => {
    // The previous implementation allocated a full DP table here (25M boxed
    // numbers) and froze the tab. With prefix/suffix trimming this is a handful
    // of lines of real work.
    const a = Array.from({ length: 5000 }, (_, i) => `line ${i}`);
    const b = a.slice();
    b[2500] = 'changed';

    const started = performance.now();
    const r = diffLines(a, b);
    const elapsed = performance.now() - started;

    expect(r.stats.added).toBe(1);
    expect(r.stats.removed).toBe(1);
    expect(r.stats.unchanged).toBe(4999);
    expect(elapsed).toBeLessThan(1000);
  });

  it('stays linear when the two sides share nothing', () => {
    const a = Array.from({ length: 400 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 400 }, (_, i) => `b${i}`);
    const r = diffLines(a, b);
    expect(r.stats.added).toBe(400);
    expect(r.stats.removed).toBe(400);
    expect(r.stats.unchanged).toBe(0);
  });
});

describe('splitLines', () => {
  it('treats CRLF as LF', () => {
    expect(splitLines('a\r\nb')).toEqual(['a', 'b']);
    expect(splitLines('a\rb')).toEqual(['a', 'b']);
  });

  it('does not fabricate a trailing empty line', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
  });

  it('keeps interior blank lines', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b']);
  });

  it('returns nothing for an empty string', () => {
    expect(splitLines('')).toEqual([]);
  });
});

describe('toUnifiedDiff', () => {
  it('marks each line and names both sides', () => {
    const patch = toUnifiedDiff(diffLines(['a', 'b'], ['a', 'c']), 'left.txt', 'right.txt');
    const lines = patch.split('\n');
    expect(lines[0]).toBe('--- left.txt');
    expect(lines[1]).toBe('+++ right.txt');
    expect(lines[2]).toMatch(/^@@ /);
    expect(patch).toContain('-b');
    expect(patch).toContain('+c');
    expect(patch).toContain(' a');
  });
});
