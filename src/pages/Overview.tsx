import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Copy, FileStack, FileText, GitCompareArrows,
  Loader, ShieldAlert, ShieldCheck, Sparkles, UploadCloud, Activity,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { listDocuments } from '../services/documents';
import { listReports, reportStats } from '../services/reports';
import { issueStats } from '../services/validation';
import { duplicateStats } from '../services/duplicates';
import { conflictStats } from '../services/conflicts';
import { getInsights } from '../services/insights';
import { getAuditEvents } from '../services/audit';
import { Badge, Button, Card, CardHead, EmptyState, LoadError, Progress, Spinner } from '../components/ui';
import { STATUS_COLORS } from '../lib/colors';
import { fmtDate, fmtDateTime, periodLabel, relativeTime, reportTone, statusTone } from '../lib/util';

export function Overview() {
  const navigate = useNavigate();
  const dataVersion = useStore((s) => s.dataVersion);
  const settings = useStore((s) => s.settings);
  const session = useStore((s) => s.session)!;

  const { data, loading, error, reload } = useAsync(async () => {
    const [docs, reports, validation, duplicates, conflicts, insights, audit] = await Promise.all([
      listDocuments(),
      listReports(),
      issueStats(),
      duplicateStats(),
      conflictStats(),
      getInsights({}, 4),
      getAuditEvents(),
    ]);
    return { docs, reports, validation, duplicates, conflicts, insights, audit };
  }, [dataVersion]);

  const chart = useMemo(() => {
    if (!data?.insights) return { rows: [] as Record<string, string | number | null>[], metrics: [] as string[] };
    const { series } = data.insights;
    const periods = series[0]?.points.map((p) => p.label) ?? [];
    const rows = periods.map((label, i) => {
      const row: Record<string, string | number | null> = { label };
      for (const s of series) row[s.metric] = s.points[i]?.value ?? null;
      return row;
    });
    return { rows, metrics: series.map((s) => s.metric) };
  }, [data]);

  if (error) {
    return <Card><div className="card__body"><LoadError message={error} onRetry={reload} /></div></Card>;
  }
  if (loading || !data) {
    return <div className="spin-overlay"><Spinner size="lg" /> Loading overview…</div>;
  }

  const processingQueue = data.docs.filter((d) => d.status === 'Processing' || d.status === 'Uploaded' || d.status === 'Failed');
  const recentDocs = data.docs.slice(0, 6);
  const recentReports = [...data.reports].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  const pendingReviews = data.reports.filter((r) => r.status === 'Pending Review');
  const recentAudit = [...data.audit].slice(-6).reverse();
  const totalPages = data.docs.reduce((n, d) => n + d.pageCount, 0);

  const stats = [
    { id: 'docs', label: 'Total Documents', value: data.docs.length, icon: <FileStack size={18} />, foot: `${totalPages} pages indexed`, to: '/app/documents' },
    { id: 'queue', label: 'Processing Queue', value: processingQueue.length, icon: <Loader size={18} />, foot: `${data.docs.filter((d) => d.status === 'Indexed').length} indexed`, to: '/app/documents?status=queue' },
    { id: 'reports', label: 'Generated Reports', value: data.reports.length, icon: <FileText size={18} />, foot: `${pendingReviews.length} pending review`, to: '/app/reports' },
    { id: 'validation', label: 'Pending Validations', value: data.validation.open, icon: <ShieldCheck size={18} />, foot: `${data.validation.total} total issues`, to: '/app/validation?status=Open' },
    { id: 'dupes', label: 'Potential Duplicates', value: data.duplicates.pending, icon: <Copy size={18} />, foot: `${data.duplicates.confirmed} confirmed`, to: '/app/duplicates?status=Pending' },
    { id: 'conflicts', label: 'Unresolved Conflicts', value: data.conflicts.unresolved, icon: <GitCompareArrows size={18} />, foot: `${data.conflicts.resolved} resolved`, to: '/app/conflicts?status=Unresolved' },
  ];

  return (
    <div className="stack-lg">
      <div className="row-between wrap gap-12">
        <div>
          <h2>Good to see you, {session.name.split(' ').slice(-1)[0]}.</h2>
          <p className="muted small mt-4">
            Workspace scope: <strong>{settings?.subsidiary}</strong> · All figures derive from stored records or clearly
            labelled synthetic seed data.
          </p>
        </div>
        <div className="row gap-8 wrap">
          <Button icon={<UploadCloud size={16} />} onClick={() => navigate('/app/upload')}>Upload Document</Button>
          <Button icon={<Sparkles size={16} />} onClick={() => navigate('/app/query')}>Ask AI</Button>
          <Button variant="navy" icon={<FileText size={16} />} onClick={() => navigate('/app/reports')}>Generate Report</Button>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map((s) => (
          <button key={s.id} className="stat-card" onClick={() => navigate(s.to)}>
            <span className="stat-card__icon">{s.icon}</span>
            <span className="stat-card__value">{s.value}</span>
            <span className="stat-card__label">{s.label}</span>
            <span className="stat-card__foot">{s.foot} <ArrowUpRight size={12} /></span>
          </button>
        ))}
      </div>

      <div className="grid-dash">
        <Card>
          <CardHead
            title="Historical production trend"
            sub="Derived from normalised metric records across reporting periods. Gaps indicate missing data, not zero."
            right={<Button size="sm" variant="ghost" onClick={() => navigate('/app/insights')}>Open insights</Button>}
          />
          <div className="card__body">
            {chart.metrics.length === 0 ? (
              <EmptyState title="No metric records yet" description="Upload or seed documents containing labelled metric values to populate trends." />
            ) : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart.rows} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12.5, fill: 'var(--ink-500)' }} stroke="var(--border-strong)" />
                    <YAxis tick={{ fontSize: 12.5, fill: 'var(--ink-500)' }} stroke="var(--border-strong)" width={48} />
                    <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13.5 }} />
                    <Legend wrapperStyle={{ fontSize: 12.5 }} />
                    {chart.metrics.map((m, i) => (
                      <Line key={m} type="monotone" dataKey={m} stroke={STATUS_COLORS[i % STATUS_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>

        <div className="stack">
          <Card>
            <CardHead title="Data quality overview" right={<Badge tone={data.validation.open > 0 ? 'warning' : 'success'}>{data.validation.open} open</Badge>} />
            <div className="card__body stack-sm">
              <QualityRow label="Open validation issues" value={data.validation.open} tone="warning" onClick={() => navigate('/app/validation')} />
              <QualityRow label="Reviewed" value={data.validation.reviewed} tone="info" onClick={() => navigate('/app/validation')} />
              <QualityRow label="Resolved" value={data.validation.resolved} tone="success" onClick={() => navigate('/app/validation')} />
              <QualityRow label="Unresolved conflicts" value={data.conflicts.unresolved} tone="error" onClick={() => navigate('/app/conflicts')} />
              <QualityRow label="Pending duplicate reviews" value={data.duplicates.pending} tone="warning" onClick={() => navigate('/app/duplicates')} />
              <hr className="divider mt-4" />
              <div className="row-between small muted mt-4">
                <span>Indexed documents</span>
                <strong>{data.docs.filter((d) => d.status === 'Indexed').length}/{data.docs.length}</strong>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Reviewer tasks" right={<Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => navigate('/app/tasks')}>Open queue</Button>} />
            <div className="card__body stack-sm">
              <TaskRow icon={<FileText size={15} />} label="Reports awaiting approval" count={pendingReviews.length} onClick={() => navigate('/app/tasks')} />
              <TaskRow icon={<GitCompareArrows size={15} />} label="Conflicts to resolve" count={data.conflicts.unresolved} onClick={() => navigate('/app/tasks')} />
              <TaskRow icon={<Copy size={15} />} label="Duplicate matches to confirm" count={data.duplicates.pending} onClick={() => navigate('/app/tasks')} />
              <TaskRow icon={<ShieldAlert size={15} />} label="Validation issues open" count={data.validation.open} onClick={() => navigate('/app/tasks')} />
            </div>
          </Card>
        </div>
      </div>

      <div className="grid-3">
        <Card>
          <CardHead title="Recent document activity" right={<Button size="sm" variant="ghost" onClick={() => navigate('/app/documents')}>View all</Button>} />
          <div className="card__body tight">
            {recentDocs.length === 0 && <EmptyState title="No documents" description="Upload a document to get started." />}
            {recentDocs.map((d) => (
              <button key={d.id} className="dropdown__item" onClick={() => navigate(`/app/documents/${d.id}`)}>
                <span className="file-icon" style={{ width: 28, height: 28 }}><FileStack size={14} /></span>
                <span className="grow col" style={{ alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                  <span className="small strong truncate" style={{ maxWidth: 260 }}>{d.fileName}</span>
                  <span className="xsmall muted">{periodLabel(d.reportingPeriod)} · {relativeTime(d.uploadedAt)}</span>
                </span>
                <Badge tone={statusTone(d.status)}>{d.status}</Badge>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Processing queue" sub="Pipeline: Upload → Extract → Normalise → Index" />
          <div className="card__body stack-sm">
            {processingQueue.length === 0 && (
              <div className="banner success"><CheckCircle2 size={15} /> <span>All documents are indexed. No items require processing.</span></div>
            )}
            {processingQueue.slice(0, 6).map((d) => (
              <div key={d.id} className="col gap-4">
                <div className="row-between">
                  <span className="small strong truncate" style={{ maxWidth: 220 }}>{d.fileName}</span>
                  <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                </div>
                <Progress value={d.status === 'Indexed' ? 100 : d.status === 'Processing' ? 60 : d.status === 'Failed' ? 100 : 25} tone={d.status === 'Processing' ? 'proc' : undefined} />
              </div>
            ))}
            {processingQueue.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => navigate('/app/upload')}>Open upload & processing</Button>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Recently generated reports" right={<Button size="sm" variant="ghost" onClick={() => navigate('/app/reports')}>View all</Button>} />
          <div className="card__body tight">
            {recentReports.length === 0 && <EmptyState title="No reports yet" description="Generate a report from indexed records." action={<Button size="sm" onClick={() => navigate('/app/reports')}>Generate report</Button>} />}
            {recentReports.map((r) => (
              <button key={r.id} className="dropdown__item" onClick={() => navigate(`/app/reports/${r.id}`)}>
                <span className="file-icon" style={{ width: 28, height: 28 }}><FileText size={14} /></span>
                <span className="grow col" style={{ alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                  <span className="small strong truncate" style={{ maxWidth: 240 }}>{r.title}</span>
                  <span className="xsmall muted">{r.type} · {periodLabel(r.reportingPeriod)} · {relativeTime(r.updatedAt)}</span>
                </span>
                <Badge tone={reportTone(r.status)}>{r.status}</Badge>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHead
          title="Recent audit events"
          sub="Hash-chained activity log"
          right={<Button size="sm" variant="ghost" icon={<Activity size={14} />} onClick={() => navigate('/app/audit')}>Audit trail</Button>}
        />
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Resource</th><th>Integrity</th></tr>
            </thead>
            <tbody>
              {recentAudit.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap small muted">{fmtDateTime(e.at)}</td>
                  <td className="small">{e.actorName} <span className="dim">({e.actorRole})</span></td>
                  <td><span className="mono xsmall">{e.action}</span></td>
                  <td className="small truncate" style={{ maxWidth: 240 }}>{e.resourceName ?? e.resourceType}</td>
                  <td><span className="mono xsmall dim">{e.hash.slice(0, 10)}…</span></td>
                </tr>
              ))}
              {recentAudit.length === 0 && <tr><td colSpan={5}><EmptyState title="No audit events yet" /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function QualityRow({ label, value, tone, onClick }: { label: string; value: number; tone: string; onClick: () => void }) {
  return (
    <button className="row-between" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0', width: '100%' }} onClick={onClick}>
      <span className="small" style={{ color: 'var(--ink-600)' }}>{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </button>
  );
}

function TaskRow({ icon, label, count, onClick }: { icon: React.ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <button className="row-between" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', width: '100%' }} onClick={onClick}>
      <span className="row gap-8 small" style={{ color: 'var(--ink-700)' }}>{icon}{label}</span>
      <span className={count > 0 ? 'badge badge-warning' : 'badge badge-neutral'}>{count}</span>
    </button>
  );
}
