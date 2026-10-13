import type { MetricRecord } from './metrics';
import { collectMetricRecords } from './metrics';
import { listDocuments } from './documents';
import { periodLabel, periodSortKey } from '../lib/util';
import type { DocumentRecord } from '../lib/types';

export interface InsightsFilters {
  categories?: string[];
  periods?: string[];
  scope?: string;
}

export interface TrendPoint {
  period: string;
  label: string;
  value: number | null;
}

export interface MetricSeries {
  metric: string;
  unit: string;
  points: TrendPoint[];
  missingCount: number;
}

export interface InsightsResult {
  metrics: string[];
  periods: string[];
  series: MetricSeries[];
  table: { headers: string[]; rows: string[][] };
  categories: string[];
  scopes: string[];
  allPeriods: string[];
  totalRecords: number;
  missing: { label: string; metric: string; count: number }[];
}

export async function getInsightOptions(): Promise<{ categories: string[]; scopes: string[]; periods: string[] }> {
  const docs = await listDocuments();
  const categories = [...new Set(docs.map((d) => d.category))].sort();
  const scopes = [...new Set(docs.map((d) => d.subsidiary))].sort();
  const periods = [...new Set(docs.map((d) => d.reportingPeriod).filter(Boolean))].sort((a, b) => periodSortKey(a) - periodSortKey(b));
  return { categories, scopes, periods };
}

function recordsFor(records: MetricRecord[], docs: DocumentRecord[], filters: InsightsFilters): MetricRecord[] {
  const docMap = new Map(docs.map((d) => [d.id, d]));
  return records.filter((r) => {
    const doc = docMap.get(r.docId);
    if (!doc) return false;
    if (filters.categories?.length && !filters.categories.includes(doc.category)) return false;
    if (filters.periods?.length && !filters.periods.includes(r.period)) return false;
    if (filters.scope && r.subsidiary !== filters.scope) return false;
    return true;
  });
}

// Charts derive strictly from stored records. Missing periods are shown as null
// (a gap) and are never coerced to zero.
export async function getInsights(filters: InsightsFilters = {}, maxMetrics = 6): Promise<InsightsResult> {
  const docs = await listDocuments();
  const all = await collectMetricRecords(docs);
  const records = recordsFor(all, docs, filters);

  const options = await getInsightOptions();

  const periodSet = new Set(records.map((r) => r.period));
  const periods = [...periodSet].sort((a, b) => periodSortKey(a) - periodSortKey(b));

  // Rank metrics by number of distinct periods covered.
  const byMetric = new Map<string, MetricRecord[]>();
  for (const r of records) {
    const arr = byMetric.get(r.label) ?? [];
    arr.push(r);
    byMetric.set(r.label, arr);
  }
  const ranked = [...byMetric.entries()].sort((a, b) => {
    const da = new Set(a[1].map((r) => r.period)).size;
    const db = new Set(b[1].map((r) => r.period)).size;
    return db - da;
  });
  const chosen = ranked.slice(0, maxMetrics);

  const series: MetricSeries[] = chosen.map(([metric, recs]) => {
    const byPeriod = new Map<string, number>();
    for (const r of recs) if (!byPeriod.has(r.period)) byPeriod.set(r.period, r.value);
    const points: TrendPoint[] = periods.map((p) => ({
      period: p,
      label: periodLabel(p),
      value: byPeriod.has(p) ? byPeriod.get(p)! : null,
    }));
    const missingCount = points.filter((p) => p.value === null).length;
    return { metric, unit: recs[0]?.unit ?? '', points, missingCount };
  });

  const headers = ['Metric', 'Unit', ...periods.map(periodLabel)];
  const tableRows = chosen.map(([metric, recs]) => {
    const byPeriod = new Map<string, string>();
    for (const r of recs) if (!byPeriod.has(r.period)) byPeriod.set(r.period, r.raw);
    return [metric, recs[0]?.unit ?? '', ...periods.map((p) => byPeriod.get(p) ?? '—')];
  });

  return {
    metrics: chosen.map(([m]) => m),
    periods,
    series,
    table: { headers, rows: tableRows },
    categories: options.categories,
    scopes: options.scopes,
    allPeriods: options.periods,
    totalRecords: records.length,
    missing: series.map((s) => ({ label: s.metric, metric: s.metric, count: s.missingCount })).filter((m) => m.count > 0),
  };
}
