import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, FileSearch, FileStack, History, Quote, RefreshCw, ScanText, Table2, Trash2, Pencil, Info } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import {
  deleteDocument, getDocument, getOriginalBlob, getPages, getTables, processDocument, runOcrOnDocument, updateDocumentMeta,
} from '../services/documents';
import { getSettings } from '../services/settings';
import { Badge, Button, Card, CardHead, EmptyState, Field, KeyValue, LoadError, Spinner, Tabs } from '../components/ui';
import { ConfirmDialog, Modal } from '../components/overlays';
import type { DocumentRecord } from '../lib/types';
import { download, fmtBytes, fmtDateTime, periodLabel, statusTone } from '../lib/util';

export function DocumentDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const session = useStore((s) => s.session)!;
  const pushToast = useStore((s) => s.pushToast);
  const bumpData = useStore((s) => s.bumpData);
  const dataVersion = useStore((s) => s.dataVersion);

  const deepPage = Number(params.get('page')) || 0;
  const deepHighlight = params.get('highlight') ?? '';

  const [tab, setTab] = useState<'content' | 'tables' | 'log' | 'metadata'>('content');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const [doc, pages, tables, settings] = await Promise.all([getDocument(id), getPages(id), getTables(id), getSettings()]);
    return { doc, pages, tables, settings };
  }, [id, dataVersion]);

  // Deep-link from a citation: focus the content tab and scroll to the cited page.
  const focusPage = useMemo(() => {
    if (deepPage > 0) return deepPage;
    if (!deepHighlight || !data?.pages) return 0;
    const hit = data.pages.find((p) => findHighlightRange(p.text, deepHighlight));
    return hit?.pageNo ?? 0;
  }, [deepPage, deepHighlight, data]);

  useEffect(() => {
    if (deepPage > 0 || deepHighlight) setTab('content');
  }, [deepPage, deepHighlight]);

  useEffect(() => {
    if (!focusPage) return;
    const t = window.setTimeout(() => {
      document.getElementById(`page-${focusPage}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusPage, dataVersion]);

  const filteredPages = useMemo(() => {
    const pages = data?.pages ?? [];
    if (!search.trim()) return pages;
    const q = search.toLowerCase();
    return pages.filter((p) => p.text.toLowerCase().includes(q) || (p.section ?? '').toLowerCase().includes(q));
  }, [data, search]);

  if (error) {
    return <Card><div className="card__body"><LoadError message={error} onRetry={reload} /></div></Card>;
  }
  if (loading) return <div className="spin-overlay"><Spinner size="lg" /> Loading document…</div>;
  if (!data?.doc) {
    return (
      <EmptyState icon={<FileSearch size={28} />} title="Document not found" description="It may have been deleted." action={<Button onClick={() => navigate('/app/documents')}>Back to repository</Button>} />
    );
  }

  const doc = data.doc;
  const canEdit = session.role === 'administrator' || session.role === 'analyst';
  const canDelete = session.role === 'administrator' || session.role === 'analyst';

  const handleDownload = async () => {
    try {
      const blob = await getOriginalBlob(doc.id);
      if (!blob) { pushToast('The original file for this synthetic seed record is not stored.', 'warning'); return; }
      download(doc.fileName, blob);
      pushToast('Original file downloaded.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not download the original file.', 'error');
    }
  };

  const handleReprocess = async () => {
    setBusy('reprocess');
    try {
      const blob = await getOriginalBlob(doc.id);
      if (!blob) { pushToast('Original file unavailable; cannot reprocess.', 'warning'); return; }
      await processDocument(doc.id, new File([blob], doc.fileName, { type: doc.mimeType }));
      pushToast('Document reprocessed.', 'success');
      reload(); bumpData();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Reprocessing failed.', 'error');
    } finally { setBusy(null); }
  };

  const handleOcr = async () => {
    setBusy('ocr');
    try {
      const res = await runOcrOnDocument(doc.id);
      pushToast(res.message, res.ok ? 'success' : 'warning');
      reload(); bumpData();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'OCR failed.', 'error');
    } finally { setBusy(null); }
  };

  const handleDelete = async () => {
    try {
      await deleteDocument(doc.id, session);
      pushToast('Document deleted.', 'success');
      bumpData();
      navigate('/app/documents');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not delete the document.', 'error');
    }
  };

  return (
    <div className="stack">
      <div className="row gap-12">
        <button className="icon-btn" onClick={() => navigate('/app/documents')} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="grow">
          <div className="row gap-8 wrap">
            <h2 className="grow" style={{ wordBreak: 'break-word' }}>{doc.fileName}</h2>
            <Badge tone={statusTone(doc.status)}>{doc.status}</Badge>
            <Badge tone={doc.verification === 'Verified' ? 'success' : doc.verification === 'Needs Review' ? 'warning' : 'neutral'}>{doc.verification}</Badge>
            {doc.isSeed && <Badge tone="teal">Synthetic seed</Badge>}
          </div>
          <p className="sub">{doc.category} · {doc.department || 'No department'} · {periodLabel(doc.reportingPeriod)} · Uploaded {fmtDateTime(doc.uploadedAt)} by {doc.uploadedByName}</p>
        </div>
      </div>

      <div className="row gap-8 wrap">
        <Button icon={<Download size={15} />} onClick={handleDownload}>Download original</Button>
        {canEdit && (
          <Button icon={<Pencil size={15} />} onClick={() => setEditOpen(true)}>Edit metadata</Button>
        )}
        {canEdit && doc.hasBlob && (
          <Button icon={<RefreshCw size={15} />} loading={busy === 'reprocess'} onClick={handleReprocess}>Reprocess</Button>
        )}
        {canEdit && doc.hasBlob && (
          <Button icon={<ScanText size={15} />} loading={busy === 'ocr'} onClick={handleOcr}>Run OCR on original</Button>
        )}
        {canDelete && (
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setDeleteOpen(true)}>Delete</Button>
        )}
      </div>

      {!doc.hasBlob && (
        <div className="banner info"><Info size={15} /><span className="small">This is a synthetic seed record: its content is stored, but no original file exists to download, reprocess or OCR.</span></div>
      )}
      {doc.status === 'Failed' && (
        <div className="banner error"><span className="small">Processing failed for this document. The original file is preserved; try a text-based file or run OCR if it is a scan.</span></div>
      )}

      <div className="grid-dash">
        <Card>
          <div className="card__head" style={{ paddingBottom: 0, borderBottom: 'none' }}>
            <Tabs
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'content', label: 'Extracted content', count: data.pages.length },
                { id: 'tables', label: 'Tables', count: data.tables.length },
                { id: 'log', label: 'Processing history' },
                { id: 'metadata', label: 'Metadata' },
              ]}
            />
          </div>

          {tab === 'content' && (
            <div className="card__body">
              {deepHighlight && (
                <div className="banner info mb-16 cited-banner">
                  <Quote size={15} />
                  <div className="small">
                    <strong>Opened from a citation.</strong> The passage cited elsewhere in the workspace is highlighted below{deepPage ? ` on page ${deepPage}` : ''}. Only stored text is shown; nothing is reconstructed.
                  </div>
                </div>
              )}
              <div className="global-search mb-16" style={{ maxWidth: 420 }}>
                <FileSearch size={15} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search within this document…" />
              </div>
              {doc.ocrUsed && <Badge tone="processing">OCR applied</Badge>}
              {data.pages.length === 0 && (
                <EmptyState icon={<FileStack size={26} />} title="No extracted text" description="No text layer was available. If the original is a scan, run OCR from the actions above." />
              )}
              <div className="stack-sm mt-12">
                {filteredPages.map((p) => (
                  <div key={p.id} id={`page-${p.pageNo}`} className={`card page-card${p.pageNo === focusPage ? ' page-card--focus' : ''}`} style={{ borderColor: 'var(--border)' }}>
                    <div className="card__head" style={{ padding: '9px 14px' }}>
                      <div className="row gap-8">
                        <Badge tone={p.pageNo === focusPage ? 'teal' : 'neutral'}>Page {p.pageNo}</Badge>
                        {p.section && <span className="small strong">{p.section}</span>}
                      </div>
                    </div>
                    <div className="card__body" style={{ padding: 14 }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font)', fontSize: 14, color: 'var(--ink-700)', lineHeight: 1.6 }}>
                        {search.trim() ? highlight(p.text, search) : deepHighlight ? highlightSnippet(p.text, deepHighlight) : p.text}
                      </pre>
                    </div>
                  </div>
                ))}
                {data.pages.length > 0 && filteredPages.length === 0 && <EmptyState title="No matches" description={`No page contains "${search}".`} />}
              </div>
            </div>
          )}

          {tab === 'tables' && (
            <div className="card__body stack">
              {data.tables.length === 0 && <EmptyState icon={<Table2 size={26} />} title="No tables extracted" description="Tables are extracted from spreadsheets and tabular sources." />}
              {data.tables.map((t) => (
                <div key={t.id} className="card">
                  <div className="card__head"><h3>{t.title ?? 'Table'}</h3><Badge tone="neutral">Page {t.pageNo}</Badge></div>
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr>{t.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                      <tbody>
                        {t.rows.slice(0, 100).map((r, i) => (
                          <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {t.rows.length > 100 && <div className="card__foot small muted">Showing first 100 of {t.rows.length} rows.</div>}
                </div>
              ))}
            </div>
          )}

          {tab === 'log' && (
            <div className="card__body">
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }} className="stack-sm">
                {doc.processingLog.map((l, i) => (
                  <li key={i} className="row gap-10">
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: l.level === 'error' ? 'var(--error)' : l.level === 'warn' ? 'var(--warning)' : 'var(--teal-500)', marginTop: 6 }} />
                    <div className="grow">
                      <div className="row gap-8"><span className="small strong">{l.stage}</span><span className="xsmall dim">{fmtDateTime(l.at)}</span></div>
                      <div className="small muted">{l.message}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {tab === 'metadata' && (
            <div className="card__body">
              <div className="grid-2" style={{ gap: 18 }}>
                <KeyValue label="Document ID"><span className="mono xsmall">{doc.id}</span></KeyValue>
                <KeyValue label="File type">{doc.fileExtension.toUpperCase()} · {doc.mimeType}</KeyValue>
                <KeyValue label="Size">{fmtBytes(doc.byteSize)}</KeyValue>
                <KeyValue label="Pages / sheets">{doc.pageCount}{doc.sheetCount ? ` / ${doc.sheetCount}` : ''}</KeyValue>
                <KeyValue label="Category">{doc.category}</KeyValue>
                <KeyValue label="Department">{doc.department || '—'}</KeyValue>
                <KeyValue label="Subsidiary">{doc.subsidiary}</KeyValue>
                <KeyValue label="Reporting period">{periodLabel(doc.reportingPeriod)}</KeyValue>
                <KeyValue label="Uploaded">{fmtDateTime(doc.uploadedAt)} by {doc.uploadedByName}</KeyValue>
                <KeyValue label="Verification">{doc.verification}</KeyValue>
                <KeyValue label="SHA-256" mono>{doc.fileHash}</KeyValue>
                <KeyValue label="OCR applied">{doc.ocrUsed ? 'Yes' : 'No'}</KeyValue>
              </div>
              {doc.notes && <div className="banner info mt-16"><span className="small">{doc.notes}</span></div>}
            </div>
          )}
        </Card>

        <div className="stack">
          <Card>
            <CardHead title="Summary" />
            <div className="card__body stack-sm">
              <div className="row-between small"><span className="muted">Extracted pages</span><strong>{data.pages.length}</strong></div>
              <div className="row-between small"><span className="muted">Tables</span><strong>{data.tables.length}</strong></div>
              <div className="row-between small"><span className="muted">Status</span><Badge tone={statusTone(doc.status)}>{doc.status}</Badge></div>
              <div className="row-between small"><span className="muted">Hash</span><span className="mono xsmall">{doc.fileHash.slice(0, 16)}…</span></div>
              <hr className="divider" />
              <p className="xsmall muted">Original document and extracted data are stored separately. Editing metadata never alters the original file.</p>
            </div>
          </Card>

          <Card>
            <CardHead title="Processing history" right={<History size={15} className="muted" />} />
            <div className="card__body">
              <div className="small muted">{doc.processingLog.length} pipeline event(s) recorded.</div>
              <div className="row gap-6 wrap mt-8">
                {['Upload', 'Validate', 'Extract', 'Normalize', 'Index'].map((s) => (
                  <Badge key={s} tone={doc.processingLog.some((l) => l.stage.startsWith(s.slice(0, 6))) ? 'success' : 'neutral'} dot>{s}</Badge>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <EditMetaModal
        open={editOpen}
        doc={doc}
        categories={data.settings.categories}
        subsidiaries={data.settings.subsidiaries}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); pushToast('Metadata updated.', 'success'); reload(); bumpData(); }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete document"
        message={`Delete "${doc.fileName}" and its extracted content permanently? This is recorded in the audit trail.`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const q = query.trim();
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const lq = q.toLowerCase();
  let i = 0;
  let idx = lower.indexOf(lq);
  let key = 0;
  while (idx >= 0) {
    parts.push(text.slice(i, idx));
    parts.push(<mark key={key++} style={{ background: 'var(--teal-100)', color: 'var(--navy-900)', borderRadius: 3, padding: '0 2px' }}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
    idx = lower.indexOf(lq, i);
  }
  parts.push(text.slice(i));
  return parts;
}

// Locate the cited passage within a page's stored text. Snippets are machine
// generated and may be truncated with an ellipsis, so we fall back to
// progressively shorter word windows until a verbatim match is found.
function findHighlightRange(text: string, snippet: string): [number, number] | null {
  const cleaned = snippet.replace(/[…"“”]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  const lowerText = text.toLowerCase();
  const lower = cleaned.toLowerCase();

  const full = lowerText.indexOf(lower);
  if (full >= 0) return [full, full + lower.length];

  const words = lower.split(' ').filter((w) => w.length > 1);
  for (const win of [10, 8, 6, 5, 4, 3, 2]) {
    for (let i = 0; i + win <= words.length; i++) {
      const frag = words.slice(i, i + win).join(' ');
      const at = lowerText.indexOf(frag);
      if (at >= 0) return [at, at + frag.length];
    }
  }
  return null;
}

function highlightSnippet(text: string, snippet: string): React.ReactNode {
  const range = findHighlightRange(text, snippet);
  if (!range) return text;
  const [start, end] = range;
  return (
    <>
      {text.slice(0, start)}
      <mark className="mark-snippet">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function EditMetaModal({ open, doc, categories, subsidiaries, onClose, onSaved }: {
  open: boolean;
  doc: DocumentRecord;
  categories: string[];
  subsidiaries: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const session = useStore((s) => s.session)!;
  const [category, setCategory] = useState(doc.category);
  const [department, setDepartment] = useState(doc.department);
  const [subsidiary, setSubsidiary] = useState(doc.subsidiary);
  const [period, setPeriod] = useState(doc.reportingPeriod);
  const [verification, setVerification] = useState(doc.verification);
  const [notes, setNotes] = useState(doc.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!/^\d{4}-\d{2}$/.test(period)) { setError('Reporting period must be in YYYY-MM format.'); return; }
    setSaving(true);
    try {
      await updateDocumentMeta(doc.id, { category, department, subsidiary, reportingPeriod: period, verification, notes }, session);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save metadata.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit document metadata" sub={doc.fileName}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save changes</Button></>}>
      <div className="stack">
        {error && <div className="banner error">{error}</div>}
        <div className="grid-2" style={{ gap: 14 }}>
          <Field label="Category"><select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Department"><input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} /></Field>
          <Field label="Subsidiary / scope"><select className="select" value={subsidiary} onChange={(e) => setSubsidiary(e.target.value)}>{subsidiaries.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Reporting period" hint="YYYY-MM" error={/^\d{4}-\d{2}$/.test(period) ? undefined : 'Invalid format'}>
            <input className="input" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <Field label="Verification status">
            <select className="select" value={verification} onChange={(e) => setVerification(e.target.value as DocumentRecord['verification'])}>
              <option>Unverified</option><option>Needs Review</option><option>Verified</option>
            </select>
          </Field>
        </div>
        <Field label="Notes"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="banner info"><span className="small">Metadata changes are recorded in the audit trail. The original file is never modified.</span></div>
      </div>
    </Modal>
  );
}
