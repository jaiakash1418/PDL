import type { DocumentRecord, IssueSeverity, IssueStatus, SourceRef, ValidationIssue } from '../lib/types';
import { getAll, put } from '../lib/db';
import { shortHash } from '../lib/crypto';
import { now, periodLabel, periodSortKey } from '../lib/util';
import { collectMetricRecords, canonicalUnit, type MetricRecord } from './metrics';
import { listDocuments } from './documents';
import { getConflicts } from './conflicts';
import { getDuplicates } from './duplicates';

export async function getIssues(): Promise<ValidationIssue[]> {
  const list = await getAll('validations');
  return sortIssues(list);
}

export function sortIssues(list: ValidationIssue[]): ValidationIssue[] {
  const sevOrder: Record<IssueSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const statusOrder: Record<IssueStatus, number> = { Open: 0, Reviewed: 1, Resolved: 2, Dismissed: 3 };
  return [...list].sort((a, b) => {
    const s = statusOrder[a.status] - statusOrder[b.status];
    if (s !== 0) return s;
    return sevOrder[a.severity] - sevOrder[b.severity];
  });
}

function sourceRef(doc: DocumentRecord, pageNo = 1, section?: string, snippet?: string): SourceRef {
  return { docId: doc.id, docName: doc.fileName, section, pageNo, snippet };
}

async function makeIssue(partial: Omit<ValidationIssue, 'id' | 'createdAt' | 'status'> & { key: string }, prev: Map<string, ValidationIssue>): Promise<ValidationIssue> {
  const id = `val_${await shortHash(partial.key)}`;
  const existing = prev.get(id);
  return {
    ...partial,
    id,
    createdAt: existing?.createdAt ?? now(),
    status: existing?.status ?? 'Open',
    reviewNote: existing?.reviewNote,
    reviewedBy: existing?.reviewedBy,
    reviewedByName: existing?.reviewedByName,
    reviewedAt: existing?.reviewedAt,
    resolution: existing?.resolution,
  };
}

// Runs the validation rule engine over the current dataset. Rule decisions that
// a human has already made (reviewed / resolved / dismissed) are preserved across
// re-runs by matching on a stable issue id.
export async function runValidation(): Promise<ValidationIssue[]> {
  const prev = new Map((await getAll('validations')).map((v) => [v.id, v]));
  const docs = await listDocuments();
  const records = await collectMetricRecords(docs);
  const issues: ValidationIssue[] = [];

  for (const doc of docs) {
    // Rule: missing reporting period
    if (!doc.reportingPeriod) {
      issues.push(await makeIssue({
        key: `period-missing|${doc.id}`, ruleId: 'metadata.period.missing', ruleName: 'Missing required field',
        severity: 'high', docId: doc.id, docName: doc.fileName, field: 'Reporting period',
        currentValue: '(empty)', reason: 'The reporting period is required for period-based reporting and comparison.',
        sourceRef: sourceRef(doc), suggestion: 'Set the reporting period in document metadata.',
      }, prev));
    } else if (!/^\d{4}-\d{2}$/.test(doc.reportingPeriod)) {
      issues.push(await makeIssue({
        key: `period-format|${doc.id}`, ruleId: 'metadata.period.format', ruleName: 'Invalid format',
        severity: 'medium', docId: doc.id, docName: doc.fileName, field: 'Reporting period',
        currentValue: doc.reportingPeriod, expected: 'YYYY-MM',
        reason: 'Reporting periods must use the YYYY-MM format to be grouped and compared correctly.',
        sourceRef: sourceRef(doc), suggestion: 'Normalise the reporting period to YYYY-MM.',
      }, prev));
    }

    if (!doc.department) {
      issues.push(await makeIssue({
        key: `dept-missing|${doc.id}`, ruleId: 'metadata.department.missing', ruleName: 'Missing required field',
        severity: 'low', docId: doc.id, docName: doc.fileName, field: 'Department',
        currentValue: '(empty)', reason: 'No department/scope is recorded, weakening source attribution.',
        sourceRef: sourceRef(doc), suggestion: 'Assign a department or organisational scope.',
      }, prev));
    }

    if (doc.status === 'Failed') {
      issues.push(await makeIssue({
        key: `failed|${doc.id}`, ruleId: 'processing.failed', ruleName: 'Processing failure',
        severity: 'high', docId: doc.id, docName: doc.fileName, field: 'Processing status',
        currentValue: doc.status, expected: 'Indexed', reason: 'Content could not be extracted, so the document cannot be queried or validated.',
        sourceRef: sourceRef(doc), suggestion: 'Re-upload a text-based file or run OCR if the source is a scan.',
      }, prev));
    } else if (doc.status === 'Partially Processed') {
      issues.push(await makeIssue({
        key: `partial|${doc.id}`, ruleId: 'processing.partial', ruleName: 'Partially processed record',
        severity: 'medium', docId: doc.id, docName: doc.fileName, field: 'Processing status',
        currentValue: doc.status, expected: 'Indexed', reason: 'Only part of this document could be extracted, so its coverage is incomplete.',
        sourceRef: sourceRef(doc), suggestion: 'Run OCR or reprocess the document; verify extracted values manually.',
      }, prev));
    }

    if (doc.verification === 'Unverified' && !doc.isSeed) {
      issues.push(await makeIssue({
        key: `unverified|${doc.id}`, ruleId: 'verification.unverified', ruleName: 'Record requires manual verification',
        severity: 'info', docId: doc.id, docName: doc.fileName, field: 'Verification status',
        currentValue: 'Unverified', expected: 'Verified', reason: 'This record has not been marked as verified by a reviewer.',
        sourceRef: sourceRef(doc), suggestion: 'Confirm the extracted content and mark the document as verified.',
      }, prev));
    }
  }

  // Rule: inconsistent units within a metric group
  const unitGroups = new Map<string, MetricRecord[]>();
  for (const r of records) {
    const k = `${r.normLabel}|${r.subsidiary}`;
    const arr = unitGroups.get(k) ?? [];
    arr.push(r);
    unitGroups.set(k, arr);
  }
  for (const [k, recs] of unitGroups) {
    const units = new Set(recs.map((r) => r.unit).filter(Boolean));
    if (units.size > 1) {
      const sample = recs[0];
      const doc = docs.find((d) => d.id === sample.docId)!;
      issues.push(await makeIssue({
        key: `units|${k}`, ruleId: 'units.inconsistent', ruleName: 'Inconsistent units',
        severity: 'medium', docId: doc.id, docName: doc.fileName, field: 'Unit',
        currentValue: [...units].join(', '), expected: 'A single consistent unit',
        reason: `The metric "${sample.label}" is recorded in more than one unit (${[...units].join(', ')}), so values may not be directly comparable.`,
        sourceRef: sourceRef(doc, sample.pageNo, sample.section, sample.raw),
        suggestion: 'Confirm the intended unit and convert values to a single canonical unit.',
        resolution: undefined,
      }, prev));
    }
  }

  // Rule: unexpected historical change between consecutive periods
  const series = new Map<string, MetricRecord[]>();
  for (const r of records) {
    const k = `${r.normLabel}|${r.subsidiary}`;
    const arr = series.get(k) ?? [];
    arr.push(r);
    series.set(k, arr);
  }
  for (const [, recs] of series) {
    const byPeriod = new Map<string, MetricRecord>();
    for (const r of recs) if (!byPeriod.has(r.period)) byPeriod.set(r.period, r);
    const ordered = [...byPeriod.entries()].sort((a, b) => periodSortKey(a[0]) - periodSortKey(b[0]));
    for (let i = 1; i < ordered.length; i++) {
      const [p0, r0] = ordered[i - 1];
      const [p1, r1] = ordered[i];
      if (r0.value === 0) continue;
      const change = ((r1.value - r0.value) / Math.abs(r0.value)) * 100;
      if (Math.abs(change) >= 40) {
        const doc = docs.find((d) => d.id === r1.docId)!;
        issues.push(await makeIssue({
          key: `hist|${r1.normLabel}|${r1.subsidiary}|${p1}`,
          ruleId: 'history.unexpected_change', ruleName: 'Unexpected historical change',
          severity: 'medium', docId: doc.id, docName: doc.fileName, field: r1.label,
          currentValue: `${r1.raw} (${periodLabel(p1)})`,
          expected: `within ~±40% of ${r0.raw} (${periodLabel(p0)})`,
          reason: `This metric moved ${change > 0 ? '+' : ''}${change.toFixed(1)}% between ${periodLabel(p0)} and ${periodLabel(p1)}, which exceeds the expected range.`,
          sourceRef: sourceRef(doc, r1.pageNo, r1.section, r1.raw),
          suggestion: 'Confirm whether the change reflects a genuine operational event or a data-entry error.',
        }, prev));
      }
    }
  }

  // Rule: unresolved conflicts surfaced as validation issues
  const conflicts = await getConflicts();
  for (const c of conflicts) {
    if (c.status !== 'Unresolved') continue;
    const first = c.values[0];
    const doc = docs.find((d) => d.id === first.docId) ?? docs[0];
    if (!doc) continue;
    issues.push(await makeIssue({
      key: `conflict|${c.id}`, ruleId: 'conflict.detected', ruleName: 'Conflicting values',
      severity: 'high', docId: doc.id, docName: doc.fileName, field: c.metric,
      currentValue: c.values.map((v) => `${v.value} (${v.docName})`).join('  vs  '),
      reason: `Two or more documents record different values for "${c.metric}" in ${periodLabel(c.reportingPeriod)}.`,
      sourceRef: sourceRef(doc, first.pageNo, first.section, first.snippet),
      suggestion: 'Open the Conflict Review workspace, inspect the evidence, and select a verified value with justification.',
    }, prev));
  }

  // Rule: exact duplicate documents
  const dupes = await getDuplicates();
  for (const d of dupes) {
    if (!d.exact) continue;
    const doc = docs.find((x) => x.id === d.docAId);
    if (!doc) continue;
    issues.push(await makeIssue({
      key: `dupe|${d.id}`, ruleId: 'duplicate.exact', ruleName: 'Duplicate entry',
      severity: 'low', docId: doc.id, docName: doc.fileName, field: 'File',
      currentValue: 'Duplicate file detected', reason: d.reason,
      sourceRef: sourceRef(doc), suggestion: 'Review the duplicate pair and confirm or reject the match.',
    }, prev));
  }

  for (const i of issues) await put('validations', i);
  return sortIssues(issues);
}

export async function reviewIssue(id: string, status: IssueStatus, input: { note?: string; resolution?: string; actor: { id: string; name: string } }): Promise<void> {
  const issue = (await getAll('validations')).find((v) => v.id === id);
  if (!issue) return;
  issue.status = status;
  if (input.note !== undefined) issue.reviewNote = input.note;
  if (input.resolution !== undefined) issue.resolution = input.resolution;
  issue.reviewedBy = input.actor.id;
  issue.reviewedByName = input.actor.name;
  issue.reviewedAt = now();
  await put('validations', issue);
}

export async function issueStats(): Promise<{ open: number; reviewed: number; resolved: number; dismissed: number; total: number; bySeverity: Record<string, number> }> {
  const list = await getAll('validations');
  const bySeverity: Record<string, number> = {};
  for (const i of list) bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
  return {
    open: list.filter((i) => i.status === 'Open').length,
    reviewed: list.filter((i) => i.status === 'Reviewed').length,
    resolved: list.filter((i) => i.status === 'Resolved').length,
    dismissed: list.filter((i) => i.status === 'Dismissed').length,
    total: list.length,
    bySeverity,
  };
}

export { canonicalUnit };
