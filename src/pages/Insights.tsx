import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { AlertCircle, LineChart as LineChartIcon, TrendingUp } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { getInsights, type InsightsFilters } from '../services/insights';
import { Badge, Button, Card, CardHead, EmptyState, LoadError, Spinner } from '../components/ui';

const PALETTE = ['#0d9488', '#f59e0b', '#6366f1', '#ef4444', '#0891b2', '#a855f7'];

export function Insights() {
  const dataVersion = useStore((s) => s.dataVersion);
  const [categories, setCategories] = useState<string[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [scope, setScope] = useState('');

  const filters: InsightsFilters = useMemo(() => ({
    categories: categories.length ? categories : undefined,
    periods: periods.length ? periods : undefined,
    scope: scope || undefined,
  }), [categories, periods, scope]);

  const { data, loading, error, reload } = useAsync(async () => getInsights(filters, 6), [dataVersion, categories.join(','), periods.join(','), scope]);

  const toggle = (list: string[], value: string, setter: (v: string[]) => void) =>
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.periods.map((p, i) => {
      const row: Record<string, string | number | null> = { label: data.series[0]?.points[i]?.label ?? p };
      for (const s of data.series) row[s.metric] = s.points[i]?.value ?? null;
      return row;
    });
  }, [data]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Historical Insights</h2>
          <p className="sub">Trends computed strictly from stored records. Missing periods appear as gaps — they are never filled with zero or estimated values.</p>
        </div>
      </div>

      <Card>
        <div className="card__body stack">
          <div>
            <div className="field-label">Categories</div>
            <div className="row gap-8 wrap">
              {(data?.categories ?? []).map((c) => (
                <button key={c} className={categories.includes(c) ? 'chip active' : 'chip'} onClick={() => toggle(categories, c, setCategories)}>{c}</button>
              ))}
              {categories.length > 0 && <Button size="sm" variant="ghost" onClick={() => setCategories([])}>Clear</Button>}
            </div>
          </div>
          <div>
            <div className="field-label">Reporting periods</div>
            <div className="row gap-8 wrap">
              {(data?.allPeriods ?? []).map((p) => (
                <button key={p} className={periods.includes(p) ? 'chip active' : 'chip'} onClick={() => toggle(periods, p, setPeriods)}>{p}</button>
              ))}
              {periods.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPeriods([])}>Clear</Button>}
            </div>
          </div>
          <div className="row gap-12 wrap">
            <label className="field" style={{ maxWidth: 320 }}>
              <span className="field-label">Scope (subsidiary)</span>
              <select className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="">All scopes</option>
                {(data?.scopes ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div className="grow" />
            {data && <span className="small muted">{data.totalRecords} metric record(s) · top {data.series.length} metrics by period coverage</span>}
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="spin-overlay"><Spinner /> Computing trends…</div>
      ) : error ? (
        <Card><div className="card__body"><LoadError message={error} onRetry={reload} /></div></Card>
      ) : !data || data.series.length === 0 ? (
        <EmptyState icon={<LineChartIcon size={28} />} title="Not enough records" description="No metric records match the selected filters. Adjust the filters or upload documents containing figures." />
      ) : (
        <>
          <Card>
            <CardHead title="Trend by reporting period" sub="Gaps indicate periods with no recorded value" />
            <div className="card__body">
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 13, fill: 'var(--ink-500)' }} stroke="var(--border-strong)" />
                    <YAxis tick={{ fontSize: 13, fill: 'var(--ink-500)' }} stroke="var(--border-strong)" />
                    <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13.5 }} />
                    <Legend wrapperStyle={{ fontSize: 13 }} />
                    {data.series.map((s, i) => (
                      <Line key={s.metric} type="monotone" dataKey={s.metric} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} connectNulls={false} dot={{ r: 3 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Recorded values" sub={'An em dash (—) marks a period with no recorded value'} right={<TrendingUp size={15} className="muted" />} />
            <div className="table-wrap">
              <table className="data">
                <thead><tr>{data.table.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.table.rows.map((r, i) => (
                    <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 ? 'small strong' : 'small mono'}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {data.missing.length > 0 && (
            <Card>
              <CardHead title="Missing data indicators" right={<Badge tone="warning">{data.missing.length}</Badge>} />
              <div className="card__body stack-sm">
                <div className="banner warn"><AlertCircle size={15} /><span className="small">The following metrics have at least one reporting period with no record. These gaps are reported as missing.</span></div>
                {data.missing.map((m) => (
                  <div key={m.metric} className="row-between">
                    <span className="small">{m.label}</span>
                    <Badge tone="warning">{m.count} period(s) missing</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
