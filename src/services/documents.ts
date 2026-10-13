import { getDB, getByIndex, getOne, put, putMany, del, deleteBlob, getAll, putBlob } from '../lib/db';
import type { Chunk, DocumentRecord, PageRecord, ProcessingLogEntry, TableRecord, User } from '../lib/types';
import { hashFile } from '../lib/crypto';
import { ext, now, uid } from '../lib/util';
import { tokenize } from '../lib/text';
import { classify, extractFile, runOcr, type ExtractResult } from './processing/extract';
import { appendAudit } from './audit';

export const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'xlsx', 'xls', 'csv', 'txt', 'md', 'png', 'jpg', 'jpeg', 'webp'];
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface IngestOptions {
  category: string;
  department: string;
  subsidiary: string;
  reportingPeriod: string;
  notes?: string;
  actor: Pick<User, 'id' | 'name' | 'role'>;
}

export interface ValidationOutcome {
  ok: boolean;
  error?: string;
}

export function validateFile(file: File): ValidationOutcome {
  const e = ext(file.name);
  if (!ALLOWED_EXTENSIONS.includes(e)) {
    return { ok: false, error: `.${e || 'unknown'} files are not supported. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.` };
  }
  if (file.size === 0) return { ok: false, error: 'The file is empty.' };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: `File exceeds the ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB limit.` };
  return { ok: true };
}

function log(doc: DocumentRecord, stage: string, message: string, level: ProcessingLogEntry['level'] = 'info'): void {
  doc.processingLog.push({ at: now(), stage, message, level });
}

// --- Ingestion pipeline ---------------------------------------------------

export async function ingestFile(file: File, opts: IngestOptions): Promise<{ doc: DocumentRecord; warnings: string[] }> {
  const check = validateFile(file);
  if (!check.ok) throw new Error(check.error);

  const fileHash = await hashFile(file);
  const id = uid('doc');
  const document: DocumentRecord = {
    id,
    fileName: file.name,
    fileExtension: ext(file.name),
    mimeType: file.type || 'application/octet-stream',
    byteSize: file.size,
    category: opts.category,
    department: opts.department,
    subsidiary: opts.subsidiary,
    reportingPeriod: opts.reportingPeriod,
    uploadedAt: now(),
    uploadedBy: opts.actor.id,
    uploadedByName: opts.actor.name,
    status: 'Uploaded',
    pageCount: 0,
    verification: 'Unverified',
    fileHash,
    hasBlob: true,
    processingLog: [],
    notes: opts.notes,
  };
  log(document, 'Upload', `Received "${file.name}" (${(file.size / 1024).toFixed(1)} KB). SHA-256 ${fileHash.slice(0, 16)}…`);
  await put('documents', document);
  await putBlob(id, file);
  await appendAudit({
    actorId: opts.actor.id, actorName: opts.actor.name, actorRole: opts.actor.role,
    action: 'document.upload', resourceType: 'document', resourceId: id, resourceName: file.name,
    meta: { category: opts.category, period: opts.reportingPeriod, size: file.size, sha256: fileHash },
  });

  const warnings = await processDocument(id, file);
  const refreshed = (await getOne('documents', id))!;
  return { doc: refreshed, warnings };
}

export async function processDocument(docId: string, file: File): Promise<string[]> {
  const doc = await getOne('documents', docId);
  if (!doc) throw new Error('Document not found.');
  doc.status = 'Processing';
  log(doc, 'Validate', 'Queued for the ingestion pipeline.');
  await put('documents', doc);

  let result: ExtractResult;
  try {
    result = await extractFile(file);
  } catch (err) {
    log(doc, 'Extract', `Extraction error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    doc.status = 'Failed';
    await put('documents', doc);
    return ['Extraction failed.'];
  }

  await clearDocumentExtracts(docId);
  return finalizeExtraction(doc, result);
}

async function finalizeExtraction(doc: DocumentRecord, result: ExtractResult): Promise<string[]> {
  const pages: PageRecord[] = result.pages.map((p) => ({
    id: `${doc.id}:${p.pageNo}`,
    docId: doc.id,
    pageNo: p.pageNo,
    section: p.section,
    text: p.text,
  }));
  const tables: TableRecord[] = result.tables.map((t, i) => ({
    id: `${doc.id}:t${i + 1}`,
    docId: doc.id,
    pageNo: t.pageNo,
    title: t.title,
    headers: t.headers,
    rows: t.rows,
  }));
  const chunks = buildChunks(doc.id, pages);

  if (pages.length) await putMany('pages', pages);
  if (tables.length) await putMany('tables', tables);
  if (chunks.length) await putMany('chunks', chunks);

  const totalText = pages.reduce((n, p) => n + p.text.trim().length, 0);
  const hasContent = totalText > 0;
  const hadWarnings = result.warnings.length > 0 || result.needsOcr;

  doc.pageCount = result.pageCount || pages.length;
  doc.sheetCount = result.sheetCount;
  doc.ocrUsed = result.ocrUsed;

  if (!hasContent && result.needsOcr) {
    doc.status = 'Partially Processed';
    log(doc, 'Extract', 'No text layer found. Original file retained; run OCR from the document detail page.', 'warn');
  } else if (!hasContent) {
    doc.status = 'Failed';
    log(doc, 'Extract', 'No extractable content was found in this file.', 'error');
  } else if (hadWarnings) {
    doc.status = 'Partially Processed';
    log(doc, 'Extract', `Extracted ${pages.length} page(s) and ${tables.length} table(s) with warnings.`, 'warn');
  } else {
    doc.status = 'Indexed';
    log(doc, 'Extract', `Extracted ${pages.length} page(s) and ${tables.length} table(s).`);
  }
  log(doc, 'Normalize', 'Normalized text, segmented pages, and generated retrieval chunks.');
  if (chunks.length) log(doc, 'Index', `Indexed ${chunks.length} content chunk(s) for search.`);
  for (const w of result.warnings) log(doc, 'Extract', w, 'warn');
  if (result.ocrUsed) log(doc, 'OCR', 'Optical character recognition was applied.');

  await put('documents', doc);
  await appendAudit({
    actorId: doc.uploadedBy, actorName: doc.uploadedByName, actorRole: 'analyst',
    action: 'document.processed', resourceType: 'document', resourceId: doc.id, resourceName: doc.fileName,
    meta: { status: doc.status, pages: doc.pageCount, chunks: chunks.length, ocrUsed: !!doc.ocrUsed },
  });
  return result.warnings;
}

export async function runOcrOnDocument(docId: string): Promise<{ ok: boolean; message: string }> {
  const doc = await getOne('documents', docId);
  if (!doc) return { ok: false, message: 'Document not found.' };
  const blob = await (await getDB()).get('blobs', docId);
  if (!blob) return { ok: false, message: 'The original file is no longer stored, so OCR cannot run.' };
  doc.status = 'Processing';
  log(doc, 'OCR', 'Starting OCR on the stored original file…');
  await put('documents', doc);
  const result = await runOcr(new File([blob.blob], doc.fileName, { type: doc.mimeType }));
  await clearDocumentExtracts(docId);
  const warnings = await finalizeExtraction(doc, result);
  const refreshed = (await getOne('documents', docId))!;
  if (refreshed.status === 'Partially Processed' || refreshed.status === 'Failed') {
    return { ok: false, message: warnings.join(' ') || 'OCR did not produce usable text.' };
  }
  return { ok: true, message: `OCR complete. Indexed ${refreshed.pageCount} page(s).` };
}

async function clearDocumentExtracts(docId: string): Promise<void> {
  const [pages, tables, chunks] = await Promise.all([
    getByIndex('pages', 'byDoc', docId),
    getByIndex('tables', 'byDoc', docId),
    getByIndex('chunks', 'byDoc', docId),
  ]);
  for (const p of pages) await del('pages', p.id);
  for (const t of tables) await del('tables', t.id);
  for (const c of chunks) await del('chunks', c.id);
}

export function buildChunks(docId: string, pages: PageRecord[]): Chunk[] {
  const chunks: Chunk[] = [];
  const TARGET = 850;
  for (const page of pages) {
    const paragraphs = page.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let buffer = '';
    let idx = 0;
    const push = () => {
      const text = buffer.trim();
      if (text.length < 20) { buffer = ''; return; }
      const tokens = tokenize(text);
      if (tokens.length === 0) { buffer = ''; return; }
      chunks.push({ id: `${docId}:p${page.pageNo}:c${idx++}`, docId, pageNo: page.pageNo, section: page.section, text, tokens });
      buffer = '';
    };
    for (const para of paragraphs) {
      if (buffer.length + para.length > TARGET && buffer.length > 0) push();
      buffer += (buffer ? '\n\n' : '') + para;
    }
    push();
  }
  return chunks;
}

// --- Queries --------------------------------------------------------------

export async function listDocuments(): Promise<DocumentRecord[]> {
  const docs = await getAll('documents');
  return docs.sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  return getOne('documents', id);
}

export async function getPages(docId: string): Promise<PageRecord[]> {
  const pages = await getByIndex('pages', 'byDoc', docId);
  return pages.sort((a, b) => a.pageNo - b.pageNo);
}

export async function getTables(docId: string): Promise<TableRecord[]> {
  return getByIndex('tables', 'byDoc', docId);
}

export async function getChunks(docId?: string): Promise<Chunk[]> {
  if (docId) return getByIndex('chunks', 'byDoc', docId);
  return getAll('chunks');
}

export async function documentFullText(docId: string): Promise<string> {
  const pages = await getPages(docId);
  return pages.map((p) => p.text).join('\n');
}

export async function updateDocumentMeta(id: string, patch: Partial<DocumentRecord>, actor: Pick<User, 'id' | 'name' | 'role'>): Promise<void> {
  const doc = await getOne('documents', id);
  if (!doc) throw new Error('Document not found.');
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  (['category', 'department', 'subsidiary', 'reportingPeriod', 'verification', 'notes'] as const).forEach((k) => {
    if (patch[k] !== undefined && patch[k] !== doc[k]) changes[k] = { from: doc[k], to: patch[k] };
  });
  Object.assign(doc, patch);
  await put('documents', doc);
  await appendAudit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: 'document.metadata.update', resourceType: 'document', resourceId: id, resourceName: doc.fileName,
    meta: { changes },
  });
}

export async function deleteDocument(id: string, actor: Pick<User, 'id' | 'name' | 'role'>): Promise<void> {
  const doc = await getOne('documents', id);
  if (!doc) return;
  await clearDocumentExtracts(id);
  await deleteBlob(id);
  await del('documents', id);
  await appendAudit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: 'document.delete', resourceType: 'document', resourceId: id, resourceName: doc.fileName,
  });
}

export async function getOriginalBlob(id: string): Promise<Blob | undefined> {
  const rec = await (await getDB()).get('blobs', id);
  return rec?.blob;
}

export async function getDocumentHistory(docId: string): Promise<ProcessingLogEntry[]> {
  const doc = await getOne('documents', docId);
  return doc?.processingLog ?? [];
}

export async function processingStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  totalPages: number;
  totalChunks: number;
}> {
  const docs = await getAll('documents');
  const chunks = await getAll('chunks');
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let totalPages = 0;
  for (const d of docs) {
    byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
    totalPages += d.pageCount;
  }
  return { total: docs.length, byStatus, byCategory, totalPages, totalChunks: chunks.length };
}

export function canProcessKind(fileName: string, mime: string): boolean {
  return classify(fileName, mime) !== 'unknown';
}

export async function searchDocumentText(docId: string, query: string): Promise<{ pageNo: number; section?: string; snippet: string }[]> {
  const pages = await getPages(docId);
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: { pageNo: number; section?: string; snippet: string }[] = [];
  for (const p of pages) {
    const lower = p.text.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(p.text.length, idx + q.length + 120);
      out.push({ pageNo: p.pageNo, section: p.section, snippet: (start > 0 ? '…' : '') + p.text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < p.text.length ? '…' : '') });
    }
  }
  return out;
}
