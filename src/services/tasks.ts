import type { IssueSeverity } from '../lib/types';
import { getReportsByStatus } from './reports';
import { getConflicts } from './conflicts';
import { getDuplicates } from './duplicates';
import { getIssues } from './validation';
import { periodLabel } from '../lib/util';

export type TaskKind = 'report' | 'conflict' | 'duplicate' | 'validation';

export interface TaskItem {
  kind: TaskKind;
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  severity: IssueSeverity | 'review';
  link: string;
  createdAt: number;
}

export const TASK_LABELS: Record<TaskKind, string> = {
  report: 'Report approval',
  conflict: 'Conflict resolution',
  duplicate: 'Duplicate review',
  validation: 'Validation issue',
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4, review: 5 };

// Aggregates the actionable review queue from the live evidence services.
// Every item deep-links into the workspace screen that owns its resolution flow,
// so the queue never forks review logic.
export async function listTasks(): Promise<TaskItem[]> {
  const items: TaskItem[] = [];

  const reports = await getReportsByStatus('Pending Review');
  for (const r of reports) {
    items.push({
      kind: 'report',
      id: r.id,
      title: r.title,
      subtitle: `${r.type} · ${periodLabel(r.reportingPeriod)} · ${r.createdByName}`,
      detail: 'Awaiting approval or rejection after submission for review.',
      severity: 'review',
      link: `/app/reports/${r.id}`,
      createdAt: r.updatedAt,
    });
  }

  const conflicts = await getConflicts();
  for (const c of conflicts) {
    if (c.status !== 'Unresolved') continue;
    items.push({
      kind: 'conflict',
      id: c.id,
      title: `${c.metric} — ${periodLabel(c.reportingPeriod)}`,
      subtitle: `${c.entity} · ${c.values.map((v) => v.value).join(' vs ')}`,
      detail: 'Two or more documents record different values. Both are preserved until a verified value is selected.',
      severity: 'high',
      link: `/app/conflicts?focus=${c.id}`,
      createdAt: c.createdAt,
    });
  }

  const dupes = await getDuplicates();
  for (const d of dupes) {
    if (d.status !== 'Pending') continue;
    items.push({
      kind: 'duplicate',
      id: d.id,
      title: d.reason,
      subtitle: `${d.exact ? 'Exact hash match' : `Text similarity ${(d.similarity ?? 0).toFixed(1)}%`}`,
      detail: 'Confirm as a duplicate, mark as not a duplicate, or dismiss the match.',
      severity: 'low',
      link: `/app/duplicates?focus=${d.id}`,
      createdAt: d.createdAt,
    });
  }

  const issues = await getIssues();
  for (const i of issues) {
    if (i.status !== 'Open') continue;
    items.push({
      kind: 'validation',
      id: i.id,
      title: i.ruleName,
      subtitle: `${i.docName} · ${i.field}`,
      detail: i.reason,
      severity: i.severity,
      link: `/app/validation?focus=${i.id}`,
      createdAt: i.createdAt,
    });
  }

  return items.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return a.createdAt - b.createdAt;
  });
}

export async function taskStats(): Promise<{ open: number; empty: boolean }> {
  const items = await listTasks();
  return { open: items.length, empty: items.length === 0 };
}