// Minimal, dependency-free diffing used by the report version comparison.
// Produces paragraph-aligned rows with inline word-level changes so reviewers
// can see exactly what editing changed between two saved versions.

export type DiffOp = 'same' | 'add' | 'del';

export interface DiffSegment {
  type: DiffOp;
  text: string;
}

export interface ParagraphDiffRow {
  type: DiffOp;
  left?: string;
  right?: string;
  inline?: DiffSegment[];
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function tokenizeWords(s: string): string[] {
  return s.match(/\s+|[^\s]+/g) ?? [];
}

function lcsLengths<T>(a: T[], b: T[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

function diffTokens<T>(a: T[], b: T[]): { type: DiffOp; value: T }[] {
  const dp = lcsLengths(a, b);
  const out: { type: DiffOp; value: T }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', value: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', value: a[i] });
      i++;
    } else {
      out.push({ type: 'add', value: b[j] });
      j++;
    }
  }
  while (i < a.length) out.push({ type: 'del', value: a[i++] });
  while (j < b.length) out.push({ type: 'add', value: b[j++] });
  return out;
}

export function diffWords(a: string, b: string): DiffSegment[] {
  return diffTokens(tokenizeWords(a), tokenizeWords(b)).map((s) => ({ type: s.type, text: s.value as string }));
}

// Aligns two blocks of text line-by-line. Adjacent removed/added paragraphs are
// paired into a single "changed" row carrying an inline word diff.
export function diffParagraphs(a: string, b: string): ParagraphDiffRow[] {
  const pa = splitParagraphs(a);
  const pb = splitParagraphs(b);
  const ops = diffTokens(pa, pb);
  const rows: ParagraphDiffRow[] = [];

  let dels: string[] = [];
  let adds: string[] = [];

  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      const left = dels[k];
      const right = adds[k];
      if (left !== undefined && right !== undefined) {
        rows.push({ type: 'same', left, right, inline: diffWords(left, right) });
      } else if (left !== undefined) {
        rows.push({ type: 'del', left });
      } else if (right !== undefined) {
        rows.push({ type: 'add', right });
      }
    }
    dels = [];
    adds = [];
  };

  for (const op of ops) {
    if (op.type === 'del') {
      if (adds.length) flush();
      dels.push(op.value);
    } else if (op.type === 'add') {
      if (dels.length) flush();
      adds.push(op.value);
    } else {
      flush();
      rows.push({ type: 'same', left: op.value, right: op.value });
    }
  }
  flush();
  return rows;
}

export function hasChanges(rows: ParagraphDiffRow[]): boolean {
  return rows.some((r) => r.type !== 'same');
}
