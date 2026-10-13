import { useMemo, useState } from 'react';
import { CheckCircle2, ScrollText, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { getAuditEvents, verifyChain, type ChainVerification } from '../services/audit';
import { Badge, Button, Card, EmptyState, Field, LoadError, Spinner } from '../components/ui';
import { Modal } from '../components/overlays';
import type { AuditEvent } from '../lib/types';
import { download, fmtDateTime, initials, truncate } from '../lib/util';

export function Audit() {
  const dataVersion = useStore((s) => s.dataVersion);
  const pushToast = useStore((s) => s.pushToast);
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [verification, setVerification] = useState<ChainVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => ({ events: await getAuditEvents() }), [dataVersion]);
  const events = data?.events ?? [];

  const actions = useMemo(() => [...new Set(events.map((e) => e.action))].sort(), [events]);
  const actors = useMemo(() => [...new Set(events.map((e) => e.actorName))].sort(), [events]);

  const filtered = useMemo(() => {
    let list = [...events].reverse();
    if (action) list = list.filter((e) => e.action === action);
    if (actor) list = list.filter((e) => e.actorName === actor);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => [e.action, e.actorName, e.resourceType, e.resourceName ?? '', String(e.seq)].some((f) => f.toLowerCase().includes(q)));
    return list;
  }, [events, action, actor, search]);

  const runVerify = async () => {
    setVerifying(true);
    try {
      const result = await verifyChain();
      setVerification(result);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Integrity verification failed.', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const exportJson = () => {
    download('stratavex-audit-log.json', JSON.stringify(events, null, 2), 'application/json');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Audit Trail</h2>
          <p className="sub">Append-only, hash-chained activity log. Each record's hash covers the previous hash and its own payload, so altering an earlier record invalidates the chain.</p>
        </div>
        <div className="row gap-8">
          <Button icon={<ScrollText size={15} />} onClick={exportJson}>Export JSON</Button>
          <Button variant="primary" icon={<ShieldCheck size={15} />} loading={verifying} onClick={runVerify}>Verify integrity</Button>
        </div>
      </div>

      {verification && (
        <div className={verification.ok ? 'banner success' : 'banner error'}>
          {verification.ok ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
          <div className="small">
            {verification.ok
              ? <>Chain verified across <strong>{verification.length}</strong> record(s). No integrity problems detected.</>
              : <>Integrity problem at record <strong>#{verification.brokenAtSeq}</strong>: {verification.reason}. The log has been modified since it was written.</>}
            <div className="mt-4 xsmall muted">Integrity-evident for this browser-stored demonstration dataset. It is not protection against an attacker who can rewrite the entire chain in local storage.</div>
          </div>
        </div>
      )}

      <Card>
        <div className="card__body">
          <div className="toolbar">
            <div className="global-search" style={{ maxWidth: 320, flex: '1 1 220px' }}>
              <Search size={15} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actions, actors, resources…" />
            </div>
            <select className="select" style={{ width: 200 }} value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="select" style={{ width: 200 }} value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="">All actors</option>
              {actors.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="spin-overlay"><Spinner /> Loading audit trail…</div>
        ) : error ? (
          <div className="card__body"><LoadError message={error} onRetry={reload} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<ScrollText size={28} />} title="No audit records" description="Actions performed in the workspace will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th><th>Resource</th><th>Hash</th><th /></tr></thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="clickable" onClick={() => setSelected(e)}>
                    <td className="small mono">{e.seq}</td>
                    <td className="small nowrap">{fmtDateTime(e.at)}</td>
                    <td className="small">
                      <div className="row gap-8"><span className="avatar sm">{initials(e.actorName)}</span>{e.actorName}</div>
                    </td>
                    <td><Badge tone={e.action.includes('delete') || e.action.includes('reject') ? 'error' : e.action.includes('approve') ? 'success' : 'info'}>{e.action}</Badge></td>
                    <td className="small truncate" style={{ maxWidth: 220 }}>{e.resourceName ?? e.resourceType}</td>
                    <td className="small mono">{truncate(e.hash, 12)}</td>
                    <td><Button size="sm" variant="ghost" onClick={(ev) => { ev.stopPropagation(); setSelected(e); }}>Details</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <Modal open onClose={() => setSelected(null)} title={`Audit record #${selected.seq}`} sub={selected.action}
          footer={<Button variant="primary" onClick={() => setSelected(null)}>Close</Button>}>
          <div className="stack">
            <div className="grid-2" style={{ gap: 12 }}>
              <Field label="Timestamp"><span className="small">{fmtDateTime(selected.at)}</span></Field>
              <Field label="Actor"><span className="small">{selected.actorName} ({selected.actorRole})</span></Field>
              <Field label="Action"><span className="small mono">{selected.action}</span></Field>
              <Field label="Resource"><span className="small">{selected.resourceType}{selected.resourceName ? ` · ${selected.resourceName}` : ''}</span></Field>
            </div>
            <Field label="Previous hash"><span className="mono xsmall" style={{ wordBreak: 'break-all' }}>{selected.prevHash}</span></Field>
            <Field label="Record hash"><span className="mono xsmall" style={{ wordBreak: 'break-all' }}>{selected.hash}</span></Field>
            {selected.meta && (
              <Field label="Metadata"><pre className="code-block">{JSON.stringify(selected.meta, null, 2)}</pre></Field>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
