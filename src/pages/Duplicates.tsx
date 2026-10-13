import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, ExternalLink, RefreshCw, FileStack } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { detectDuplicates, getDuplicates, setDuplicateStatus } from '../services/duplicates';
import { listDocuments } from '../services/documents';
import { Badge, Button, Card, EmptyState, Field, LoadError, Spinner } from '../components/ui';
import { Modal } from '../components/overlays';
import type { DocumentRecord, DuplicatePair } from '../lib/types';
import { dupTone, fmtBytes, fmtDateTime, periodLabel, truncate } from '../lib/util';

export function Duplicates() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const session = useStore((s) => s.session)!;
  const pushToast = useStore((s) => s.pushToast);
  const bumpData = useStore((s) => s.bumpData);
  const dataVersion = useStore((s) => s.dataVersion);
  const [selected, setSelected] = useState<DuplicatePair | null>(null);
  const [scanning, setScanning] = useState(false);

  const focusId = params.get('focus');

  const { data, loading, error, reload } = useAsync(async () => {
    const [pairs, docs] = await Promise.all([getDuplicates(), listDocuments()]);
    return { pairs, docs };
  }, [dataVersion]);

  const docMap = useMemo(() => new Map((data?.docs ?? []).map((d) => [d.id, d])), [data]);
  const pairs = data?.pairs ?? [];

  // Deep-link from the reviewer queue: open the targeted pending pair.
  useEffect(() => {
    if (!focusId || selected) return;
    const hit = data?.pairs.find((p) => p.id === focusId && p.status === 'Pending');
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
      await detectDuplicates();
      pushToast('Duplicate scan complete.', 'success');
      reload(); bumpData();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Duplicate scan failed.', 'error');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Duplicate Detection</h2>
          <p className="sub">Matches are found by file hash, metadata comparison and extracted-text similarity. Documents are never deleted automatically.</p>
        </div>
        <Button icon={<RefreshCw size={15} />} loading={scanning} onClick={rescan}>Re-scan for duplicates</Button>
      </div>

      <div className="row gap-8 wrap">
        <span className="chip">{pairs.length} match(es)</span>
        <span className="chip">{pairs.filter((p) => p.exact).length} exact</span>
        <span className="chip">{pairs.filter((p) => p.status === 'Pending').length} pending review</span>
      </div>

      <Card>
        {loading ? (
          <div className="spin-overlay"><Spinner /> Scanning for duplicates…</div>
        ) : error ? (
          <div className="card__body"><LoadError message={error} onRetry={reload} /></div>
        ) : pairs.length === 0 ? (
          <EmptyState icon={<Copy size={28} />} title="No duplicate matches" description="No documents share a file hash, matching metadata or high text similarity." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Document A</th><th>Document B</th><th>Reason</th><th>Similarity</th><th>Status</th><th /></tr></thead>
              <tbody>
                {pairs.map((p) => {
                  const a = docMap.get(p.docAId);
                  const b = docMap.get(p.docBId);
                  return (
                    <tr key={p.id} className="clickable" onClick={() => setSelected(p)}>
                      <td className="small truncate" style={{ maxWidth: 220 }}>{a?.fileName ?? p.docAId}</td>
                      <td className="small truncate" style={{ maxWidth: 220 }}>{b?.fileName ?? p.docBId}</td>
                      <td className="small muted truncate" style={{ maxWidth: 260 }}>{p.reason}</td>
                      <td className="small">{p.similarity !== undefined ? `${p.similarity.toFixed(1)}%` : p.exact ? 'Hash match' : '—'}</td>
                      <td><Badge tone={dupTone(p.status)}>{p.status}</Badge></td>
                      <td><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(p); }}>Compare</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <CompareModal
          pair={selected}
          a={docMap.get(selected.docAId)}
          b={docMap.get(selected.docBId)}
          onClose={closeModal}
          onOpen={(id) => navigate(`/app/documents/${id}`)}
          onChanged={() => { setSelected(null); reload(); bumpData(); }}
          actor={session}
        />
      )}
    </div>
  );
}

function CompareModal({ pair, a, b, onClose, onOpen, onChanged, actor }: {
  pair: DuplicatePair;
  a?: DocumentRecord;
  b?: DocumentRecord;
  onClose: () => void;
  onOpen: (id: string) => void;
  onChanged: () => void;
  actor: { id: string; name: string; role: 'administrator' | 'analyst' | 'reviewer' };
}) {
  const pushToast = useStore((s) => s.pushToast);
  const [note, setNote] = useState(pair.note ?? '');
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (status: DuplicatePair['status'], key: string, requireNote = false) => {
    if (requireNote && !note.trim()) { pushToast('A reason is required to dismiss.', 'warning'); return; }
    setBusy(key);
    try {
      await setDuplicateStatus(pair.id, status, { note: note || undefined, actor });
      pushToast(`Marked as ${status.toLowerCase()}.`, 'success');
      onChanged();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not update the duplicate review.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="Duplicate comparison" sub={pair.reason} width="wide"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button loading={busy === 'dismiss'} onClick={() => act('Dismissed', 'dismiss', true)}>Dismiss</Button>
          <Button loading={busy === 'not'} onClick={() => act('Not Duplicate', 'not')}>Not duplicate</Button>
          <Button variant="primary" loading={busy === 'dup'} onClick={() => act('Confirmed Duplicate', 'dup')}>Confirm duplicate</Button>
        </>
      }>
      <div className="stack">
        <div className="row gap-8">
          {pair.exact && <Badge tone="error">Exact hash match</Badge>}
          {pair.similarity !== undefined && <Badge tone="warning">Text similarity {pair.similarity.toFixed(1)}%</Badge>}
          <Badge tone={dupTone(pair.status)}>{pair.status}</Badge>
          <span className="xsmall muted">Detected {fmtDateTime(pair.createdAt)}</span>
        </div>

        <div className="sidebyside">
          {[a, b].map((doc, i) => (
            <div key={i} className="card">
              <div className="card__head"><h3>Document {i === 0 ? 'A' : 'B'}</h3><Badge tone="neutral">{doc?.fileExtension.toUpperCase() ?? '?'}</Badge></div>
              <div className="card__body stack-sm">
                <Field label="File name"><span className="small">{doc?.fileName ?? pair[i === 0 ? 'docAId' : 'docBId']}</span></Field>
                <div className="grid-2" style={{ gap: 10 }}>
                  <Field label="Category"><span className="small">{doc?.category ?? '—'}</span></Field>
                  <Field label="Period"><span className="small">{doc ? periodLabel(doc.reportingPeriod) : '—'}</span></Field>
                  <Field label="Size"><span className="small">{doc ? fmtBytes(doc.byteSize) : '—'}</span></Field>
                  <Field label="Pages"><span className="small">{doc?.pageCount ?? '—'}</span></Field>
                  <Field label="Uploaded"><span className="small">{doc ? fmtDateTime(doc.uploadedAt) : '—'}</span></Field>
                  <Field label="Status"><span className="small">{doc?.status ?? '—'}</span></Field>
                </div>
                <Field label="SHA-256"><span className="mono xsmall">{truncate(doc?.fileHash ?? '—', 40)}</span></Field>
                {doc && <Button size="sm" variant="ghost" icon={<ExternalLink size={13} />} onClick={() => onOpen(doc.id)}>Open document {i === 0 ? 'A' : 'B'}</Button>}
              </div>
            </div>
          ))}
        </div>

        <Field label="Review note / reason"><textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the decision (required when dismissing)…" /></Field>
        <div className="banner info"><FileStack size={15} /><span className="small">Neither document is deleted or altered. Confirming a duplicate only records the reviewer's decision.</span></div>
      </div>
    </Modal>
  );
}
