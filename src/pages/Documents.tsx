import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, FileStack, Trash2, Filter, SlidersHorizontal, ShieldCheck } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { deleteDocument, listDocuments } from '../services/documents';
import { getSettings } from '../services/settings';
import { Badge, Button, Card, EmptyState, LoadError, Spinner } from '../components/ui';
import { ConfirmDialog } from '../components/overlays';
import type { DocumentRecord } from '../lib/types';
import { fmtBytes, periodLabel, relativeTime, statusTone } from '../lib/util';

type SortKey = 'uploadedAt' | 'fileName' | 'reportingPeriod' | 'category' | 'pageCount';

export function Documents() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const session = useStore((s) => s.session)!;
  const pushToast = useStore((s) => s.pushToast);
  const bumpData = useStore((s) => s.bumpData);
  const dataVersion = useStore((s) => s.dataVersion);

  const initialQ = params.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);
  const [category, setCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState(params.get('status') ?? '');
  const [period, setPeriod] = useState('');
  const [sort, setSort] = useState<SortKey>('uploadedAt');
  const [asc, setAsc] = useState(false);
  const [toDelete, setToDelete] = useState<DocumentRecord | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const { data, loading, error, reload } = useAsync(async () => {
    const [docs, settings] = await Promise.all([listDocuments(), getSettings()]);
    return { docs, settings };
  }, [dataVersion]);

  const canDelete = session.role === 'administrator' || session.role === 'analyst';

  const filtered = useMemo(() => {
    let docs = data?.docs ?? [];
    const q = query.trim().toLowerCase();
    if (q) docs = docs.filter((d) => d.fileName.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) || d.department.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q));
    if (category) docs = docs.filter((d) => d.category === category);
    if (statusFilter === 'queue') docs = docs.filter((d) => d.status !== 'Indexed');
    else if (statusFilter) docs = docs.filter((d) => d.status === statusFilter);
    if (period) docs = docs.filter((d) => d.reportingPeriod === period);
    const dir = asc ? 1 : -1;
    docs = [...docs].sort((a, b) => {
      const av = a[sort] as string | number;
      const bv = b[sort] as string | number;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return docs;
  }, [data, query, category, statusFilter, period, sort, asc]);

  const periods = useMemo(() => [...new Set((data?.docs ?? []).map((d) => d.reportingPeriod).filter(Boolean))].sort(), [data]);
  const categories = data?.settings.categories ?? [];

  const pageCount = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    setQuery(params.get('q') ?? '');
    setStatusFilter(params.get('status') ?? '');
    setPeriod(params.get('period') ?? '');
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setAsc((a) => !a);
    else { setSort(key); setAsc(false); }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    await deleteDocument(toDelete.id, session);
    pushToast(`Deleted "${toDelete.fileName}".`, 'success');
    bumpData();
    setToDelete(null);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Document Repository</h2>
          <p className="sub">Search, filter and manage indexed operational documents. Originals are preserved separately from extracted data.</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/app/upload')}>Upload Document</Button>
      </div>

      <Card>
        <div className="card__body">
          <div className="toolbar">
            <div className="global-search" style={{ maxWidth: 360, flex: '1 1 260px' }}>
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); updateParam('q', e.target.value); }}
                placeholder="Search file names, categories, departments…"
              />
            </div>
            <div className="row gap-6" style={{ color: 'var(--ink-500)' }}><Filter size={14} /></div>
            <select className="select" style={{ width: 180 }} value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="select" style={{ width: 180 }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); updateParam('status', e.target.value); }}>
              <option value="">All statuses</option>
              <option value="queue">Processing queue</option>
              <option value="Indexed">Indexed</option>
              <option value="Processing">Processing</option>
              <option value="Partially Processed">Partially Processed</option>
              <option value="Failed">Failed</option>
              <option value="Uploaded">Uploaded</option>
            </select>
            <select className="select" style={{ width: 170 }} value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); updateParam('period', e.target.value); }}>
              <option value="">All periods</option>
              {periods.map((p) => <option key={p} value={p}>{periodLabel(p)}</option>)}
            </select>
            {(query || category || statusFilter || period) && (
              <Button variant="ghost" size="sm" icon={<SlidersHorizontal size={14} />} onClick={() => { setQuery(''); setCategory(''); setStatusFilter(''); setPeriod(''); setPage(1); setParams({}, { replace: true }); }}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="card__head">
          <h3>{filtered.length} document{filtered.length === 1 ? '' : 's'}</h3>
          <span className="small muted">Sorted by {sort} ({asc ? 'asc' : 'desc'})</span>
        </div>
        {loading ? (
          <div className="spin-overlay"><Spinner /> Loading documents…</div>
        ) : error ? (
          <div className="card__body"><LoadError message={error} onRetry={reload} /></div>
        ) : paged.length === 0 ? (
          <EmptyState
            icon={<FileStack size={28} />}
            title="No documents match"
            description={query || category || statusFilter || period ? 'Try clearing the filters.' : 'Upload a PDF, DOCX, XLSX, CSV, text or image file to begin.'}
            action={<Button size="sm" onClick={() => navigate('/app/upload')}>Upload a document</Button>}
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => toggleSort('fileName')}>Document</th>
                    <th className="sortable" onClick={() => toggleSort('category')}>Category</th>
                    <th className="sortable" onClick={() => toggleSort('reportingPeriod')}>Period</th>
                    <th>Status</th>
                    <th className="sortable" onClick={() => toggleSort('pageCount')}>Pages</th>
                    <th className="sortable" onClick={() => toggleSort('uploadedAt')}>Uploaded</th>
                    <th>Verification</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((d) => (
                    <tr key={d.id} className="clickable" onClick={() => navigate(`/app/documents/${d.id}`)}>
                      <td>
                        <div className="row gap-8">
                          <span className="file-icon" style={{ width: 30, height: 30 }}><FileStack size={14} /></span>
                          <div className="col" style={{ gap: 1, minWidth: 0 }}>
                            <span className="strong truncate" style={{ maxWidth: 300 }}>{d.fileName}</span>
                            <span className="xsmall muted">{d.department || '—'} · {fmtBytes(d.byteSize)}{d.isSeed ? ' · synthetic' : ''}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className="small">{d.category}</span></td>
                      <td className="small nowrap">{periodLabel(d.reportingPeriod)}</td>
                      <td><Badge tone={statusTone(d.status)}>{d.status}</Badge></td>
                      <td className="small">{d.pageCount}</td>
                      <td className="small nowrap muted">{relativeTime(d.uploadedAt)}</td>
                      <td>
                        <Badge tone={d.verification === 'Verified' ? 'success' : d.verification === 'Needs Review' ? 'warning' : 'neutral'}>
                          {d.verification}
                        </Badge>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="row gap-4">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/app/documents/${d.id}`)}>Open</Button>
                          {canDelete && (
                            <button className="icon-btn" style={{ width: 30, height: 30 }} title="Delete" onClick={() => setToDelete(d)}><Trash2 size={15} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="card__foot row-between">
                <span className="small muted">Page {page} of {pageCount}</span>
                <div className="row gap-8">
                  <Button size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <div className="banner teal">
        <ShieldCheck size={15} />
        <span className="small">
          Deleting a document removes its indexed pages and stored original from this browser. Deletion requires the
          Administrator or Analyst role and is recorded in the audit trail.
        </span>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete document"
        message={`Delete "${toDelete?.fileName}" and its extracted content? This cannot be undone. The action is recorded in the audit trail.`}
        confirmLabel="Delete document"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
