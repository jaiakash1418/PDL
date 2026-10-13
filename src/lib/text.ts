// Lightweight text processing: tokenisation, stop-words, TF-IDF retrieval
// primitives, and similarity. This is a real (sparse) retrieval engine used by
// the AI Query Workspace, duplicate text-similarity, and evidence extraction.
// It requires no external service.

const STOPWORDS = new Set(
  `a an and are as at be by for from has have had he her his in is it its of on or that the this to was were will with we you your they their our report reports also into over under between during within which who whom what when where why how not no but if then than so such can could may might should would shall each per all any some more most other another same these those there here been being do does did done about above below off again further once only own very s t just don now`.split(
    /\s+/,
  ),
);

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const raw = lower.match(/[a-z0-9][a-z0-9._%\-]*[a-z0-9]|[a-z0-9]/g) ?? [];
  const out: string[] = [];
  for (const t of raw) {
    const clean = t.replace(/^[._\-]+|[._\-]+$/g, '');
    if (!clean) continue;
    if (clean.length < 2 && !/\d/.test(clean)) continue;
    if (STOPWORDS.has(clean)) continue;
    out.push(clean);
  }
  return out;
}

export function keywords(text: string, limit = 8): string[] {
  const freq = new Map<string, number>();
  for (const t of tokenize(text)) freq.set(t, (freq.get(t) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([w]) => w);
}

// --- TF-IDF index ---------------------------------------------------------

export interface IndexedDoc {
  id: string;
  tokens: string[];
  meta: Record<string, unknown>;
}

export interface ScoredResult {
  id: string;
  score: number;
  terms: string[];
  meta: Record<string, unknown>;
}

export class TfIdfIndex {
  private postings = new Map<string, Map<string, number>>();
  private docLen = new Map<string, number>();
  private docs = new Map<string, IndexedDoc>();
  private N = 0;

  add(doc: IndexedDoc): void {
    if (this.docs.has(doc.id)) this.remove(doc.id);
    this.docs.set(doc.id, doc);
    this.N++;
    const counts = new Map<string, number>();
    for (const t of doc.tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    this.docLen.set(doc.id, doc.tokens.length || 1);
    for (const [term, c] of counts) {
      let p = this.postings.get(term);
      if (!p) { p = new Map(); this.postings.set(term, p); }
      p.set(doc.id, c);
    }
  }

  remove(id: string): void {
    if (!this.docs.has(id)) return;
    this.docs.delete(id);
    this.docLen.delete(id);
    this.N--;
    for (const p of this.postings.values()) p.delete(id);
  }

  has(id: string): boolean {
    return this.docs.has(id);
  }

  get size(): number {
    return this.N;
  }

  private idf(term: string): number {
    const df = this.postings.get(term)?.size ?? 0;
    return Math.log((this.N + 1) / (df + 1)) + 1;
  }

  search(query: string, topK = 8): ScoredResult[] {
    const qTerms = tokenize(query);
    if (qTerms.length === 0 || this.N === 0) return [];
    const scores = new Map<string, number>();
    const matched = new Map<string, Set<string>>();
    for (const term of qTerms) {
      const p = this.postings.get(term);
      if (!p) continue;
      const idf = this.idf(term);
      for (const [docId, tf] of p) {
        const len = this.docLen.get(docId) ?? 1;
        const norm = tf / Math.sqrt(len);
        scores.set(docId, (scores.get(docId) ?? 0) + idf * norm);
        let set = matched.get(docId);
        if (!set) { set = new Set(); matched.set(docId, set); }
        set.add(term);
      }
    }
    return [...scores.entries()]
      .map(([id, score]) => ({ id, score, terms: [...(matched.get(id) ?? [])], meta: this.docs.get(id)?.meta ?? {} }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

// --- Similarity -----------------------------------------------------------

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function cosineOnTokens(a: string[], b: string[]): number {
  const ca = new Map<string, number>();
  const cb = new Map<string, number>();
  for (const t of a) ca.set(t, (ca.get(t) ?? 0) + 1);
  for (const t of b) cb.set(t, (cb.get(t) ?? 0) + 1);
  let dot = 0;
  for (const [t, v] of ca) dot += v * (cb.get(t) ?? 0);
  const na = Math.sqrt([...ca.values()].reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt([...cb.values()].reduce((s, v) => s + v * v, 0));
  if (na === 0 || nb === 0) return 0;
  return dot / (na * nb);
}

export function similarityPercent(a: string, b: string): number {
  const s = cosineOnTokens(tokenize(a), tokenize(b));
  return Math.round(s * 1000) / 10;
}

// Extract numeric values with units from text (used by conflict + validation).
const NUM_UNIT_RE = /(\d[\d,]*\.?\d*)\s*(million tonnes|m tonnes|mt|tonnes|tonne|t|%|percent|m3|m³|kg|meters|metres|m|mm|cm|kl|litres|cubic meters)/gi;

export function extractMeasurements(text: string): { value: number; raw: string; unit: string; index: number }[] {
  const out: { value: number; raw: string; unit: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  NUM_UNIT_RE.lastIndex = 0;
  while ((m = NUM_UNIT_RE.exec(text)) !== null) {
    const num = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(num)) out.push({ value: num, raw: m[0].trim(), unit: m[2].toLowerCase(), index: m.index });
  }
  return out;
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Choose the most query-relevant sentences from a chunk for evidence snippets.
export function bestSnippet(text: string, query: string, maxLen = 260): string {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return truncate(text, maxLen);
  const qTerms = new Set(tokenize(query));
  let best = sentences[0];
  let bestScore = -1;
  for (const s of sentences) {
    const st = tokenize(s);
    let score = 0;
    for (const t of st) if (qTerms.has(t)) score++;
    const density = score / Math.sqrt(st.length || 1);
    if (density > bestScore) { bestScore = density; best = s; }
  }
  return truncate(best, maxLen);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}
