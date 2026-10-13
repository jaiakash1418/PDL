import type { WorkspaceSettings } from '../lib/types';
import { getOne, put } from '../lib/db';
import { now } from '../lib/util';

export const DEFAULT_CATEGORIES = [
  'Production Report',
  'Geological Report',
  'Safety Observation',
  'Administrative',
  'Survey & Measurement',
  'Compliance',
];

export const DEFAULT_SUBSIDIARIES = [
  'Demo Coalfield — Subsidiary A',
  'Demo Coalfield — Subsidiary B',
];

export async function getSettings(): Promise<WorkspaceSettings> {
  const existing = await getOne('settings', 'workspace');
  if (existing) return existing;
  const def: WorkspaceSettings = {
    id: 'workspace',
    orgName: 'Demonstration Mining Organisation (Synthetic)',
    subsidiary: DEFAULT_SUBSIDIARIES[0],
    subsidiaries: DEFAULT_SUBSIDIARIES,
    categories: DEFAULT_CATEGORIES,
    theme: 'light',
    notifications: { reportReview: true, validation: true, toasts: true },
    updatedAt: now(),
  };
  await put('settings', def);
  return def;
}

export async function saveSettings(patch: Partial<WorkspaceSettings>): Promise<WorkspaceSettings> {
  const current = await getSettings();
  const next: WorkspaceSettings = { ...current, ...patch, updatedAt: now(), id: 'workspace' };
  await put('settings', next);
  return next;
}

export function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
}
