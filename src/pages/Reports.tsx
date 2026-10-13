import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Plus, ShieldCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { generateReport, listReports, coverageBreakdown, REPORT_TYPES, SECTION_LIBRARY, type ReportConfig } from '../services/reports';
import { listDocuments } from '../services/documents';
import { getSettings } from '../services/settings';
import { Badge, Button, Card, EmptyState, Field, LoadError, Spinner } from '../components/ui';
import { Modal } from '../components/overlays';
import type { ReportType } from '../lib/types';
import { fmtPercent, periodLabel, relativeTime, reportTone } from '../lib/util';

export function Reports() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const session = useStore((s) => s.session)!;
  const pushToast = useStore((s) => s.pushToast);
  const dataVersion = useStore((s) => s.dataVersion);
  const bumpData = useStore((s) => s.bumpData);

  const statusFilter = params.get('status') ?? '';
  const [genOpen, setGenOpen] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const [reports, docs, settings] = await Promise.all([listReports(), listDocuments(), getSettings()]);
    return { reports, docs, settings };
  }, [dataVersion]);

  const filtered = useMemo(() => {
    const reports = data?.reports ?? [];
    return statusFilter ? reports.filter((r) => r.status === statusFilter) : reports;
  }, [data, statusFilter]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Report Builder</h2>
          <p className="sub">Generate standardised Production, Geology, Safety and Administrative reports from cited records only. Missing data stays missing.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setGenOpen(true)}>Generate report</Button>
      </div>

      <div className="row gap-8 wrap">
        <button className={statusFilter === '' ? 'chip active' : 'chip'} onClick={() => setParams({}, { replace: true })}>All ({(data?.reports ?? []).length})</button>
        {['Draft', 'Pending Review', 'Approved', 'Rejected'].map((s) => (
          <button key={s} className={statusFilter === s ? 'chip active' : 'chip'} onClick={() => setParams({ status: s }, { replace: true })}>
            {s} ({(data?.reports ?? []).filter((r) => r.status === s).length})
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <div className="spin-overlay"><Spinner /> Loading reports…</div>
        ) : error ? (
          <div className="card__body"><LoadError message={error} onRetry={reload} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText size={28} />}
            title="No reports"
            description="Generate your first report from the indexed documents. Every finding will carry a source citation."
            action={<Button size="sm" onClick={() => setGenOpen(true)}>Generate report</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Report</th><th>Type</th><th>Period</th><th>Scope</th><th>Coverage</th><th>Status</th><th>Updated</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const cov = coverageBreakdown(r);
                  return (
                    <tr key={r.id} className="clickable" onClick={() => navigate(`/app/reports/${r.id}`)}>
                      <td className="strong" style={{ maxWidth: 320 }}><span className="truncate" style={{ display: 'block', maxWidth: 320 }}>{r.title}</span></td>
                      <td className="small">{r.type}</td>
                      <td className="small nowrap">{periodLabel(r.reportingPeriod)}</td>
                      <td className="small truncate" style={{ maxWidth: 180 }}>{r.scope}</td>
                      <td className="small">{cov.coverage === null ? '—' : fmtPercent(cov.coverage)}</td>
                      <td><Badge tone={reportTone(r.status)}>{r.status}</Badge></td>
                      <td className="small muted nowrap">{relativeTime(r.updatedAt)}</td>
                      <td><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/app/reports/${r.id}`); }}>Open</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="banner teal">
        <ShieldCheck size={15} />
        <span className="small">Source Coverage = factual claims with supporting sources ÷ total factual claims. It is not an accuracy score. Accuracy is not independently evaluated in this prototype.</span>
      </div>

      <GenerateModal
        open={genOpen}
        docs={(data?.docs ?? []).map((d) => ({ id: d.id, name: d.fileName, period: d.reportingPeriod, subsidiary: d.subsidiary }))}
        periods={[...new Set((data?.docs ?? []).map((d) => d.reportingPeriod).filter(Boolean))].sort()}
        subsidiaries={data?.settings.subsidiaries ?? []}
        defaultScope={data?.settings.subsidiary ?? ''}
        onClose={() => setGenOpen(false)}
        onGenerated={async (id) => {
          bumpData();
          pushToast('Report generated.', 'success');
          navigate(`/app/reports/${id}`);
        }}
        actor={session}
      />
    </div>
  );
}

function GenerateModal({ open, docs, periods, subsidiaries, defaultScope, onClose, onGenerated, actor }: {
  open: boolean;
  docs: { id: string; name: string; period: string; subsidiary: string }[];
  periods: string[];
  subsidiaries: string[];
  defaultScope: string;
  onClose: () => void;
  onGenerated: (id: string) => void;
  actor: { id: string; name: string; role: 'administrator' | 'analyst' | 'reviewer' };
}) {
  const [type, setType] = useState<ReportType>('Production');
  const [period, setPeriod] = useState(periods[periods.length - 1] ?? new Date().toISOString().slice(0, 7));
  const [scope, setScope] = useState(defaultScope || subsidiaries[0] || '');
  const [docIds, setDocIds] = useState<string[]>([]);
  const [sections, setSections] = useState<string[]>(SECTION_LIBRARY.Production.map((s) => s.id));
  const [compare, setCompare] = useState(true);
  const [validation, setValidation] = useState(true);
  const [conflicts, setConflicts] = useState(true);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const pushToast = useStore((s) => s.pushToast);
  const [genError, setGenError] = useState<string | null>(null);

  const changeType = (t: ReportType) => { setType(t); setSections(SECTION_LIBRARY[t].map((s) => s.id)); };

  const relevantDocs = useMemo(() => docs.filter((d) => (!period || d.period === period) && (!scope || d.subsidiary === scope)), [docs, period, scope]);

  const generate = async () => {
    if (sections.length === 0) {
      setGenError('Select at least one section to include.');
      return;
    }
    setGenError(null);
    setBusy(true);
    const config: ReportConfig = {
      type, reportingPeriod: period, scope, sourceDocIds: docIds, sections,
      includeHistoricalComparison: compare, includeValidation: validation, includeConflicts: conflicts, title,
    };
    try {
      const report = await generateReport(config, actor);
      onGenerated(report.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Report generation failed.';
      setGenError(message);
      pushToast(message, 'error', 'Could not generate report');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate report"
      sub="Select the scope and sections. Findings are drawn only from the selected source documents."
      width="wide"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={generate}>Generate report</Button></>}
    >
      <div className="stack">
        <div className="grid-2" style={{ gap: 14 }}>
          <Field label="Report type">
            <select className="select" value={type} onChange={(e) => changeType(e.target.value as ReportType)}>
              {REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Reporting period">
            <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {periods.length === 0 && <option value={period}>{periodLabel(period)}</option>}
              {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
            </select>
          </Field>
          <Field label="Organisational scope">
            <select className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="">All scopes</option>
              {subsidiaries.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Report title (optional)"><input className="input" value={title} placeholder="Auto-generated if left blank" onChange={(e) => setTitle(e.target.value)} /></Field>
        </div>

        <Field label="Sections to include">
          <div className="pill-list">
            {SECTION_LIBRARY[type].map((s) => (
              <button key={s.id} className={sections.includes(s.id) ? 'chip active' : 'chip'} onClick={() => setSections((prev) => prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id])}>
                {s.heading}
              </button>
            ))}
          </div>
        </Field>

        <div className="row gap-16 wrap">
          <label className="checkbox"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Historical comparison table</label>
          <label className="checkbox"><input type="checkbox" checked={validation} onChange={(e) => setValidation(e.target.checked)} /> Include validation warnings</label>
          <label className="checkbox"><input type="checkbox" checked={conflicts} onChange={(e) => setConflicts(e.target.checked)} /> Include unresolved conflicts</label>
        </div>

        <Field label={`Source documents (${docIds.length === 0 ? 'all in scope' : docIds.length + ' selected'})`} hint={`${relevantDocs.length} document(s) match the selected period and scope.`}>
          <div className="col gap-4" style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
            {relevantDocs.length === 0 && <span className="small muted">No documents match the selected period and scope.</span>}
            {relevantDocs.map((d) => (
              <label key={d.id} className="checkbox">
                <input type="checkbox" checked={docIds.includes(d.id)} onChange={(e) => setDocIds((prev) => e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id))} />
                <span className="small">{d.name} <span className="dim">· {periodLabel(d.period)}</span></span>
              </label>
            ))}
          </div>
        </Field>

        {docIds.length === 0 && <div className="banner info"><span className="small">With no documents selected, all documents in the selected scope and period are used.</span></div>}
        {genError && <div className="banner error"><span className="small">{genError}</span></div>}
      </div>
    </Modal>
  );
}
