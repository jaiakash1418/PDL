import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  User, DocumentRecord, PageRecord, TableRecord, Chunk, Report,
  ValidationIssue, DuplicatePair, Conflict, AuditEvent, AppNotification,
  Conversation, SavedQuery, WorkspaceSettings,
} from './types';

const DB_NAME = 'stratavex';
const DB_VERSION = 1;

interface StoredBlob {
  id: string;
  blob: Blob;
}

interface StratavexSchema extends DBSchema {
  users: { key: string; value: User };
  documents: { key: string; value: DocumentRecord; indexes: { byUploadedAt: number; byPeriod: string; byCategory: string } };
  blobs: { key: string; value: StoredBlob };
  pages: { key: string; value: PageRecord; indexes: { byDoc: string } };
  tables: { key: string; value: TableRecord; indexes: { byDoc: string } };
  chunks: { key: string; value: Chunk; indexes: { byDoc: string } };
  reports: { key: string; value: Report; indexes: { byStatus: string; byCreatedAt: number } };
  validations: { key: string; value: ValidationIssue; indexes: { byDoc: string; byStatus: string } };
  duplicates: { key: string; value: DuplicatePair; indexes: { byStatus: string } };
  conflicts: { key: string; value: Conflict; indexes: { byStatus: string } };
  audit: { key: string; value: AuditEvent; indexes: { bySeq: number; byAt: number } };
  notifications: { key: string; value: AppNotification };
  conversations: { key: string; value: Conversation };
  savedQueries: { key: string; value: SavedQuery };
  settings: { key: string; value: WorkspaceSettings };
}

// `keyof StratavexSchema` collapses to `string` because DBSchema declares a
// string index signature, so helpers use this explicit union of store names.
export type StoreName =
  | 'users' | 'documents' | 'blobs' | 'pages' | 'tables' | 'chunks'
  | 'reports' | 'validations' | 'duplicates' | 'conflicts' | 'audit'
  | 'notifications' | 'conversations' | 'savedQueries' | 'settings';

type StoreValue<K extends StoreName> = StratavexSchema[K]['value'];

let dbPromise: Promise<IDBPDatabase<StratavexSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<StratavexSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<StratavexSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('users')) db.createObjectStore('users', { keyPath: 'id' });

        if (!db.objectStoreNames.contains('documents')) {
          const s = db.createObjectStore('documents', { keyPath: 'id' });
          s.createIndex('byUploadedAt', 'uploadedAt');
          s.createIndex('byPeriod', 'reportingPeriod');
          s.createIndex('byCategory', 'category');
        }
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });

        if (!db.objectStoreNames.contains('pages')) {
          const s = db.createObjectStore('pages', { keyPath: 'id' });
          s.createIndex('byDoc', 'docId');
        }
        if (!db.objectStoreNames.contains('tables')) {
          const s = db.createObjectStore('tables', { keyPath: 'id' });
          s.createIndex('byDoc', 'docId');
        }
        if (!db.objectStoreNames.contains('chunks')) {
          const s = db.createObjectStore('chunks', { keyPath: 'id' });
          s.createIndex('byDoc', 'docId');
        }

        if (!db.objectStoreNames.contains('reports')) {
          const s = db.createObjectStore('reports', { keyPath: 'id' });
          s.createIndex('byStatus', 'status');
          s.createIndex('byCreatedAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('validations')) {
          const s = db.createObjectStore('validations', { keyPath: 'id' });
          s.createIndex('byDoc', 'docId');
          s.createIndex('byStatus', 'status');
        }
        if (!db.objectStoreNames.contains('duplicates')) {
          const s = db.createObjectStore('duplicates', { keyPath: 'id' });
          s.createIndex('byStatus', 'status');
        }
        if (!db.objectStoreNames.contains('conflicts')) {
          const s = db.createObjectStore('conflicts', { keyPath: 'id' });
          s.createIndex('byStatus', 'status');
        }

        if (!db.objectStoreNames.contains('audit')) {
          const s = db.createObjectStore('audit', { keyPath: 'id' });
          s.createIndex('bySeq', 'seq');
          s.createIndex('byAt', 'at');
        }

        if (!db.objectStoreNames.contains('notifications')) db.createObjectStore('notifications', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('conversations')) db.createObjectStore('conversations', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('savedQueries')) db.createObjectStore('savedQueries', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

// --- Generic helpers ------------------------------------------------------

export async function getAll<K extends StoreName>(store: K): Promise<StoreValue<K>[]> {
  const db = await getDB();
  return db.getAll(store) as Promise<StoreValue<K>[]>;
}

export async function getOne<K extends StoreName>(store: K, key: string): Promise<StoreValue<K> | undefined> {
  const db = await getDB();
  return (await db.get(store, key)) as StoreValue<K> | undefined;
}

export async function put<K extends StoreName>(store: K, value: StoreValue<K>): Promise<void> {
  const db = await getDB();
  await db.put(store, value as any);
}

export async function putMany<K extends StoreName>(store: K, values: StoreValue<K>[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  for (const v of values) tx.store.put(v as any);
  await tx.done;
}

export async function del<K extends StoreName>(store: K, key: string): Promise<void> {
  const db = await getDB();
  await db.delete(store, key);
}

export async function count(store: StoreName): Promise<number> {
  const db = await getDB();
  return db.count(store);
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await getDB();
  await db.clear(store);
}

export async function getByIndex<K extends StoreName>(
  store: K,
  index: string,
  key: string | number,
): Promise<StoreValue<K>[]> {
  const db = await getDB();
  return db.getAllFromIndex(store, index as any, key as any) as Promise<StoreValue<K>[]>;
}

// --- Blobs ----------------------------------------------------------------

export async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put('blobs', { id, blob });
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  const db = await getDB();
  const rec = await db.get('blobs', id);
  return rec?.blob;
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('blobs', id);
}

// --- Full reset -----------------------------------------------------------

export async function wipeAll(): Promise<void> {
  const db = await getDB();
  const stores = [
    'users', 'documents', 'blobs', 'pages', 'tables', 'chunks', 'reports',
    'validations', 'duplicates', 'conflicts', 'audit', 'notifications',
    'conversations', 'savedQueries', 'settings',
  ] as const;
  const tx = db.transaction(stores as any, 'readwrite');
  for (const s of stores) (tx as any).objectStore(s).clear();
  await tx.done;
}
