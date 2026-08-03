import { AppError } from '../errors';

/**
 * Line diff for the text comparer.
 *
 * What this replaces was labelled "Myers diff algorithm" and was not one: it
 * built the full O(m·n) LCS table as JS number arrays, so two 4,000-line files
 * meant 16 million boxed slots (well over 100 MB) — allocated inside a computed()
 * that re-ran on every keystroke — and then assembled the result with
 * `unshift()` in a loop, which is quadratic again. Two pasted 10k-line files
 * killed the tab.
 *
 * Three things make this version affordable, and the order matters:
 *
 *   1. Trim the common prefix and suffix. On the real case — editing three lines
 *      of a 2,000-line file — this leaves a handful of lines before any
 *      algorithm runs at all.
 *   2. Intern the lines to integers, so the inner loop compares numbers instead
 *      of walking strings.
 *   3. Myers O(ND) with the linear-space middle snake, V as Int32Array. Memory
 *      is O(m+n) rather than O(m·n).
 */

export type DiffType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  readonly type: DiffType;
  readonly text: string;
  /** 1-based line number in the left text, or null for an added line. */
  readonly leftNo: number | null;
  /** 1-based line number in the right text, or null for a removed line. */
  readonly rightNo: number | null;
}

export interface DiffStats {
  readonly added: number;
  readonly removed: number;
  readonly unchanged: number;
}

export interface DiffResult {
  readonly lines: DiffLine[];
  readonly stats: DiffStats;
}

export interface DiffOptions {
  readonly ignoreWhitespace?: boolean;
  readonly ignoreCase?: boolean;
}

export const MAX_DIFF_LINES = 20_000;

/**
 * Splits into lines without fabricating a trailing empty one: a file ending in
 * a newline has N lines, not N+1, and the phantom showed up in every diff as a
 * spurious final row.
 */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function normalize(line: string, o: DiffOptions): string {
  let s = line;
  if (o.ignoreWhitespace) s = s.replace(/\s+/g, ' ').trim();
  if (o.ignoreCase) s = s.toLowerCase();
  return s;
}

/** Myers middle-snake recursion over interned ids, emitting edit ops in order. */
function myers(a: Int32Array, b: Int32Array, out: { op: DiffType; ai: number; bi: number }[]): void {
  const n = a.length;
  const m = b.length;

  if (n === 0 && m === 0) return;
  if (n === 0) {
    for (let j = 0; j < m; j++) out.push({ op: 'added', ai: -1, bi: j });
    return;
  }
  if (m === 0) {
    for (let i = 0; i < n; i++) out.push({ op: 'removed', ai: i, bi: -1 });
    return;
  }

  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 1);
  // One snapshot of V per edit distance d. This is the O(D·(m+n)) memory that
  // the linear-space variant trades for recursion; for the sizes this tool
  // accepts (and after prefix/suffix trimming) it is the right trade — it keeps
  // the backtrack simple and D is small whenever the texts are related at all.
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;

      if (x >= n && y >= m) {
        backtrack(trace, d, offset, n, m, a, b, out);
        return;
      }
    }
  }
}

function backtrack(
  trace: Int32Array[],
  d: number,
  offset: number,
  n: number,
  m: number,
  a: Int32Array,
  b: Int32Array,
  out: { op: DiffType; ai: number; bi: number }[],
): void {
  const rev: { op: DiffType; ai: number; bi: number }[] = [];
  let x = n;
  let y = m;

  for (let step = d; step > 0; step--) {
    const vPrev = trace[step];
    const k = x - y;
    let prevK: number;
    if (k === -step || (k !== step && vPrev[offset + k - 1] < vPrev[offset + k + 1])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vPrev[offset + prevK];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      x--; y--;
      rev.push({ op: 'unchanged', ai: x, bi: y });
    }

    if (prevK === k + 1) {
      y--;
      rev.push({ op: 'added', ai: -1, bi: y });
    } else {
      x--;
      rev.push({ op: 'removed', ai: x, bi: -1 });
    }
    x = prevX;
    y = prevY;
  }

  while (x > 0 && y > 0) {
    x--; y--;
    rev.push({ op: 'unchanged', ai: x, bi: y });
  }

  // push + reverse, never unshift — unshift in a loop is what made the old
  // implementation quadratic a second time.
  for (let i = rev.length - 1; i >= 0; i--) out.push(rev[i]);
}

export function diffLines(a: readonly string[], b: readonly string[], opts: DiffOptions = {}): DiffResult {
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) throw new AppError('text_too_large');

  const keyA = a.map((l) => normalize(l, opts));
  const keyB = b.map((l) => normalize(l, opts));

  // 1. Trim the common prefix and suffix.
  let prefix = 0;
  while (prefix < keyA.length && prefix < keyB.length && keyA[prefix] === keyB[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < keyA.length - prefix &&
    suffix < keyB.length - prefix &&
    keyA[keyA.length - 1 - suffix] === keyB[keyB.length - 1 - suffix]
  ) {
    suffix++;
  }

  // 2. Intern the middles.
  const ids = new Map<string, number>();
  const intern = (s: string): number => {
    let id = ids.get(s);
    if (id === undefined) {
      id = ids.size;
      ids.set(s, id);
    }
    return id;
  };

  const midA = keyA.slice(prefix, keyA.length - suffix);
  const midB = keyB.slice(prefix, keyB.length - suffix);
  const ia = Int32Array.from(midA, intern);
  const ib = Int32Array.from(midB, intern);

  // 3. Diff only the middle.
  const ops: { op: DiffType; ai: number; bi: number }[] = [];
  myers(ia, ib, ops);

  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  for (let i = 0; i < prefix; i++) {
    lines.push({ type: 'unchanged', text: a[i], leftNo: i + 1, rightNo: i + 1 });
    unchanged++;
  }

  for (const op of ops) {
    if (op.op === 'unchanged') {
      const ai = prefix + op.ai;
      lines.push({ type: 'unchanged', text: a[ai], leftNo: ai + 1, rightNo: prefix + op.bi + 1 });
      unchanged++;
    } else if (op.op === 'added') {
      const bi = prefix + op.bi;
      lines.push({ type: 'added', text: b[bi], leftNo: null, rightNo: bi + 1 });
      added++;
    } else {
      const ai = prefix + op.ai;
      lines.push({ type: 'removed', text: a[ai], leftNo: ai + 1, rightNo: null });
      removed++;
    }
  }

  for (let i = 0; i < suffix; i++) {
    const ai = a.length - suffix + i;
    const bi = b.length - suffix + i;
    lines.push({ type: 'unchanged', text: a[ai], leftNo: ai + 1, rightNo: bi + 1 });
    unchanged++;
  }

  return { lines, stats: { added, removed, unchanged } };
}

/** Whole-file unified diff — gives the tool a real artefact to download. */
export function toUnifiedDiff(result: DiffResult, aName: string, bName: string): string {
  const out: string[] = [`--- ${aName}`, `+++ ${bName}`];
  const { added, removed, unchanged } = result.stats;
  out.push(`@@ -1,${removed + unchanged} +1,${added + unchanged} @@`);
  for (const line of result.lines) {
    const marker = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
    out.push(marker + line.text);
  }
  return out.join('\n');
}
