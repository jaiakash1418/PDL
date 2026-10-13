import { getAll, put, getDB } from '../lib/db';
import type { AuditEvent, Role } from '../lib/types';
import { sha256Hex } from '../lib/crypto';
import { stableStringify, uid, now } from '../lib/util';

// This is a genuine hash-chained activity log: each record's hash is computed
// over (previous record hash + canonical payload). Altering or removing an
// earlier record invalidates every subsequent hash, and verifyChain() detects it.
// It is NOT tamper-proof against an attacker who can rewrite the whole chain in
// browser storage; it is integrity-evident for the demonstration dataset.

export async function appendAudit(input: {
  actorId: string;
  actorName: string;
  actorRole: Role | 'system';
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  meta?: Record<string, unknown>;
}): Promise<AuditEvent> {
  const db = await getDB();
  const events = (await db.getAllFromIndex('audit', 'bySeq')) as AuditEvent[];
  const last = events.length ? events[events.length - 1] : undefined;
  const seq = last ? last.seq + 1 : 1;
  const prevHash = last ? last.hash : 'GENESIS';
  const at = now();
  const id = uid('aud');
  const payload = {
    seq, at, id,
    actorId: input.actorId, actorName: input.actorName, actorRole: input.actorRole,
    action: input.action, resourceType: input.resourceType,
    resourceId: input.resourceId ?? null, resourceName: input.resourceName ?? null,
    meta: input.meta ?? null, prevHash,
  };
  const hash = await sha256Hex(stableStringify(payload));
  const event: AuditEvent = {
    id, seq, at,
    actorId: input.actorId, actorName: input.actorName, actorRole: input.actorRole,
    action: input.action, resourceType: input.resourceType,
    resourceId: input.resourceId, resourceName: input.resourceName,
    meta: input.meta, prevHash, hash,
  };
  await put('audit', event);
  return event;
}

export async function getAuditEvents(): Promise<AuditEvent[]> {
  const db = await getDB();
  const events = (await db.getAllFromIndex('audit', 'bySeq')) as AuditEvent[];
  return events;
}

export interface ChainVerification {
  ok: boolean;
  length: number;
  brokenAtSeq?: number;
  reason?: string;
}

export async function verifyChain(): Promise<ChainVerification> {
  const events = await getAuditEvents();
  let prevHash = 'GENESIS';
  for (const ev of events) {
    const payload = {
      seq: ev.seq, at: ev.at, id: ev.id,
      actorId: ev.actorId, actorName: ev.actorName, actorRole: ev.actorRole,
      action: ev.action, resourceType: ev.resourceType,
      resourceId: ev.resourceId ?? null, resourceName: ev.resourceName ?? null,
      meta: ev.meta ?? null, prevHash,
    };
    const expected = await sha256Hex(stableStringify(payload));
    if (ev.prevHash !== prevHash) {
      return { ok: false, length: events.length, brokenAtSeq: ev.seq, reason: 'Previous-hash link mismatch' };
    }
    if (ev.hash !== expected) {
      return { ok: false, length: events.length, brokenAtSeq: ev.seq, reason: 'Record payload hash mismatch' };
    }
    prevHash = ev.hash;
  }
  return { ok: true, length: events.length };
}

export async function recentAudit(limit = 8): Promise<AuditEvent[]> {
  const events = await getAuditEvents();
  return events.slice(-limit).reverse();
}

export async function getAllAudit(): Promise<AuditEvent[]> {
  return getAll('audit');
}
