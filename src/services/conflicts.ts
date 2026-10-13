import type { Conflict, ConflictValue } from '../lib/types';
import { getAll, put } from '../lib/db';
import { shortHash, sha256Hex } from '../lib/crypto';
import { now } from '../lib/util';
import { collectMetricRecords, groupKey, type MetricRecord } from './metrics';

export async function getConflicts(): Promise<Conflict[]> {
  const list = await getAll('conflicts');
  return list.sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'Unresolved' ? -1 : 1));
}

export async function getConflict(id: string): Promise<Conflict | undefined> {
  const list = await getAll('conflicts');
  return list.find((c) => c.id === id);
}

// Real detection: group normalised metric records by (metric, period, scope) and
// flag any group that contains two or more distinct values from different
// documents. Neither value is preferred; both are preserved.
export async function detectConflicts(): Promise<Conflict[]> {
  const existing = await getAll('conflicts');
  const existingById = new Map(existing.map((c) => [c.id, c]));
  const records = await collectMetricRecords();

  const groups = new Map<string, MetricRecord[]>();
  for (const r of records) {
    const k = groupKey(r);
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }

  const detected: Conflict[] = [];
  for (const [, recs] of groups) {
    const byDoc = new Map<string, MetricRecord>();
    for (const r of recs) if (!byDoc.has(r.docId)) byDoc.set(r.docId, r);
    if (byDoc.size < 2) continue;

    const distinct = new Set([...byDoc.values()].map((r) => r.value));
    if (distinct.size < 2) continue;

    const values: ConflictValue[] = [...byDoc.values()].map((r) => ({
      value: r.raw.trim(),
      docId: r.docId,
      docName: r.docName,
      pageNo: r.pageNo,
      section: r.section,
      snippet: `${r.label}: ${r.raw}`,
    }));

    const sample = recs[0];
    const sortedIds = [...byDoc.keys()].sort();
    const key = `${sample.normLabel}|${sample.period}|${sample.subsidiary}|${sortedIds.join(',')}`;
    const id = `con_${await shortHash(key)}`;
    const prev = existingById.get(id);
    detected.push({
      id,
      entity: sample.subsidiary,
      metric: sample.label,
      scope: sample.subsidiary,
      reportingPeriod: sample.period,
      values,
      status: prev?.status ?? 'Unresolved',
      selectedDocId: prev?.selectedDocId,
      justification: prev?.justification,
      reviewNote: prev?.reviewNote,
      resolvedBy: prev?.resolvedBy,
      resolvedByName: prev?.resolvedByName,
      resolvedAt: prev?.resolvedAt,
      createdAt: prev?.createdAt ?? now(),
    });
  }

  // Also honour manually-recorded conflicts not produced by detection.
  const detectedIds = new Set(detected.map((d) => d.id));
  const manual = existing.filter((c) => !detectedIds.has(c.id));

  // Upsert detected conflicts.
  for (const c of detected) {
    const prev = existingById.get(c.id);
    if (!prev || JSON.stringify({ v: prev.values, s: prev.status }) !== JSON.stringify({ v: c.values, s: c.status })) {
      await put('conflicts', c);
    }
  }

  return [...detected, ...manual].sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'Unresolved' ? -1 : 1));
}

export async function resolveConflict(
  id: string,
  input: { selectedDocId: string; justification: string; note?: string; actor: { id: string; name: string } },
): Promise<void> {
  const conflict = await getConflict(id);
  if (!conflict) return;
  conflict.status = 'Resolved';
  conflict.selectedDocId = input.selectedDocId;
  conflict.justification = input.justification;
  conflict.reviewNote = input.note;
  conflict.resolvedBy = input.actor.id;
  conflict.resolvedByName = input.actor.name;
  conflict.resolvedAt = now();
  await put('conflicts', conflict);
}

export async function addConflictNote(id: string, note: string): Promise<void> {
  const conflict = await getConflict(id);
  if (!conflict) return;
  conflict.reviewNote = note;
  await put('conflicts', conflict);
}

export async function reopenConflict(id: string): Promise<void> {
  const conflict = await getConflict(id);
  if (!conflict) return;
  conflict.status = 'Unresolved';
  conflict.selectedDocId = undefined;
  conflict.justification = undefined;
  conflict.resolvedAt = undefined;
  await put('conflicts', conflict);
}

export async function conflictStats(): Promise<{ unresolved: number; resolved: number; total: number }> {
  const list = await getAll('conflicts');
  const unresolved = list.filter((c) => c.status === 'Unresolved').length;
  return { unresolved, resolved: list.length - unresolved, total: list.length };
}

export async function conflictContentHash(id: string): Promise<string> {
  const c = await getConflict(id);
  return sha256Hex(JSON.stringify(c ?? {}));
}
