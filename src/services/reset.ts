import { wipeAll } from '../lib/db';
import { provisionDemoUsers } from './auth';
import { getSettings, saveSettings, DEFAULT_CATEGORIES } from './settings';
import { seedDemoData } from './seed';
import { invalidateRetrievalIndex } from './retrieval';
import { getAll, put } from '../lib/db';
import { uid, now } from '../lib/util';
import type { SavedQuery } from '../lib/types';

async function seedSavedQueries(): Promise<void> {
  const existing = await getAll('savedQueries');
  if (existing.length > 0) return;
  const samples: SavedQuery[] = [
    { id: uid('sq'), text: 'Summarize production trends in the available monthly reports.', at: now() },
    { id: uid('sq'), text: 'Find geological reports mentioning inconsistencies in seam thickness.', at: now() },
    { id: uid('sq'), text: 'List documented safety observations for the selected reporting period.', at: now() },
  ];
  for (const s of samples) await put('savedQueries', s);
}

export async function initializeWorkspace(): Promise<void> {
  await provisionDemoUsers();
  const settings = await getSettings();
  if (!settings.categories?.length) await saveSettings({ categories: DEFAULT_CATEGORIES });
  const docs = await getAll('documents');
  if (docs.length === 0) {
    await seedDemoData();
  }
  await seedSavedQueries();
}

export async function resetDemoData(): Promise<void> {
  await wipeAll();
  invalidateRetrievalIndex();
  await provisionDemoUsers();
  await getSettings();
  await seedDemoData();
  await seedSavedQueries();
}
