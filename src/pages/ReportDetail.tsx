import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, FileText, History, Pencil, RotateCcw, Send, ShieldAlert, Trash2, XCircle, FileSpreadsheet, FileType, FileDiff } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { coverageBreakdown, decideReport, deleteReport, getReport, reopenReport, saveReportDraft, submitForReview, updateReportContent } from '../services/reports';
import { getDuplicates } from '../services/duplicates';
import { exportReportCsv, exportReportDocx, exportReportPdf, formatCitation } from '../services/export';
import { Badge, Button, Card, CardHead, EmptyState, Field, LoadError, Spinner } from '../components/ui';
import { ConfirmDialog, Modal } from '../components/overlays';
import type { Report, ReportSection, ReportVersion, SourceRef } from '../lib/types';
import { sourceLink } from '../lib/links';
import { diffParagraphs, diffWords, type DiffSegment, type ParagraphDiffRow } from '../lib/diff';
import { fmtDateTime, periodLabel, reportTone } from '../lib/util';

export function ReportDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const session = useStore((s) => s.session)!;
  const pushToast = useStore((s) => s.pushToast);
  const bumpData = useStore((s) => s.bumpData);
  const dataVersion = useStore((s) => s.dataVersion);

  const [evidence, setEvidence] = useState<SourceRef | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'Approved' | 'Rejected'>('Approved');
  const [reviewNote, setReviewNote] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareFrom, setCompareFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const [report, duplicates] = await Promise.all([getReport(id), getDuplicates()]);
    return { report, duplicates };
  }, [id, dataVersion]);

  const report = data?.report;
  const cov = report ? coverageBreakdown(report) : null;
  const unresolvedConflicts = report?.conflictIds.length ?? 0;

  const canEdit = session.role === 'administrator' || session.role === 'analyst';
  const canReview = session.role === 'administrator' || session.role === 'reviewer';

  const allRefs = useMemo(() => {
    if (!report) return [] as SourceRef[];
    const seen = new Set<string>();
    const refs: SourceRef[] = [];
    for (const claim of report.claims) for (const ref of claim.sourceRefs) {
      const key = `${ref.docId}:${ref.pageNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(ref);
    }
    return refs;
  }, [report]);

  if (error) {
    return <Card><div className="card__body"><LoadError message={error} onRetry={reload} /></div></Card>;
  }
  if (loading) return <div className="spin-overlay"><Spinner size="lg" /> Loading report…</div>;
  if (!report || !cov) {
    return <EmptyState icon={<FileText size={28} />} title="Report not found" description="It may have been deleted." action={<Button onClick={() => navigate('/app/reports')}>Back to reports</Button>} />;
  }

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); }
    catch (err) { pushToast(err instanceof Error ? err.message : 'The action could not be completed.', 'error'); }
    finally { setBusy(null); }
  };

  const doSubmit = () => act('submit', async () => { await submitForReview(report.id, session); pushToast('Submitted for review.', 'success'); reload(); bumpData(); });
  const doSave = () => act('save', async () => { await saveReportDraft(report, session); pushToast('Draft saved.', 'success'); reload(); bumpData(); });
  const doReopen = () => act('reopen', async () => { await reopenReport(report.id, session); pushToast('Reopened as draft.', 'success'); reload(); bumpData(); });
  const doDecide = () => act('decide', async () => {
    await decideReport(report.id, reviewDecision, reviewNote, session);
    pushToast(`Report ${reviewDecision.toLowerCase()}.`, reviewDecision === 'Approved' ? 'success' : 'warning');
    setReviewOpen(false); setReviewNote(''); reload(); bumpData();
  });
  const doExport = (kind: 'pdf' | 'docx' | 'csv') => act(`export-${kind}`, async () => {
    if (kind === 'pdf') exportReportPdf(report);
    else if (kind === 'docx') await exportReportDocx(report);
    else exportReportCsv(report);
    pushToast(`Exported as ${kind.toUpperCase()}.`, 'success');
  });
  const doDelete = async () => { await deleteReport(report.id, session); pushToast('Report deleted.', 'success'); bumpData(); navigate('/app/reports'); };

  return (
    <div className="stack">
      <div className="row gap-12">
        <button className="icon-btn" onClick={() => navigate('/app/reports')} aria-label="Back"><ArrowLeft size={18} /></button>
        <div className="grow">
          <div className="row gap-8 wrap">
            <h2 className="grow" style={{ wordBreak: 'break-word' }}>{report.title}</h2>
            <Badge tone={reportTone(report.status)}>{report.status}</Badge>
          </div>
          <p className="sub">{report.type} report · {periodLabel(report.reportingPeriod)} · {report.scope} · Created by {report.createdByName} on {fmtDateTime(report.createdAt)}</p>
        </div>
      </div>

      <div className="row gap-8 wrap no-print">
        {canEdit && (report.status === 'Draft' || report.status === 'Rejected') && (
          <>
            <Button icon={<Pencil size={15} />} onClick={() => setEditOpen(true)}>Edit content</Button>
            <Button icon={<History size={15} />} loading={busy === 'save'} onClick={doSave}>Save draft</Button>
            <Button variant="primary" icon={<Send size={15} />} loading={busy === 'submit'} onClick={doSubmit}>Submit for review</Button>
          </>
        )}
        {canReview && report.status === 'Pending Review' && (
          <>
            <Button variant="primary" icon={<CheckCircle2 size={15} />} onClick={() => { setReviewDecision('Approved'); setReviewOpen(true); }}>Approve</Button>
            <Button variant="danger" icon={<XCircle size={15} />} onClick={() => { setReviewDecision('Rejected'); setReviewOpen(true); }}>Reject</Button>
          </>
        )}
        {report.status === 'Rejected' && canEdit && (
          <Button icon={<RotateCcw size={15} />} loading={busy === 'reopen'} onClick={doReopen}>Reopen as draft</Button>
        )}
        <Button icon={<Download size={15} />} onClick={() => exportReportPdf(report)}>PDF</Button>
        <Button icon={<FileType size={15} />} onClick={() => exportReportDocx(report)}>DOCX</Button>
        <Button icon={<FileSpreadsheet size={15} />} onClick={() => exportReportCsv(report)}>CSV</Button>
        {session.role === 'administrator' && <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setDeleteOpen(true)}>Delete</Button>}
      </div>

      {report.reviewedAt && (
        <div className={report.status === 'Approved' ? 'banner success' : 'banner error'}>
          <span className="small"><strong>{report.status}</strong> by {report.reviewedByName} on {fmtDateTime(report.reviewedAt)}. {report.reviewNote}</span>
        </div>
      )}

      <div className="grid-dash">
        <div className="report-doc" id="report-print">
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div>
              <h2>{report.title}</h2>
              <p className="small muted mt-4">{report.type} · Reporting period {periodLabel(report.reportingPeriod)} · {report.scope}</p>
            </div>
            <Badge tone={reportTone(report.status)}>{report.status}</Badge>
          </div>

          <h3>Executive Summary</h3>
          <p>{report.executiveSummary}</p>

          {report.sections.map((section) => (
            <ReportSectionView key={section.id} section={section} onCite={setEvidence} />
          ))}

          <h3>Source References</h3>
          {allRefs.length === 0 ? (
            <p className="muted">No cited sources. All sections were reported as unverified.</p>
          ) : (
            <ol style={{ paddingLeft: 18, marginTop: 8 }}>
              {allRefs.map((ref, i) => (
                <li key={i} className="small" style={{ marginBottom: 4 }}>
                  <button className="citation" onClick={() => setEvidence(ref)}>{formatCitation(ref)}</button>
                </li>
              ))}
            </ol>
          )}

          <hr className="divider" style={{ margin: '24px 0 12px' }} />
          <p className="xsmall muted">
            Generated {fmtDateTime(report.createdAt)} · Report ID <span className="mono">{report.id}</span> · Synthetic demonstration report produced by the STRATAVEX prototype. Does not represent a real mine, subsidiary or operational record.
          </p>
        </div>

        <div className="stack no-print">
          <Card>
            <CardHead title="Source coverage" sub="Evidence quality, not an accuracy score" />
            <div className="card__body stack-sm">
              <div className="row-between">
                <span className="muted small">Source coverage</span>
                <span className="strong" style={{ fontSize: 22 }}>{cov.coverage === null ? 'N/A' : cov.coverage + '%'}</span>
              </div>
              <div className="progress"><span style={{ width: `${cov.coverage ?? 0}%` }} /></div>
              <div className="row-between small mt-4"><span className="muted">Factual claims</span><strong>{cov.totalClaims}</strong></div>
              <div className="row-between small"><span className="muted">Claims with sources</span><strong>{cov.supported}</strong></div>
              <div className="row-between small"><span className="muted">Awaiting verification</span><strong>{cov.awaitingVerification}</strong></div>
              <div className="row-between small"><span className="muted">Unresolved conflicts</span><strong>{unresolvedConflicts}</strong></div>
              <hr className="divider" />
              <div className="xsmall muted">
                {cov.coverage === null
                  ? 'This report contains no factual claims, so source coverage is not applicable.'
                  : 'Source Coverage = claims with supporting sources ÷ total factual claims. Accuracy has not been independently evaluated for this prototype.'}
              </div>
            </div>
          </Card>

          {unresolvedConflicts > 0 && (
            <Card>
              <CardHead title="Unresolved conflicts" right={<Badge tone="error">{unresolvedConflicts}</Badge>} />
              <div className="card__body">
                <div className="banner warn"><ShieldAlert size={15} /><span className="small">This report references {unresolvedConflicts} unresolved conflict(s). Both values are preserved; review before approval.</span></div>
                <Button size="sm" variant="ghost" className="mt-8" onClick={() => navigate('/app/conflicts')}>Open Conflict Review</Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHead title="Version history" sub="Content snapshots are captured at save time and are diffable" right={<Button size="sm" variant="ghost" icon={<FileDiff size={14} />} onClick={() => { setCompareFrom(null); setCompareOpen(true); }}>Compare versions</Button>} />
            <div className="card__body">
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }} className="stack-sm">
                {[...report.versions].reverse().map((v) => {
                  const isLatest = v.version === report.versions[report.versions.length - 1].version;
                  return (
                    <li key={v.version} className="row gap-10">
                      <Badge tone={reportTone(v.status)}>v{v.version}</Badge>
                      <div className="grow">
                        <div className="small">{v.note}</div>
                        <div className="xsmall dim">{fmtDateTime(v.at)} · <span className="mono">{v.contentHash.slice(0, 10)}…</span>{!v.snapshot && ' · snapshot N/A'}</div>
                      </div>
                      {!isLatest && (
                        <Button size="sm" variant="ghost" icon={<FileDiff size={13} />} onClick={() => { setCompareFrom(v.version); setCompareOpen(true); }}>Diff</Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={!!evidence} onClose={() => setEvidence(null)} title="Supporting evidence"
        sub={evidence ? `${evidence.docName} → ${evidence.section ?? 'General'} → Page ${evidence.pageNo}` : ''}
        footer={evidence && (<><Button variant="ghost" onClick={() => setEvidence(null)}>Close</Button><Button variant="primary" onClick={() => navigate(sourceLink(evidence))}>Open document</Button></>)}>
        {evidence && (
          <div className="evidence"><div className="src">{evidence.docName}</div><blockquote>"{evidence.snippet ?? 'No snippet available.'}"</blockquote></div>
        )}
      </Modal>

      {editOpen && <EditReportModal report={report} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); pushToast('Report content updated.', 'success'); reload(); bumpData(); }} actor={session} />}

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={`${reviewDecision === 'Approved' ? 'Approve' : 'Reject'} report`}
        footer={<><Button variant="ghost" onClick={() => setReviewOpen(false)}>Cancel</Button><Button variant={reviewDecision === 'Approved' ? 'primary' : 'danger'} loading={busy === 'decide'} onClick={doDecide}>{reviewDecision === 'Approved' ? 'Approve report' : 'Reject report'}</Button></>}>
        <Field label="Review note" hint="Recorded with the decision in the report version history and audit trail.">
          <textarea className="textarea" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Reason for the decision…" />
        </Field>
      </Modal>

      <ConfirmDialog open={deleteOpen} title="Delete report" message="Delete this report permanently? The action is recorded in the audit trail." confirmLabel="Delete report" danger onConfirm={doDelete} onCancel={() => setDeleteOpen(false)} />

      {compareOpen && <CompareVersionsModal report={report} initialFrom={compareFrom} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}

function ReportSectionView({ section, onCite }: { section: ReportSection; onCite: (r: SourceRef) => void }) {
  return (
    <div>
      <h3>{section.heading}</h3>
      {section.noContent ? (
        <div className="banner warn">{section.body}</div>
      ) : (
        section.body.split('\n\n').map((para, i) => (
          <div key={i} className="claim"><p>{para}</p></div>
        ))
      )}
      {(section.tables ?? []).map((t, ti) => (
        <div key={ti} className="card mt-12" style={{ overflow: 'hidden' }}>
          <div className="card__head" style={{ padding: '8px 12px' }}><span className="small strong">{t.title}</span></div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr>{t.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="small">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

interface ReportSnapshot {
  title?: string;
  summary?: string;
  sections?: ReportSection[];
}

function parseSnapshot(version?: ReportVersion): ReportSnapshot | null {
  if (!version?.snapshot) return null;
  try {
    return JSON.parse(version.snapshot) as ReportSnapshot;
  } catch {
    return null;
  }
}

function DiffPane({ side, text, inline, empty }: { side: 'left' | 'right'; text: string; inline?: DiffSegment[]; empty?: boolean }) {
  const variant = side === 'left' ? 'diff-pane--del' : 'diff-pane--add';
  if (empty) return <div className="diff-pane" aria-hidden="true" />;
  const hasChange = inline?.some((s) => s.type !== 'same');
  return (
    <div className={`diff-pane ${hasChange || !inline ? variant : ''}`}>
      {inline
        ? inline.map((seg, i) => {
            if (side === 'left') {
              if (seg.type === 'add') return null;
              return seg.type === 'del' ? <span key={i} className="diff-w">{seg.text}</span> : <span key={i}>{seg.text}</span>;
            }
            if (seg.type === 'del') return null;
            return seg.type === 'add' ? <span key={i} className="diff-a">{seg.text}</span> : <span key={i}>{seg.text}</span>;
          })
        : text}
    </div>
  );
}

function DiffRows({ rows }: { rows: ParagraphDiffRow[] }) {
  const visible = rows.filter((r) => r.type !== 'same' || !!r.inline?.some((s) => s.type !== 'same'));
  if (visible.length === 0) return <p className="small muted">No changes in this section.</p>;
  return (
    <div className="stack-sm">
      {visible.map((r, i) => (
        <div key={i} className="diff-row">
          <DiffPane side="left" text={r.left ?? ''} inline={r.type === 'same' ? r.inline : undefined} empty={r.type === 'add'} />
          <DiffPane side="right" text={r.right ?? ''} inline={r.type === 'same' ? r.inline : undefined} empty={r.type === 'del'} />
        </div>
      ))}
    </div>
  );
}

function CompareVersionsModal({ report, initialFrom, onClose }: { report: Report; initialFrom: number | null; onClose: () => void }) {
  const versions = report.versions;
  const latest = versions[versions.length - 1]?.version ?? 0;
  const secondLatest = versions[versions.length - 2]?.version ?? latest;
  const [to, setTo] = useState<number>(latest);
  const [from, setFrom] = useState<number>(initialFrom ?? secondLatest);

  const fromV = versions.find((v) => v.version === from);
  const toV = versions.find((v) => v.version === to);
  const fromSnap = parseSnapshot(fromV);
  const toSnap = parseSnapshot(toV);

  const sectionDiffs = useMemo(() => {
    if (!fromSnap || !toSnap) return [] as { id: string; heading: string; rows: ParagraphDiffRow[] }[];
    const fromMap = new Map((fromSnap.sections ?? []).map((s) => [s.id, s]));
    const toMap = new Map((toSnap.sections ?? []).map((s) => [s.id, s]));
    const ids = [
      ...(toSnap.sections ?? []).map((s) => s.id),
      ...(fromSnap.sections ?? []).map((s) => s.id).filter((id) => !toMap.has(id)),
    ];
    return ids.map((id) => {
      const a = fromMap.get(id);
      const b = toMap.get(id);
      return { id, heading: b?.heading ?? a?.heading ?? id, rows: diffParagraphs(a?.body ?? '', b?.body ?? '') };
    });
  }, [fromSnap, toSnap]);

  const titleRows = fromSnap && toSnap && fromSnap.title !== toSnap.title ? diffParagraphs(fromSnap.title ?? '', toSnap.title ?? '') : [];
  const summaryRows = fromSnap && toSnap ? diffParagraphs(fromSnap.summary ?? '', toSnap.summary ?? '') : [];
  const hasContentChanges = titleRows.length > 0 || summaryRows.some((r) => r.type !== 'same' || !!r.inline?.some((s) => s.type !== 'same'))
    || sectionDiffs.some((s) => s.rows.some((r) => r.type !== 'same' || !!r.inline?.some((x) => x.type !== 'same')));

  const versionOption = (v: ReportVersion) => `v${v.version} — ${v.status} · ${fmtDateTime(v.at)}`;

  return (
    <Modal open onClose={onClose} title="Compare versions" width="xwide"
      sub="Paragraph-aligned comparison of two saved content snapshots. Removed text is struck through; added text is highlighted."
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="stack">
        <div className="grid-2" style={{ gap: 14 }}>
          <Field label="From version">
            <select className="select" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {versions.map((v) => <option key={v.version} value={v.version} disabled={v.version === to}>{versionOption(v)}</option>)}
            </select>
          </Field>
          <Field label="To version">
            <select className="select" value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {versions.map((v) => <option key={v.version} value={v.version} disabled={v.version === from}>{versionOption(v)}</option>)}
            </select>
          </Field>
        </div>

        {!fromSnap || !toSnap ? (
          <div className="banner warn"><ShieldAlert size={15} /><span className="small">One or both selected versions predate snapshot capture, so a content diff is not available for them.</span></div>
        ) : from === to ? (
          <div className="banner info"><span className="small">Select two different versions to compare.</span></div>
        ) : !hasContentChanges ? (
          <div className="banner success"><CheckCircle2 size={15} /><span className="small">No content changes between v{from} and v{to}.</span></div>
        ) : (
          <>
            {titleRows.length > 0 && (
              <div>
                <h3>Title</h3>
                <DiffRows rows={titleRows} />
              </div>
            )}
            <div>
              <h3>Executive summary</h3>
              <DiffRows rows={summaryRows} />
            </div>
            {sectionDiffs.map((s) => (
              <div key={s.id}>
                <h3>{s.heading}</h3>
                <DiffRows rows={s.rows} />
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}

function EditReportModal({ report, onClose, onSaved, actor }: {
  report: Report; onClose: () => void; onSaved: () => void; actor: { id: string; name: string; role: 'administrator' | 'analyst' | 'reviewer' };
}) {
  const [title, setTitle] = useState(report.title);
  const [summary, setSummary] = useState(report.executiveSummary);
  const [sections, setSections] = useState<ReportSection[]>(JSON.parse(JSON.stringify(report.sections)));
  const [saving, setSaving] = useState(false);

  const updateSection = (id: string, body: string) => setSections((prev) => prev.map((s) => (s.id === id ? { ...s, body, noContent: false } : s)));

  const save = async () => {
    setSaving(true);
    try {
      await updateReportContent(report.id, { title, executiveSummary: summary, sections }, actor);
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Edit report content" width="wide"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save changes</Button></>}>
      <div className="stack">
        <div className="banner info"><span className="small">Manual edits are saved as a new version. Automated findings keep their citations; edited prose is marked as authored content.</span></div>
        <Field label="Report title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Executive summary"><textarea className="textarea" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
        {sections.map((s) => (
          <Field key={s.id} label={s.heading}>
            <textarea className="textarea" rows={4} value={s.body} onChange={(e) => updateSection(s.id, e.target.value)} />
          </Field>
        ))}
      </div>
    </Modal>
  );
}
