import type { AppNotification } from '../lib/types';
import { getAll, put, del } from '../lib/db';
import { uid, now } from '../lib/util';

export async function listNotifications(): Promise<AppNotification[]> {
  const list = await getAll('notifications');
  return list.sort((a, b) => b.at - a.at);
}

export async function addNotification(input: Omit<AppNotification, 'id' | 'at' | 'read'>): Promise<AppNotification> {
  const n: AppNotification = { ...input, id: uid('ntf'), at: now(), read: false };
  await put('notifications', n);
  return n;
}

export async function markRead(id: string): Promise<void> {
  const list = await getAll('notifications');
  const n = list.find((x) => x.id === id);
  if (n) { n.read = true; await put('notifications', n); }
}

export async function markAllRead(): Promise<void> {
  const list = await getAll('notifications');
  for (const n of list) if (!n.read) { n.read = true; await put('notifications', n); }
}

export async function clearNotifications(): Promise<void> {
  const list = await getAll('notifications');
  for (const n of list) await del('notifications', n.id);
}
