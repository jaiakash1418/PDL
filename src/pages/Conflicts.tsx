import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ExternalLink, GitCompareArrows, RefreshCw, Scale } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { addConflictNote, detectConflicts, getConflicts, reopenConflict, resolveConflict } from '../services/conflicts';
import { Badge, Button, Card, EmptyState, Field, LoadError, Spinner } from '../components/ui';
import { Modal } from '../components/overlays';
import type { Conflict, ConflictValue } from '../lib/types';
import { sourceLink } from '../lib/links';
import { conflictTone, fmtDateTime, periodLabel } from '../lib/util';

export function Conflicts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const session = useStore((s) => s.session)!;
  const pushToast = useStore((s) => s.pushToast);
  const bumpData = useStore((s) => s.bumpData);
  const dataVersion = useStore((s) => s.dataVersion);
  const [selected, setSelected] = useState<Conflict | null>(null);
  const [scanning, setScanning] = useState(false);

  const focusId = params.get('focus');

  const { data, loading, error, reload } = useAsync(async () => ({ conflicts: await getConflicts() }), [dataVersion]);
  const conflicts = data?.conflicts ?? [];

  // Deep-link from the reviewer queue: open the targeted unresolved conflict.
  useEffect(() => {
    if (!focusId || selected) return;
    const hit = data?.conflicts.find((c) => c.id === focusId && c.status === 'Unresolved');
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

  const rescan = async () => {
    setScanning(true);
    try {
      await detectConflicts();
      pushToast('Conflict scan complete.', 'success');
      reload(); bumpData();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Conflict scan failed.', 'error');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Conflict Review</h2>
          <p className="sub">Records that disagree for the same metric, scope and period. The newest document is not assumed correct; both values are preserved.</p>
        </div>
        <Button icon={<RefreshCw size={15} />} loading={scanning} onClick={rescan}>Re-scan for conflicts</Button>
      </div>

      <div className="row gap-8 wrap">
        <span className="chip">{conflicts.length} conflict(s)</span>
        <span className="chip">{conflicts.filter((c) => c.status === 'Unresolved').length} unresolved</span>
        <span className="chip">{conflicts.filter((c) => c.status === 'Resolved').length} resolved</span>
      </div>

      <Card>
        {loading ? (
          <div className="spin-overlay"><Spinner /> Detecting conflicts…</div>
        ) : error ? (
          <div className="card__body"><LoadError message={error} onRetry={reload} /></div>
        ) : conflicts.length === 0 ? (
          <EmptyState icon={<Scale size={28} />} title="No conflicts detected" description="No metric shares multiple differing values within the same scope and period." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Metric</th><th>Period</th><th>Scope</th><th>Values</th><th>Status</th><th /></tr></thead>
              <tbody>
                {conflicts.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setSelected(c)}>
                    <td className="small strong">{c.metric}</td>
                    <td className="small nowrap">{periodLabel(c.reportingPeriod)}</td>
                    <td className="small truncate" style={{ maxWidth: 180 }}>{c.scope}</td>
                    <td className="small">
                      <div className="pill-list">
                        {c.values.map((v, i) => <span key={i} className="badge badge-neutral">{v.value}</span>)}
                      </div>
                    </td>
                    <td><Badge tone={conflictTone(c.status)}>{c.status}</Badge></td>
                    <td><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(c); }}>Review</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="banner teal">
        <GitCompareArrows size={15} />
        <span className="small">Resolution records the reviewer's selected value with a justification. The original values and the resolution history are both retained.</span>
      </div>

      {selected && (
        <ConflictModal
          conflict={selected}
          onClose={closeModal}
          onOpen={(v) => navigate(sourceLink(v))}
          onChanged={() => { setSelected(null); reload(); bumpData(); }}
          actor={session}
        />
      )}
    </div>
  );
}

function ConflictModal({ conflict, onClose, onOpen, onChanged, actor }: {
  conflict: Conflict;
  onClose: () => void;
  onOpen: (v: ConflictValue) => void;
  onChanged: () => void;
  actor: { id: string; name: string; role: 'administrator' | 'analyst' | 'reviewer' };
}) {
  const pushToast = useStore((s) => s.pushToast);
  const [selectedDoc, setSelectedDoc] = useState(conflict.selectedDocId ?? '');
  const [justification, setJustification] = useState(conflict.justification ?? '');
  const [note, setNote] = useState(conflict.reviewNote ?? '');
  const [busy, setBusy] = useState<string | null>(null);

  const doResolve = async () => {
    if (!selectedDoc) { pushToast('Select a verified value before resolving.', 'warning'); return; }
    if (!justification.trim()) { pushToast('A justification is required to resolve a conflict.', 'warning'); return; }
    setBusy('resolve');
    try {
      await resolveConflict(conflict.id, { selectedDocId: selectedDoc, justification, note: note || undefined, actor });
      pushToast('Conflict resolved.', 'success');
      onChanged();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not resolve the conflict.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const doNote = async () => {
    setBusy('note');
    try {
      await addConflictNote(conflict.id, note);
      pushToast('Review note saved.', 'success');
      onChanged();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not save the review note.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const doReopen = async () => {
    setBusy('reopen');
    try {
      await reopenConflict(conflict.id);
      pushToast('Conflict reopened.', 'success');
      onChanged();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not reopen the conflict.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="Conflict review" sub={`${conflict.metric} · ${periodLabel(conflict.reportingPeriod)} · ${conflict.scope}`} width="wide"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {conflict.status === 'Resolved'
            ? <Button loading={busy === 'reopen'} onClick={doReopen}>Reopen</Button>
            : <><Button loading={busy === 'note'} onClick={doNote}>Save note</Button><Button variant="primary" loading={busy === 'resolve'} onClick={doResolve}>Select & resolve</Button></>}
        </>
      }>
      <div className="stack">
        <div className="row gap-8">
          <Badge tone={conflictTone(conflict.status)}>{conflict.status}</Badge>
          {conflict.resolvedAt && <span className="xsmall muted">Resolved {fmtDateTime(conflict.resolvedAt)} by {conflict.resolvedByName}</span>}
        </div>

        <div className="sidebyside">
          {conflict.values.map((v, i) => (
            <div key={i} className={`card ${selectedDoc === v.docId ? '' : ''}`} style={selectedDoc === v.docId ? { borderColor: 'var(--teal-500)', boxShadow: 'var(--shadow-md)' } : undefined}>
              <div className="card__head">
                <div className="col">
                  <h3 style={{ fontSize: 22 }}>{v.value}</h3>
                  <span className="xsmall muted">{v.docName} → {v.section ?? 'General'} → Page {v.pageNo}</span>
                </div>
                {conflict.status === 'Unresolved' && (
                  <label className="checkbox">
                    <input type="radio" name="conflict-value" checked={selectedDoc === v.docId} onChange={() => setSelectedDoc(v.docId)} />
                    Verified
                  </label>
                )}
                {conflict.status === 'Resolved' && selectedDoc === v.docId && <Badge tone="success">Selected</Badge>}
              </div>
              <div className="card__body">
                <div className="evidence"><div className="src">Supporting text</div><blockquote>"{v.snippet}"</blockquote></div>
                <Button size="sm" variant="ghost" className="mt-8" icon={<ExternalLink size={13} />} onClick={() => onOpen(v)}>Open source</Button>
              </div>
            </div>
          ))}
        </div>

        {conflict.status === 'Resolved' ? (
          <div className="banner success">
            <CheckCircle2 size={15} />
            <div className="small">
              <strong>Resolved.</strong> Verified value selected from {conflict.values.find((v) => v.docId === conflict.selectedDocId)?.docName}. Justification: {conflict.justification}
              {conflict.reviewNote && <div className="mt-4">Note: {conflict.reviewNote}</div>}
              <div className="mt-4 xsmall muted">Both original values and the resolution history are retained.</div>
            </div>
          </div>
        ) : (
          <div className="stack">
            <Field label="Justification for the verified value" hint="Explain why this value is preferred. The newest document is not automatically assumed correct.">
              <textarea className="textarea" value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Basis for selecting the verified value…" />
            </Field>
            <Field label="Review note (optional)"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}
