import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, Copy, FileText, GitCompareArrows, ShieldAlert, ArrowRight } from 'lucide-react';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { listTasks, type TaskItem, type TaskKind, TASK_LABELS } from '../services/tasks';
import { Badge, Button, Card, EmptyState, LoadError, Spinner } from '../components/ui';
import { severityTone } from '../lib/util';

const toneFor = (t: TaskItem) => t.severity === 'review' ? 'processing' : severityTone(t.severity);

const KIND_ICONS: Record<TaskKind, React.ReactNode> = {
  report: <FileText size={17} />,
  conflict: <GitCompareArrows size={17} />,
  duplicate: <Copy size={17} />,
  validation: <ShieldAlert size={17} />,
};

export function Tasks() {
  const navigate = useNavigate();
  const dataVersion = useStore((s) => s.dataVersion);
  const [kind, setKind] = useState<'all' | TaskKind>('all');

  const { data, loading, error, reload } = useAsync(async () => ({ tasks: await listTasks() }), [dataVersion]);

  const filtered = useMemo(() => {
    const tasks = data?.tasks ?? [];
    return kind === 'all' ? tasks : tasks.filter((t) => t.kind === kind);
  }, [data, kind]);

  const counts = useMemo(() => {
    const c: Record<'all' | TaskKind, number> = { all: 0, report: 0, conflict: 0, duplicate: 0, validation: 0 };
    for (const t of data?.tasks ?? []) c[t.kind]++;
    c.all = data?.tasks.length ?? 0;
    return c;
  }, [data]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>My Tasks</h2>
          <p className="sub">
            A single queue across report approvals, conflict resolutions, duplicate reviews and open validation issues.
            Selecting an item opens the workspace screen it belongs to, with the record ready to review.
          </p>
        </div>
        <Badge tone="teal" dot>{counts.all} outstanding</Badge>
      </div>

      <div className="row gap-8 wrap">
        <button className={kind === 'all' ? 'chip active' : 'chip'} onClick={() => setKind('all')}>All ({counts.all})</button>
        <button className={kind === 'report' ? 'chip active' : 'chip'} onClick={() => setKind('report')}>Reports ({counts.report})</button>
        <button className={kind === 'conflict' ? 'chip active' : 'chip'} onClick={() => setKind('conflict')}>Conflicts ({counts.conflict})</button>
        <button className={kind === 'duplicate' ? 'chip active' : 'chip'} onClick={() => setKind('duplicate')}>Duplicates ({counts.duplicate})</button>
        <button className={kind === 'validation' ? 'chip active' : 'chip'} onClick={() => setKind('validation')}>Validation ({counts.validation})</button>
      </div>

      <Card>
        {loading ? (
          <div className="spin-overlay"><Spinner /> Building task queue…</div>
        ) : error ? (
          <div className="card__body"><LoadError message={error} onRetry={reload} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<CheckSquare size={28} />}
            title={kind === 'all' ? 'Nothing awaiting review' : `No ${TASK_LABELS[kind as TaskKind].toLowerCase()} tasks`}
            description="When reports are submitted for review, or conflicts, duplicates and validation issues remain open, they appear here for the reviewer queue."
          />
        ) : (
          <div className="stack-sm">
            {filtered.map((t) => (
              <button key={`${t.kind}:${t.id}`} className="task-row" onClick={() => navigate(t.link)}>
                <span className="task-row__icon">{KIND_ICONS[t.kind]}</span>
                <span className="grow col" style={{ alignItems: 'flex-start', gap: 2, minWidth: 0 }}>
                  <span className="row gap-8 wrap">
                    <span className="small strong" style={{ color: 'var(--ink-900)' }}>{t.title}</span>
                    {t.kind === 'report'
                      ? <Badge tone="processing">Pending approval</Badge>
                      : <Badge tone={toneFor(t)} dot>{t.severity}</Badge>}
                  </span>
                  <span className="xsmall muted">{t.subtitle}</span>
                  <span className="xsmall dim" style={{ maxWidth: 560 }}>{t.detail}</span>
                </span>
                <span className="task-row__go"><ArrowRight size={16} /></span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {!loading && filtered.length > 0 && (
        <div className="banner info"><span className="small">
          Decisions made on an item are recorded in its source workspace. The queue refreshes automatically when a task is cleared.
        </span></div>
      )}

      <div className="row gap-8 wrap">
        <Button size="sm" variant="ghost" onClick={() => navigate('/app/validation?status=Open')}>Open all validation issues</Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/app/conflicts?status=Unresolved')}>Open all conflicts</Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/app/duplicates')}>Open duplicate detection</Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/app/reports?status=Pending Review')}>Open reports</Button>
      </div>
    </div>
  );
}