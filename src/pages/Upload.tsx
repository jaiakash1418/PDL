import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileWarning, Trash2, UploadCloud, X } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { ALLOWED_EXTENSIONS, ingestFile, validateFile } from '../services/documents';
import { detectConflicts } from '../services/conflicts';
import { detectDuplicates } from '../services/duplicates';
import { runValidation } from '../services/validation';
import { getSettings } from '../services/settings';
import { invalidateRetrievalIndex } from '../services/retrieval';
import { Badge, Button, Card, CardHead, Field, Progress } from '../components/ui';
import { clsx } from 'clsx';

interface QueueItem {
  key: string;
  file: File;
  status: 'queued' | 'processing' | 'done' | 'error';
  message?: string;
  docId?: string;
  error?: string;
}

const PIPELINE = ['Upload', 'Validate', 'Extract text', 'Extract tables', 'Normalise', 'Index'];

export function Upload() {
  const navigate = useNavigate();
  const session = useStore((s) => s.session)!;
  const settings = useStore((s) => s.settings);
  const pushToast = useStore((s) => s.pushToast);
  const bumpData = useStore((s) => s.bumpData);

  const { data } = useAsync(async () => ({ settings: await getSettings() }), []);
  const categories = data?.settings.categories ?? settings?.categories ?? [];
  const subsidiaries = data?.settings.subsidiaries ?? settings?.subsidiaries ?? [];

  const [category, setCategory] = useState(categories[0] ?? 'Production Report');
  const [department, setDepartment] = useState('Production');
  const [subsidiary, setSubsidiary] = useState(settings?.subsidiary ?? subsidiaries[0] ?? '');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const next: QueueItem[] = [];
    for (const file of Array.from(files)) {
      const check = validateFile(file);
      next.push({
        key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        status: check.ok ? 'queued' : 'error',
        error: check.ok ? undefined : check.error,
      });
    }
    setItems((prev) => [...prev, ...next]);
  };

  const processAll = async () => {
    const queued = items.filter((i) => i.status === 'queued');
    if (queued.length === 0) { pushToast('No valid files queued.', 'warning'); return; }
    setBusy(true);
    for (const item of queued) {
      setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'processing' } : i)));
      try {
        const res = await ingestFile(item.file, { category, department, subsidiary, reportingPeriod: period, notes: notes || undefined, actor: session });
        setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'done', docId: res.doc.id, message: `${res.doc.status} · ${res.doc.pageCount} page(s)${res.warnings.length ? ' · ' + res.warnings.length + ' warning(s)' : ''}` } : i)));
      } catch (err) {
        setItems((prev) => prev.map((i) => (i.key === item.key ? { ...i, status: 'error', error: err instanceof Error ? err.message : 'Processing failed.' } : i)));
      }
    }
    // Re-run analysis so new content is reflected everywhere.
    await detectConflicts();
    await detectDuplicates();
    await runValidation();
    invalidateRetrievalIndex();
    bumpData();
    setBusy(false);
    const done = items.filter((i) => i.status === 'queued').length;
    pushToast(`${done} file(s) processed. Analysis refreshed.`, 'success');
  };

  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));
  const clearDone = () => setItems((prev) => prev.filter((i) => i.status !== 'done'));

  const doneCount = items.filter((i) => i.status === 'done').length;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Upload & Processing</h2>
          <p className="sub">Ingestion pipeline: {PIPELINE.join(' → ')}. If a format cannot be fully processed, the original is preserved and the limitation is recorded honestly.</p>
        </div>
      </div>

      <div className="grid-dash">
        <Card>
          <CardHead title="Select files" sub={`Supported: ${ALLOWED_EXTENSIONS.join(', ')} · max 25 MB each`} />
          <div className="card__body">
            <div
              className={clsx('dropzone', over && 'over')}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}
            >
              <UploadCloud size={34} style={{ color: 'var(--teal-600)' }} />
              <h3 className="mt-12">Drag and drop files here</h3>
              <p className="small muted mt-4">or click to browse. Multiple files are supported.</p>
              <input ref={inputRef} type="file" multiple style={{ display: 'none' }} accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.png,.jpg,.jpeg,.webp" onChange={(e) => e.target.files && addFiles(e.target.files)} />
            </div>

            {items.length > 0 && (
              <div className="stack-sm mt-16">
                <div className="row-between">
                  <span className="small strong">{items.length} file(s) in queue</span>
                  {doneCount > 0 && <Button size="sm" variant="ghost" onClick={clearDone}>Clear completed</Button>}
                </div>
                {items.map((i) => (
                  <div key={i.key} className="file-row">
                    <span className="file-icon">
                      {i.status === 'done' ? <CheckCircle2 size={16} color="var(--success)" /> : i.status === 'error' ? <FileWarning size={16} color="var(--error)" /> : <FileWarning size={16} />}
                    </span>
                    <div className="grow col" style={{ gap: 4, minWidth: 0 }}>
                      <span className="small strong truncate">{i.file.name}</span>
                      {i.status === 'processing' && <Progress value={65} tone="proc" />}
                      {i.message && <span className="xsmall muted">{i.message}</span>}
                      {i.error && <span className="xsmall" style={{ color: 'var(--error)' }}>{i.error}</span>}
                    </div>
                    <Badge tone={i.status === 'done' ? 'success' : i.status === 'error' ? 'error' : i.status === 'processing' ? 'processing' : 'neutral'}>{i.status}</Badge>
                    {i.status !== 'processing' && (
                      <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => removeItem(i.key)} aria-label="Remove"><X size={14} /></button>
                    )}
                    {i.docId && <Button size="sm" variant="ghost" onClick={() => navigate(`/app/documents/${i.docId}`)}>Open</Button>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card__foot row-between">
            <span className="small muted">{items.filter((i) => i.status === 'queued').length} ready to process</span>
            <div className="row gap-8">
              <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setItems([])} disabled={items.length === 0}>Reset queue</Button>
              <Button variant="primary" icon={<UploadCloud size={15} />} loading={busy} disabled={items.filter((i) => i.status === 'queued').length === 0} onClick={processAll}>
                Process files
              </Button>
            </div>
          </div>
        </Card>

        <div className="stack">
          <Card>
            <CardHead title="Document metadata" sub="Applied to every file in this batch" />
            <div className="card__body stack">
              <Field label="Category"><select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Department / scope"><input className="input" value={department} onChange={(e) => setDepartment(e.target.value)} /></Field>
              <Field label="Subsidiary"><select className="select" value={subsidiary} onChange={(e) => setSubsidiary(e.target.value)}>{subsidiaries.map((s) => <option key={s}>{s}</option>)}</select></Field>
              <Field label="Reporting period" hint="YYYY-MM"><input className="input" value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
              <Field label="Notes (optional)"><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context recorded with the upload." /></Field>
            </div>
          </Card>

          <Card>
            <CardHead title="Pipeline stages" />
            <div className="card__body">
              <div className="pill-list">
                {PIPELINE.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
              </div>
              <div className="banner warn mt-16">
                <AlertTriangle size={15} />
                <span className="small">OCR for scanned images and PDFs runs on demand from the document detail page (browser OCR). Large scans may take several seconds.</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
