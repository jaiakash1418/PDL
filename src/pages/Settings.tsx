import { useEffect, useState } from 'react';
import { Bell, Database, Info, KeyRound, Palette, Plug, Save, Trash2, UserCog, UserPlus, Users, Building2 } from 'lucide-react';
import { ROLE_LABELS, type Role, type User } from '../lib/types';
import { useStore } from '../state/store';
import { useAsync } from '../components/useAsync';
import { createUser, getUsers, setUserPassword, updateUser } from '../services/auth';
import { aiConfigSummary } from '../services/ai';
import { getSettings, DEFAULT_CATEGORIES, DEFAULT_SUBSIDIARIES } from '../services/settings';
import { Badge, Button, Card, CardHead, Field, KeyValue, Spinner, Tabs } from '../components/ui';
import { ConfirmDialog, Modal } from '../components/overlays';
import { fmtDateTime, initials } from '../lib/util';

type TabId = 'profile' | 'appearance' | 'notifications' | 'workspace' | 'categories' | 'users' | 'integrations' | 'data';

export function Settings() {
  const session = useStore((s) => s.session)!;
  const settings = useStore((s) => s.settings);
  const isAdmin = session.role === 'administrator';

  const tabs: { id: TabId; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'notifications', label: 'Notifications' },
    ...(isAdmin ? [
      { id: 'workspace' as TabId, label: 'Workspace' },
      { id: 'categories' as TabId, label: 'Categories' },
      { id: 'users' as TabId, label: 'Users & Roles' },
      { id: 'integrations' as TabId, label: 'Integrations' },
      { id: 'data' as TabId, label: 'Data & Reset' },
    ] : []),
  ];

  const [tab, setTab] = useState<TabId>('profile');

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p className="sub">Workspace configuration, access control and demonstration data management.</p>
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'profile' && <ProfileTab />}
      {tab === 'appearance' && <AppearanceTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {isAdmin && tab === 'workspace' && <WorkspaceTab />}
      {isAdmin && tab === 'categories' && <CategoriesTab />}
      {isAdmin && tab === 'users' && <UsersTab currentUserId={session.userId} />}
      {isAdmin && tab === 'integrations' && <IntegrationsTab />}
      {isAdmin && tab === 'data' && <DataTab />}
    </div>
  );
}

function ProfileTab() {
  const session = useStore((s) => s.session)!;
  const pushToast = useStore((s) => s.pushToast);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (pw.length < 8) { pushToast('Password must be at least 8 characters.', 'warning'); return; }
    if (pw !== confirm) { pushToast('Passwords do not match.', 'warning'); return; }
    setSaving(true);
    await setUserPassword(session.userId, pw);
    setSaving(false);
    setPw(''); setConfirm('');
    pushToast('Password updated.', 'success');
  };

  return (
    <Card>
      <CardHead title="Profile" sub="Your identity in this workspace" />
      <div className="card__body stack">
        <div className="row gap-16">
          <span className="avatar lg">{initials(session.name)}</span>
          <div className="grid-2 grow" style={{ gap: 12 }}>
            <KeyValue label="Name">{session.name}</KeyValue>
            <KeyValue label="Email">{session.email}</KeyValue>
            <KeyValue label="Role"><Badge tone="info">{ROLE_LABELS[session.role]}</Badge></KeyValue>
            <KeyValue label="Session">Demonstration session {session.demo ? '(demo)' : ''}</KeyValue>
          </div>
        </div>
        <hr className="divider" />
        <h3>Change password</h3>
        <div className="banner info"><Info size={15} /><span className="small">Passwords are hashed with PBKDF2 before storage. This is a demonstration authentication flow, not a production identity system.</span></div>
        <div className="grid-2" style={{ gap: 12 }}>
          <Field label="New password" required><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Confirm password" required><input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        </div>
        <div className="row-end"><Button variant="primary" icon={<Save size={15} />} loading={saving} onClick={save}>Update password</Button></div>
      </div>
    </Card>
  );
}

function AppearanceTab() {
  const settings = useStore((s) => s.settings)!;
  const setSettings = useStore((s) => s.setSettings);
  return (
    <Card>
      <CardHead title="Appearance" sub="Theme preference is stored with your workspace" right={<Palette size={15} className="muted" />} />
      <div className="card__body stack">
        <div className="row-between">
          <div><div className="strong">Theme</div><div className="small muted">Light or dark workspace presentation.</div></div>
          <div className="segmented">
            {(['light', 'dark'] as const).map((t) => (
              <button key={t} className={settings.theme === t ? 'active' : ''} onClick={() => setSettings({ theme: t })}>{t === 'light' ? 'Light' : 'Dark'}</button>
            ))}
          </div>
        </div>
        <div className="row-between">
          <div><div className="strong">Organisation name</div><div className="small muted">Shown in the header and on exports.</div></div>
          <span className="small">{settings.orgName}</span>
        </div>
      </div>
    </Card>
  );
}

function NotificationsTab() {
  const settings = useStore((s) => s.settings)!;
  const setSettings = useStore((s) => s.setSettings);
  const items: { key: keyof typeof settings.notifications; label: string; desc: string }[] = [
    { key: 'reportReview', label: 'Report review events', desc: 'Notify when a report is submitted, approved or rejected.' },
    { key: 'validation', label: 'Validation warnings', desc: 'Notify when new validation issues are detected.' },
    { key: 'toasts', label: 'In-app toasts', desc: 'Show transient confirmation messages.' },
  ];
  return (
    <Card>
      <CardHead title="Notifications" right={<Bell size={15} className="muted" />} />
      <div className="card__body stack">
        {items.map((it) => (
          <div key={it.key} className="row-between">
            <div><div className="strong">{it.label}</div><div className="small muted">{it.desc}</div></div>
            <label className="switch">
              <input type="checkbox" checked={settings.notifications[it.key]} onChange={(e) => setSettings({ notifications: { ...settings.notifications, [it.key]: e.target.checked } })} />
              <span className="switch__track"><span className="switch__thumb" /></span>
            </label>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WorkspaceTab() {
  const settings = useStore((s) => s.settings)!;
  const setSettings = useStore((s) => s.setSettings);
  const pushToast = useStore((s) => s.pushToast);
  const [orgName, setOrgName] = useState(settings.orgName);
  const [subsidiary, setSubsidiary] = useState(settings.subsidiary);
  const [newSub, setNewSub] = useState('');

  const save = async () => {
    await setSettings({ orgName, subsidiary });
    pushToast('Workspace settings saved.', 'success');
  };

  return (
    <Card>
      <CardHead title="Workspace" sub="Organisation and subsidiary configuration" right={<Building2 size={15} className="muted" />} />
      <div className="card__body stack">
        <Field label="Organisation name"><input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} /></Field>
        <Field label="Active subsidiary">
          <select className="select" value={subsidiary} onChange={(e) => setSubsidiary(e.target.value)}>
            {settings.subsidiaries.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div>
          <div className="field-label">Subsidiaries</div>
          <div className="row gap-8 wrap">
            {settings.subsidiaries.map((s) => <span key={s} className="badge badge-neutral">{s}</span>)}
          </div>
        </div>
        <div className="row gap-8">
          <input className="input" placeholder="Add a subsidiary…" value={newSub} onChange={(e) => setNewSub(e.target.value)} />
          <Button onClick={async () => { if (!newSub.trim()) return; await setSettings({ subsidiaries: [...settings.subsidiaries, newSub.trim()] }); setNewSub(''); pushToast('Subsidiary added.', 'success'); }}>Add</Button>
        </div>
        <div className="row-end"><Button variant="primary" icon={<Save size={15} />} onClick={save}>Save workspace</Button></div>
      </div>
    </Card>
  );
}

function CategoriesTab() {
  const settings = useStore((s) => s.settings)!;
  const setSettings = useStore((s) => s.setSettings);
  const pushToast = useStore((s) => s.pushToast);
  const [value, setValue] = useState('');

  return (
    <Card>
      <CardHead title="Categories" sub="Document classification options used across the repository" />
      <div className="card__body stack">
        <div className="pill-list">
          {settings.categories.map((c) => (
            <span key={c} className="badge badge-info" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {c}
              <button className="icon-btn icon-btn-xs" aria-label={`Remove ${c}`} onClick={async () => { await setSettings({ categories: settings.categories.filter((x) => x !== c) }); }}>×</button>
            </span>
          ))}
        </div>
        <div className="row gap-8">
          <input className="input" placeholder="Add a category…" value={value} onChange={(e) => setValue(e.target.value)} />
          <Button onClick={async () => { if (!value.trim()) return; await setSettings({ categories: [...settings.categories, value.trim()] }); setValue(''); pushToast('Category added.', 'success'); }}>Add</Button>
          <Button variant="ghost" onClick={async () => { await setSettings({ categories: DEFAULT_CATEGORIES, subsidiaries: DEFAULT_SUBSIDIARIES }); pushToast('Defaults restored.', 'success'); }}>Restore defaults</Button>
        </div>
      </div>
    </Card>
  );
}

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const pushToast = useStore((s) => s.pushToast);
  const bumpData = useStore((s) => s.bumpData);
  const dataVersion = useStore((s) => s.dataVersion);
  const { data, loading, reload } = useAsync(async () => ({ users: await getUsers() }), [dataVersion]);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwUser, setPwUser] = useState<User | null>(null);
  const users = data?.users ?? [];

  const toggleActive = async (u: User) => {
    await updateUser({ ...u, active: !u.active });
    pushToast(`${u.name} ${u.active ? 'disabled' : 'enabled'}.`, 'success');
    reload(); bumpData();
  };

  return (
    <>
      <Card>
        <CardHead title="Users & Roles" sub="Role assignments and account status" right={<Button size="sm" icon={<UserPlus size={14} />} onClick={() => setCreateOpen(true)}>Add user</Button>} />
        {loading ? (
          <div className="spin-overlay"><Spinner /> Loading users…</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="small"><div className="row gap-8"><span className="avatar sm">{initials(u.name)}</span>{u.name}{u.id === currentUserId && <Badge tone="info">You</Badge>}</div></td>
                    <td className="small">{u.email}</td>
                    <td><Badge tone={u.role === 'administrator' ? 'warning' : u.role === 'reviewer' ? 'info' : 'neutral'}>{ROLE_LABELS[u.role]}</Badge></td>
                    <td><Badge tone={u.active ? 'success' : 'error'}>{u.active ? 'Active' : 'Disabled'}</Badge></td>
                    <td className="small">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : '—'}</td>
                    <td>
                      <div className="row gap-4">
                        <Button size="sm" variant="ghost" icon={<KeyRound size={13} />} onClick={() => setPwUser(u)}>Reset</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(u)} disabled={u.id === currentUserId}>{u.active ? 'Disable' : 'Enable'}</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {createOpen && <CreateUserModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); pushToast('User created.', 'success'); reload(); bumpData(); }} />}
      {pwUser && <ResetPasswordModal user={pwUser} onClose={() => setPwUser(null)} onDone={() => { setPwUser(null); pushToast('Password reset.', 'success'); }} />}
    </>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const pushToast = useStore((s) => s.pushToast);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('analyst');
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim()) { pushToast('Name and email are required.', 'warning'); return; }
    if (password.length < 8) { pushToast('Password must be at least 8 characters.', 'warning'); return; }
    setSaving(true);
    try {
      await createUser({ name, email, role, title, password });
      onCreated();
    } catch (e) {
      pushToast('Could not create user.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Add user" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={submit}>Create user</Button></>}>
      <div className="stack">
        <div className="grid-2" style={{ gap: 12 }}>
          <Field label="Full name" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email" required><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Role" required>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {(['analyst', 'reviewer', 'administrator'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </Field>
          <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        </div>
        <Field label="Temporary password" required hint="At least 8 characters. Hashed with PBKDF2 before storage."><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: () => void }) {
  const pushToast = useStore((s) => s.pushToast);
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (pw.length < 8) { pushToast('Password must be at least 8 characters.', 'warning'); return; }
    setSaving(true);
    await setUserPassword(user.id, pw);
    setSaving(false);
    onDone();
  };
  return (
    <Modal open onClose={onClose} title={`Reset password — ${user.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={submit}>Reset password</Button></>}>
      <Field label="New password" required><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
    </Modal>
  );
}

function IntegrationsTab() {
  const ai = aiConfigSummary();
  return (
    <Card>
      <CardHead title="Integrations" sub="Optional external services" right={<Plug size={15} className="muted" />} />
      <div className="card__body stack">
        <div className="integration">
          <div className="grow">
            <div className="strong">Generative AI answer model</div>
            <div className="small muted">When configured, the AI Query Workspace can synthesise answers from retrieved passages. Without keys it uses local extractive search only.</div>
          </div>
          <Badge tone={ai.configured ? 'success' : 'neutral'}>{ai.configured ? 'Configured' : 'Not configured'}</Badge>
        </div>
        {ai.configured && (
          <div className="grid-2" style={{ gap: 12 }}>
            <KeyValue label="Model">{ai.model}</KeyValue>
            <KeyValue label="Base URL">{ai.baseUrl}</KeyValue>
          </div>
        )}
        <div className="banner info"><Info size={15} /><span className="small">Keys are supplied through environment variables (<span className="mono">VITE_AI_BASE_URL</span>, <span className="mono">VITE_AI_API_KEY</span>, <span className="mono">VITE_AI_MODEL</span>) and are never stored in the workspace or included in exports.</span></div>
        <div className="integration">
          <div className="grow">
            <div className="strong">Cloud document storage</div>
            <div className="small muted">Not connected. Documents are stored locally in the browser's IndexedDB for this demonstration.</div>
          </div>
          <Badge tone="neutral">Not configured</Badge>
        </div>
        <div className="integration">
          <div className="grow">
            <div className="strong">Email / notifications provider</div>
            <div className="small muted">Not connected. Notifications are shown in-app only.</div>
          </div>
          <Badge tone="neutral">Not configured</Badge>
        </div>
      </div>
    </Card>
  );
}

function DataTab() {
  const resetWorkspace = useStore((s) => s.resetWorkspace);
  const settings = useStore((s) => s.settings)!;
  const pushToast = useStore((s) => s.pushToast);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const doReset = async () => {
    setBusy(true);
    await resetWorkspace();
    setBusy(false);
    setResetOpen(false);
    pushToast('Demonstration data restored to its initial state.', 'success');
  };

  return (
    <Card>
      <CardHead title="Data & Reset" sub="Manage the demonstration dataset" right={<Database size={15} className="muted" />} />
      <div className="card__body stack">
        <div className="banner warn"><Info size={15} /><span className="small">All data in this prototype is stored locally in your browser. Nothing is sent to a server. Uploaded documents remain on this device only.</span></div>
        <div className="integration">
          <div className="grow">
            <div className="strong">Restore demonstration data</div>
            <div className="small muted">Wipes local data and re-seeds the synthetic multi-period dataset, including the deliberate duplicate, conflict and validation examples. Your account and settings are preserved.</div>
          </div>
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setResetOpen(true)}>Reset workspace</Button>
        </div>
        <KeyValue label="Workspace owner">{settings.orgName}</KeyValue>
        <KeyValue label="Last updated">{fmtDateTime(settings.updatedAt)}</KeyValue>
      </div>
      <ConfirmDialog open={resetOpen} title="Reset demonstration data" message="This wipes all documents, reports, issues and audit records stored in this browser and re-seeds the synthetic dataset. This cannot be undone." confirmLabel="Reset workspace" danger onConfirm={doReset} onCancel={() => setResetOpen(false)} />
      {busy && <div className="spin-overlay"><Spinner /> Restoring dataset…</div>}
    </Card>
  );
}

export { Settings as SettingsPage };
