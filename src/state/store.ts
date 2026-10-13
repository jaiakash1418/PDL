import { create } from 'zustand';
import type { AppNotification, Role, WorkspaceSettings } from '../lib/types';
import type { Session } from '../services/auth';
import { authenticate, endSession, loadSession, startDemoSession, startSession } from '../services/auth';
import { getSettings, saveSettings as persistSettings, applyTheme } from '../services/settings';
import { listNotifications, markAllRead } from '../services/notifications';
import { initializeWorkspace, resetDemoData } from '../services/reset';
import { invalidateRetrievalIndex } from '../services/retrieval';
import { uid } from '../lib/util';

export interface Toast {
  id: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
  title?: string;
}

interface AppState {
  ready: boolean;
  bootError: string | null;
  session: Session | null;
  settings: WorkspaceSettings | null;
  notifications: AppNotification[];
  toasts: Toast[];
  dataVersion: number;

  boot: () => Promise<void>;
  login: (email: string, password: string, remember: boolean) => Promise<{ ok: boolean; error?: string }>;
  demoAccess: (role: Role) => Promise<void>;
  logout: () => Promise<void>;

  setSettings: (patch: Partial<WorkspaceSettings>) => Promise<void>;
  toggleTheme: () => Promise<void>;

  pushToast: (message: string, level?: Toast['level'], title?: string) => void;
  removeToast: (id: string) => void;

  refreshNotifications: () => Promise<void>;
  readAllNotifications: () => Promise<void>;
  bumpData: () => void;
  resetWorkspace: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  bootError: null,
  session: null,
  settings: null,
  notifications: [],
  toasts: [],
  dataVersion: 0,

  boot: async () => {
    try {
      await initializeWorkspace();
      const settings = await getSettings();
      applyTheme(settings.theme);
      const session = loadSession();
      const notifications = session ? await listNotifications() : [];
      set({ ready: true, settings, session, notifications, bootError: null });
    } catch (err) {
      set({ ready: true, bootError: err instanceof Error ? err.message : 'Workspace failed to initialise.' });
    }
  },

  login: async (email, password, remember) => {
    const res = await authenticate(email, password);
    if (!res.ok) return { ok: false, error: res.error };
    const session = await startSession(res.user, remember);
    const notifications = await listNotifications();
    set({ session, notifications });
    return { ok: true };
  },

  demoAccess: async (role) => {
    const session = await startDemoSession(role);
    const notifications = await listNotifications();
    set({ session, notifications });
  },

  logout: async () => {
    await endSession(get().session);
    set({ session: null, notifications: [] });
  },

  setSettings: async (patch) => {
    const next = await persistSettings(patch);
    if (patch.theme) applyTheme(next.theme);
    set({ settings: next });
  },

  toggleTheme: async () => {
    const current = get().settings;
    const theme = current?.theme === 'dark' ? 'light' : 'dark';
    const next = await persistSettings({ theme });
    applyTheme(next.theme);
    set({ settings: next });
  },

  pushToast: (message, level = 'info', title) => {
    const id = uid('tst');
    set({ toasts: [...get().toasts, { id, message, level, title }] });
    setTimeout(() => get().removeToast(id), 6000);
  },

  removeToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  refreshNotifications: async () => {
    set({ notifications: await listNotifications() });
  },

  readAllNotifications: async () => {
    await markAllRead();
    set({ notifications: await listNotifications() });
  },

  bumpData: () => set({ dataVersion: get().dataVersion + 1 }),

  resetWorkspace: async () => {
    await resetDemoData();
    invalidateRetrievalIndex();
    const settings = await getSettings();
    set({ settings, notifications: await listNotifications(), dataVersion: get().dataVersion + 1 });
  },
}));
