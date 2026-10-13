import type { DocumentRecord, PageRecord } from '../lib/types';
import { getPages, listDocuments } from './documents';

// Normalisation step: pull labelled metric/value pairs out of extracted page text.
// Recognises the canonical normalised form produced by the pipeline
// ("Raw Coal Production: 12.45 Million Tonnes") as well as common variants.

export interface MetricRecord {
  docId: string;
  docName: string;
  pageNo: number;
  section?: string;
  label: string;
  normLabel: string;
  value: number;
  unit: string;
  raw: string;
  period: string;
  subsidiary: string;
}

const METRIC_LINE_RE = /^[ \t]*([A-Za-z][A-Za-z0-9 &()/\-.%]{2,60}?)\s*[:=]\s*([\d][\d,]*(?:\.\d+)?)\s*([A-Za-z%³²°]{0,16})?[ \t]*$/gm;

const METRIC_STEMS = [
  'production', 'dispatch', 'offtake', 'overburden', 'thickness', 'output',
  'reserve', 'grade', 'ash', 'moisture', 'recovery', 'stock', 'safety',
  'incident', 'employment', 'target', 'achievement', 'seam', 'yield', 'raises',
];

const UNIT_CANON: Record<string, string> = {
  t: 't', tonne: 't', tonnes: 't', mt: 'Mt', 'm tonne': 'Mt', 'million tonnes': 'Mt', 'million tonne': 'Mt',
  '%': '%', percent: '%', m: 'm', metre: 'm', metres: 'm', meter: 'm', meters: 'm', mm: 'mm',
  'm3': 'm³', 'm³': 'm³', kl: 'kL', litre: 'kL', litres: 'kL', kg: 'kg',
};

export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeMetric(label: string): boolean {
  const n = normalizeLabel(label);
  if (n.length < 3) return false;
  return METRIC_STEMS.some((s) => n.includes(s));
}

export function canonicalUnit(unit: string): string {
  const u = unit.trim().toLowerCase();
  return UNIT_CANON[u] ?? (u || '');
}

export function extractMetricRecordsFromPage(doc: DocumentRecord, page: PageRecord): MetricRecord[] {
  const out: MetricRecord[] = [];
  const text = page.text;
  let m: RegExpExecArray | null;
  METRIC_LINE_RE.lastIndex = 0;
  while ((m = METRIC_LINE_RE.exec(text)) !== null) {
    const label = m[1].trim();
    if (!looksLikeMetric(label)) continue;
    const value = Number(m[2].replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    out.push({
      docId: doc.id,
      docName: doc.fileName,
      pageNo: page.pageNo,
      section: page.section,
      label,
      normLabel: normalizeLabel(label),
      value,
      unit: canonicalUnit(m[3] ?? ''),
      raw: `${m[2]}${m[3] ? ' ' + m[3].trim() : ''}`,
      period: doc.reportingPeriod,
      subsidiary: doc.subsidiary,
    });
  }
  return out;
}

export async function collectMetricRecords(docs?: DocumentRecord[]): Promise<MetricRecord[]> {
  const documents = docs ?? (await listDocuments());
  const records: MetricRecord[] = [];
  for (const doc of documents) {
    const pages = await getPages(doc.id);
    for (const page of pages) records.push(...extractMetricRecordsFromPage(doc, page));
  }
  return records;
}

export function groupKey(r: MetricRecord): string {
  return `${r.normLabel}|${r.period}|${r.subsidiary}`;
}
