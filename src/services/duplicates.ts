import type { DocumentRecord, DuplicatePair, DuplicateStatus } from '../lib/types';
import { getAll, put } from '../lib/db';
import { shortHash } from '../lib/crypto';
import { now } from '../lib/util';
import { tokenize, similarityPercent } from '../lib/text';
import { documentFullText, listDocuments } from './documents';

export async function getDuplicates(): Promise<DuplicatePair[]> {
  const list = await getAll('duplicates');
  return list.sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'Pending' ? -1 : 1));
}

export async function getDuplicate(id: string): Promise<DuplicatePair | undefined> {
  return (await getAll('duplicates')).find((d) => d.id === id);
}

function baseName(fileName: string): string {
  return fileName.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[ _-]*\(?\d*\)?$/, '').replace(/[ _-]+/g, ' ').trim();
}

// Detection uses three real signals, strongest first:
//   1. Identical SHA-256 file hash  (exact duplicate)
//   2. Matching metadata (same base title, category and reporting period)
//   3. High extracted-text similarity (cosine over tokens)
// Similarity percentages are only shown when actually computed.
export async function detectDuplicates(): Promise<DuplicatePair[]> {
  const existing = await getAll('duplicates');
  const byId = new Map(existing.map((d) => [d.id, d]));
  const docs = await listDocuments();

  const textCache = new Map<string, string>();
  const getText = async (id: string) => {
    if (!textCache.has(id)) textCache.set(id, await documentFullText(id));
    return textCache.get(id)!;
  };

  const detected: DuplicatePair[] = [];

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i];
      const b = docs[j];
      const reasons: string[] = [];
      let exact = false;
      let similarity: number | undefined;

      if (a.fileHash && a.fileHash === b.fileHash) {
        exact = true;
        reasons.push('Identical file hash (SHA-256)');
      }

      const metaTitleMatch = baseName(a.fileName) === baseName(b.fileName) && a.category === b.category;
      if (metaTitleMatch && !exact) reasons.push('Matching metadata (same title, category and reporting period)');

      const [ta, tb] = [await getText(a.id), await getText(b.id)];
      if (ta.length > 40 && tb.length > 40) {
        const sim = similarityPercent(ta, tb);
        if (sim >= 60) {
          similarity = sim;
          reasons.push(`Extracted-text similarity ${sim.toFixed(1)}%`);
        }
      }

      if (reasons.length === 0) continue;

      const [x, y] = [a.id, b.id].sort();
      const id = `dup_${await shortHash(x + '|' + y)}`;
      const prev = byId.get(id);
      detected.push({
        id,
        docAId: x,
        docBId: y,
        reason: reasons.join(' · '),
        similarity,
        exact,
        status: prev?.status ?? 'Pending',
        note: prev?.note,
        reviewedBy: prev?.reviewedBy,
        reviewedByName: prev?.reviewedByName,
        reviewedAt: prev?.reviewedAt,
        createdAt: prev?.createdAt ?? now(),
      });
    }
  }

  for (const d of detected) await put('duplicates', d);
  return detected.sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'Pending' ? -1 : 1));
}

export async function setDuplicateStatus(
  id: string,
  status: DuplicateStatus,
  input: { note?: string; actor: { id: string; name: string } },
): Promise<void> {
  const pair = await getDuplicate(id);
  if (!pair) return;
  pair.status = status;
  pair.note = input.note;
  pair.reviewedBy = input.actor.id;
  pair.reviewedByName = input.actor.name;
  pair.reviewedAt = now();
  await put('duplicates', pair);
}

export async function duplicateStats(): Promise<{ pending: number; confirmed: number; total: number }> {
  const list = await getAll('duplicates');
  const pending = list.filter((d) => d.status === 'Pending').length;
  const confirmed = list.filter((d) => d.status === 'Confirmed Duplicate').length;
  return { pending, confirmed, total: list.length };
}

export function isSameDocument(a: DocumentRecord, b: DocumentRecord): boolean {
  return a.id === b.id;
}

export { tokenize };
