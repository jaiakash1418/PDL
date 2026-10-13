import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ExternalLink, FileSearch, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { getIssues, reviewIssue, runValidation, sortIssues } from '../services/validation';
import { Badge, Button, Card, CardHead, EmptyState, Field, LoadError, Spinner, Tabs } from '../components/ui';
import { Modal } from '../components/overlays';
import type { IssueStatus, SourceRef, ValidationIssue } from '../lib/types';
import { sourceLink } from '../lib/links';
import { fmtDateTime, severityTone } from '../lib/util';

export function Validation() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const session = useStore((s) => s.session)!;
  const pushToast = useStore((s) => s.pushToast);
  const bumpData = useStore((s) => s.bumpData);
  const dataVersion = useStore((s) => s.dataVersion);

  const statusFilter = (params.get('status') as IssueStatus | null) ?? '';
  const focusId = params.get('focus');
  const [severity, setSeverity] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ValidationIssue | null>(null);
  const [running, setRunning] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => ({ issues: await getIssues() }), [dataVersion]);

  // Deep-link from the reviewer queue: open the targeted open issue immediately.
  useEffect(() => {
    if (!focusId || selected) return;
    const hit = data?.issues.find((i) => i.id === focusId && i.status === 'Open');
    if (hit) setSelected(hit);
  }, [focusId, data, selected]);

  const closeModal = () => {
    setSelected(null);
    if (focusId) {
      const next = new URLSearchParams(params);
      next.delete('focus');
      setParams(next, { replace: true });
    }
  };

  const issues = data?.issues ?? [];
  const filtered = useMemo(() => {
    let list = issues;
    if (statusFilter) list = list.filter((i) => i.status === statusFilter);
    if (severity) list = list.filter((i) => i.severity === severity);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => [i.ruleName, i.docName, i.field, i.currentValue, i.reason].some((f) => f.toLowerCase().includes(q)));
    return sortIssues(list);
  }, [issues, statusFilter, severity, search]);

  const rerun = async () => {
    setRunning(true);
    try {
      await runValidation();
      pushToast('Validation re-run complete.', 'success');
      reload(); bumpData();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Validation could not be re-run.', 'error');
    } finally {
      setRunning(false);
    }
  };

  const counts = {
    all: issues.length,
    Open: issues.filter((i) => i.status === 'Open').length,
    Reviewed: issues.filter((i) => i.status === 'Reviewed').length,
    Resolved: issues.filter((i) => i.status === 'Resolved').length,
    Dismissed: issues.filter((i) => i.status === 'Dismissed').length,
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Data Validation</h2>
          <p className="sub">Rule engine results over the current dataset. Original documents are never modified; approved corrections are recorded separately.</p>
        </div>
        <Button icon={<RefreshCw size={15} />} loading={running} onClick={rerun}>Re-run validation</Button>
      </div>

      <div className="row gap-8 wrap">
        {([['', 'All'], ['Open', 'Open'], ['Reviewed', 'Reviewed'], ['Resolved', 'Resolved'], ['Dismissed', 'Dismissed']] as const).map(([val, label]) => (
          <button key={label} className={statusFilter === val ? 'chip active' : 'chip'} onClick={() => { const next = new URLSearchParams(params); if (val) next.set('status', val); else next.delete('status'); setParams(next, { replace: true }); }}>
            {label} ({counts[(val || 'all') as keyof typeof counts]})
          </button>
        ))}
      </div>

      <Card>
        <div className="card__body">
          <div className="toolbar">
            <div className="global-search" style={{ maxWidth: 340, flex: '1 1 240px' }}>
              <Search size={15} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search issues, documents, values…" />
            </div>
            <select className="select" style={{ width: 170 }} value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="spin-overlay"><Spinner /> Loading validation issues…</div>
        ) : error ? (
          <div className="card__body"><LoadError message={error} onRetry={reload} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ShieldCheck size={28} />} title="No matching issues" description={statusFilter || severity || search ? 'Adjust the filters to see more.' : 'Run validation to detect missing fields, inconsistent units, conflicts and unexpected changes.'} action={<Button size="sm" onClick={rerun}>Re-run validation</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>Severity</th><th>Rule</th><th>Document</th><th>Field</th><th>Current value</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} className="clickable" onClick={() => setSelected(i)}>
                    <td><Badge tone={severityTone(i.severity)} dot>{i.severity}</Badge></td>
                    <td className="small">{i.ruleName}</td>
                    <td className="small truncate" style={{ maxWidth: 220 }}>{i.docName}</td>
                    <td className="small">{i.field}</td>
                    <td className="small truncate" style={{ maxWidth: 220 }} title={i.currentValue}>{i.currentValue}</td>
                    <td><Badge tone={i.status === 'Open' ? 'warning' : i.status === 'Resolved' ? 'success' : i.status === 'Dismissed' ? 'neutral' : 'info'}>{i.status}</Badge></td>
                    <td><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(i); }}>Review</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <IssueModal
          issue={selected}
          onClose={closeModal}
          actor={session}
          onChanged={() => { setSelected(null); reload(); bumpData(); }}
          onOpenDoc={(docId) => navigate(`/app/documents/${docId}`)}
          onOpenSource={(ref) => navigate(sourceLink(ref))}
        />
      )}
    </div>
  );
}

function IssueModal({ issue, onClose, actor, onChanged, onOpenDoc, onOpenSource }: {
  issue: ValidationIssue;
  onClose: () => void;
  actor: { id: string; name: string; role: 'administrator' | 'analyst' | 'reviewer' };
  onChanged: () => void;
  onOpenDoc: (id: string) => void;
  onOpenSource: (ref: SourceRef) => void;
}) {
  const pushToast = useStore((s) => s.pushToast);
  const [note, setNote] = useState(issue.reviewNote ?? '');
  const [resolution, setResolution] = useState(issue.resolution ?? '');
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (status: IssueStatus, key: string) => {
    if (status === 'Dismissed' && !note.trim()) { pushToast('A reason is required to dismiss an issue.', 'warning'); return; }
    setBusy(key);
    try {
      await reviewIssue(issue.id, status, { note: note || undefined, resolution: resolution || undefined, actor });
      pushToast(`Issue marked ${status.toLowerCase()}.`, 'success');
      onChanged();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not update the issue.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="Validation issue" sub={`${issue.ruleId} · ${issue.ruleName}`} width="wide"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button loading={busy === 'review'} onClick={() => act('Reviewed', 'review')}>Mark reviewed</Button>
          <Button variant="danger" loading={busy === 'dismiss'} onClick={() => act('Dismissed', 'dismiss')}>Dismiss</Button>
          <Button variant="primary" loading={busy === 'resolve'} onClick={() => act('Resolved', 'resolve')}>Resolve</Button>
        </>
      }>
      <div className="stack">
        <div className="row gap-8">
          <Badge tone={severityTone(issue.severity)} dot>{issue.severity}</Badge>
          <Badge tone={issue.status === 'Open' ? 'warning' : issue.status === 'Resolved' ? 'success' : 'neutral'}>{issue.status}</Badge>
          {issue.reviewedAt && <span className="xsmall muted">Last reviewed {fmtDateTime(issue.reviewedAt)} by {issue.reviewedByName}</span>}
        </div>

        <div className="grid-2" style={{ gap: 16 }}>
          <Field label="Document"><div className="row gap-8"><span className="small">{issue.docName}</span><Button size="sm" variant="ghost" icon={<ExternalLink size={13} />} onClick={() => onOpenDoc(issue.docId)}>Open record</Button></div></Field>
          <Field label="Field"><span className="small">{issue.field}</span></Field>
          <Field label="Current value"><span className="small mono">{issue.currentValue}</span></Field>
          <Field label="Expected / comparison"><span className="small mono">{issue.expected ?? '—'}</span></Field>
        </div>

        <div className="banner warn"><AlertTriangle size={15} /><div><div className="strong small">Reason for the warning</div><p className="small mt-4">{issue.reason}</p></div></div>

        <div className="evidence">
          <div className="src">Source reference</div>
          <div className="small muted mt-4">{issue.sourceRef.docName} → {issue.sourceRef.section ?? 'General'} → Page {issue.sourceRef.pageNo}</div>
          {issue.sourceRef.snippet && <blockquote>"{issue.sourceRef.snippet}"</blockquote>}
          <Button size="sm" variant="ghost" className="mt-8" icon={<FileSearch size={13} />} onClick={() => onOpenSource(issue.sourceRef)}>Open source document</Button>
        </div>

        <div className="banner info"><span className="small"><strong>Suggested next step:</strong> {issue.suggestion}</span></div>

        <Field label="Proposed correction (recorded separately; the source document is not modified)">
          <input className="input" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. corrected value or reference" disabled={issue.status === 'Resolved' || issue.status === 'Dismissed'} />
        </Field>
        <Field label="Review note" hint="Required when dismissing.">
          <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a review note…" />
        </Field>

        {issue.resolution && <div className="banner success"><span className="small">Recorded correction: <strong className="mono">{issue.resolution}</strong></span></div>}
      </div>
    </Modal>
  );
}
