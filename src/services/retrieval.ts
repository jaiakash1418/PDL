import type { QueryMessage, SourceRef, Conflict, User } from '../lib/types';
import { TfIdfIndex, bestSnippet, extractMeasurements, tokenize, type ScoredResult } from '../lib/text';
import { getChunks, listDocuments } from './documents';
import { uid, now, periodLabel } from '../lib/util';
import { getConflicts } from './conflicts';
import { generateAnswer, isAiConfigured } from './ai';

export const NO_EVIDENCE_MESSAGE =
  'No verified record found in the available documents.';

export const LOCAL_MODE_LABEL = 'Local Document Search (Demo)';

export interface EvidenceItem {
  docId: string;
  docName: string;
  pageNo: number;
  section?: string;
  snippet: string;
  score: number;
  matchedTerms: string[];
}

interface IndexCache {
  index: TfIdfIndex;
  chunkMeta: Map<string, { docId: string; pageNo: number; section?: string; text: string }>;
  docNames: Map<string, string>;
  builtAt: number;
}

let cache: IndexCache | null = null;

export function invalidateRetrievalIndex(): void {
  cache = null;
}

async function getCache(): Promise<IndexCache> {
  if (cache) return cache;
  const [chunks, docs] = await Promise.all([getChunks(), listDocuments()]);
  const index = new TfIdfIndex();
  const chunkMeta = new Map<string, { docId: string; pageNo: number; section?: string; text: string }>();
  const docNames = new Map<string, string>();
  for (const d of docs) docNames.set(d.id, d.fileName);
  for (const c of chunks) {
    index.add({ id: c.id, tokens: c.tokens, meta: { docId: c.docId, pageNo: c.pageNo } });
    chunkMeta.set(c.id, { docId: c.docId, pageNo: c.pageNo, section: c.section, text: c.text });
  }
  cache = { index, chunkMeta, docNames, builtAt: now() };
  return cache;
}

export interface RetrievalFilters {
  docIds?: string[];
  periods?: string[];
  categories?: string[];
}

export async function retrieveEvidence(query: string, filters?: RetrievalFilters, topK = 10): Promise<EvidenceItem[]> {
  const c = await getCache();
  const results: ScoredResult[] = c.index.search(query, topK * 3);
  const filtered = filterResults(results, c, filters).slice(0, topK);
  return filtered.map((r) => {
    const meta = c.chunkMeta.get(r.id)!;
    return {
      docId: meta.docId,
      docName: c.docNames.get(meta.docId) ?? 'Unknown document',
      pageNo: meta.pageNo,
      section: meta.section,
      snippet: bestSnippet(meta.text, query),
      score: Math.round(r.score * 100) / 100,
      matchedTerms: r.terms,
    };
  });
}

function filterResults(results: ScoredResult[], c: IndexCache, filters?: RetrievalFilters): ScoredResult[] {
  if (!filters) return results;
  const docSet = filters.docIds && filters.docIds.length ? new Set(filters.docIds) : null;
  if (!docSet) return results;
  return results.filter((r) => {
    const meta = c.chunkMeta.get(r.id);
    return meta ? docSet.has(meta.docId) : false;
  });
}

export function toCitations(evidence: EvidenceItem[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const e of evidence) {
    const key = `${e.docId}:${e.pageNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ docId: e.docId, docName: e.docName, section: e.section, pageNo: e.pageNo, snippet: e.snippet });
  }
  return out;
}

const COMPARATIVE_HINTS = ['compare', 'comparison', 'versus', 'vs', 'trend', 'across', 'period', 'monthly', 'figures', 'totals', 'summary', 'summarize', 'list'];

function isComparative(query: string): boolean {
  const t = new Set(tokenize(query));
  return COMPARATIVE_HINTS.some((h) => t.has(h));
}

function buildStructured(query: string, evidence: EvidenceItem[]): { columns: string[]; rows: string[][] } | undefined {
  if (!isComparative(query)) return undefined;
  const rows: string[][] = [];
  const seen = new Set<string>();
  for (const e of evidence) {
    const measurements = extractMeasurements(e.snippet.length > 40 ? e.snippet : '');
    for (const m of measurements) {
      const key = `${e.docName}|${m.raw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push([e.docName, `Page ${e.pageNo}`, m.raw]);
    }
  }
  if (rows.length === 0) return undefined;
  return { columns: ['Document', 'Location', 'Value'], rows: rows.slice(0, 25) };
}

async function relatedConflicts(query: string): Promise<Conflict[]> {
  const conflicts = await getConflicts();
  if (conflicts.length === 0) return [];
  const q = new Set(tokenize(query));
  return conflicts.filter((c) => {
    const ct = tokenize(`${c.entity} ${c.metric}`);
    return ct.some((t) => q.has(t));
  });
}

export interface AnswerOptions {
  filters?: RetrievalFilters;
  mode?: 'local' | 'ai';
}

export async function answerQuery(query: string, opts: AnswerOptions = {}): Promise<QueryMessage> {
  const q = query.trim();
  const evidence = await retrieveEvidence(q, opts.filters);
  const citations = toCitations(evidence);
  const conflicts = await relatedConflicts(q);
  const limitations: string[] = [];

  if (evidence.length === 0) {
    if (opts.filters && (opts.filters.docIds?.length || opts.filters.periods?.length)) {
      limitations.push('Filters were applied; no matching indexed content was found within the selected scope.');
    }
    if ((await getCache()).index.size === 0) {
      limitations.push('No indexed documents are available yet. Upload or seed documents before querying.');
    }
    return {
      id: uid('msg'), role: 'assistant', content: NO_EVIDENCE_MESSAGE, at: now(),
      mode: 'local', citations: [], coverage: 0, noEvidence: true, limitations, conflicts: [],
    };
  }

  let mode: 'local' | 'ai' = 'local';
  let content: string;

  if (opts.mode !== 'local' && isAiConfigured()) {
    const ai = await generateAnswer(q, evidence);
    if (ai.ok) { content = ai.text; mode = 'ai'; }
    else { content = synthesizeExtractive(q, evidence); limitations.push(`AI provider call failed (${ai.error}); fell back to local extractive search.`); }
  } else {
    content = synthesizeExtractive(q, evidence);
    if (!isAiConfigured()) {
      limitations.push('Running in Local Document Search mode. No generative AI provider is configured; the response is assembled extractively from matched passages and their citations are authoritative.');
    }
  }

  const structured = buildStructured(q, evidence);
  if (conflicts.length) limitations.push(`${conflicts.length} unresolved conflicting record(s) relate to this query. Both values are shown; no value has been silently selected.`);

  return {
    id: uid('msg'), role: 'assistant', content, at: now(), mode,
    citations, coverage: undefined, noEvidence: false, limitations, conflicts, structured,
  };
}

export function synthesizeExtractive(query: string, evidence: EvidenceItem[]): string {
  const docCount = new Set(evidence.map((e) => e.docId)).size;
  const lead = `Retrieved ${evidence.length} relevant passage${evidence.length === 1 ? '' : 's'} from ${docCount} document${docCount === 1 ? '' : 's'} in the indexed corpus. The findings below are quoted from, or directly supported by, the cited sources:`;
  const bullets = evidence.slice(0, 6).map((e, i) => {
    const loc = `${e.docName}${e.section ? ' → ' + e.section : ''} → Page ${e.pageNo}`;
    return `${i + 1}. "${e.snippet}" — ${loc}`;
  });
  return [lead, '', ...bullets].join('\n');
}

export function coverageOf(citations: SourceRef[], claims: { sourceRefs: SourceRef[] }[]): number | null {
  if (claims.length === 0) return null;
  const supported = claims.filter((c) => c.sourceRefs.length > 0).length;
  return Math.round((supported / claims.length) * 1000) / 10;
}

export async function corpusSummary(): Promise<{ documents: number; chunks: number; periods: string[] }> {
  const c = await getCache();
  const docs = await listDocuments();
  const periods = [...new Set(docs.map((d) => d.reportingPeriod).filter(Boolean))].sort();
  return { documents: docs.length, chunks: c.index.size, periods: periods.map(periodLabel) };
}
