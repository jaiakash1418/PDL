import { getOne, getAll, put } from '../lib/db';
import type { Role, User } from '../lib/types';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { uid, now } from '../lib/util';
import { appendAudit } from './audit';

const SESSION_KEY = 'stratavex.session';
const REMEMBER_KEY = 'stratavex.rememberedEmail';

export interface Session {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  issuedAt: number;
  expiresAt: number;
  demo: boolean;
}

export interface DemoAccount {
  label: string;
  email: string;
  password: string;
  role: Role;
  name: string;
  title: string;
}

// Documented demonstration accounts. Passwords are demo-only, hashed (PBKDF2)
// before storage; the plaintext below exists solely so the login screen can be
// exercised without provisioning. This is NOT production authentication.
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: 'Administrator', email: 'admin@stratavex.demo', password: 'Stratavex@123', role: 'administrator', name: 'R. Menon', title: 'Platform Administrator' },
  { label: 'Analyst', email: 'analyst@stratavex.demo', password: 'Stratavex@123', role: 'analyst', name: 'P. Nair', title: 'Mining Data Analyst' },
  { label: 'Reviewer', email: 'reviewer@stratavex.demo', password: 'Stratavex@123', role: 'reviewer', name: 'S. Ghosh', title: 'Chief Reviewer' },
];

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export async function provisionDemoUsers(): Promise<void> {
  const existing = await getAll('users');
  if (existing.length > 0) return;
  for (const acc of DEMO_ACCOUNTS) {
    const { hash, salt } = await hashPassword(acc.password);
    const user: User = {
      id: `user_${acc.role}`,
      email: acc.email,
      name: acc.name,
      role: acc.role,
      title: acc.title,
      passwordHash: hash,
      salt,
      active: true,
      isDemo: true,
      createdAt: now(),
    };
    await put('users', user);
  }
}

export async function authenticate(email: string, password: string): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase();
  const users = await getAll('users');
  const user = users.find((u) => u.email.toLowerCase() === normalized);
  if (!user) return { ok: false, error: 'No account found for this email address.' };
  if (!user.active) return { ok: false, error: 'This account is disabled. Contact an administrator.' };
  if (!user.passwordHash || !user.salt) return { ok: false, error: 'This account has no password configured.' };
  const valid = await verifyPassword(password, user.passwordHash, user.salt);
  if (!valid) return { ok: false, error: 'Incorrect password. Please try again.' };
  return { ok: true, user };
}

export async function startSession(user: User, remember: boolean): Promise<Session> {
  const session: Session = {
    id: user.id,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    issuedAt: now(),
    expiresAt: now() + SESSION_TTL_MS,
    demo: true,
  };
  const target = remember ? localStorage : sessionStorage;
  target.setItem(SESSION_KEY, JSON.stringify(session));
  if (remember) localStorage.setItem(REMEMBER_KEY, user.email);
  else localStorage.removeItem(REMEMBER_KEY);

  const fresh = await getOne('users', user.id);
  if (fresh) { fresh.lastLoginAt = now(); await put('users', fresh); }

  await appendAudit({
    actorId: user.id, actorName: user.name, actorRole: user.role,
    action: 'auth.login', resourceType: 'session', resourceName: user.email,
    meta: { method: 'demo-password', remember },
  });
  return session;
}

export function loadSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    if (s.expiresAt < now()) {
      clearSession();
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export async function endSession(session: Session | null): Promise<void> {
  clearSession();
  if (session) {
    await appendAudit({
      actorId: session.userId, actorName: session.name, actorRole: session.role,
      action: 'auth.logout', resourceType: 'session', resourceName: session.email,
    });
  }
}

export async function startDemoSession(role: Role): Promise<Session> {
  const users = await getAll('users');
  const user = users.find((u) => u.role === role && u.active) ?? users[0];
  if (!user) throw new Error('No demonstration account is available.');
  const session: Session = {
    id: user.id,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    issuedAt: now(),
    expiresAt: now() + SESSION_TTL_MS,
    demo: true,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  const fresh = await getOne('users', user.id);
  if (fresh) { fresh.lastLoginAt = now(); await put('users', fresh); }
  await appendAudit({
    actorId: user.id, actorName: user.name, actorRole: user.role,
    action: 'auth.demo_access', resourceType: 'session', resourceName: user.email,
    meta: { method: 'explore-demo', role },
  });
  return session;
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function rememberedEmail(): string {
  return localStorage.getItem(REMEMBER_KEY) ?? '';
}

export async function getUsers(): Promise<User[]> {
  return getAll('users');
}

export async function getUser(id: string): Promise<User | undefined> {
  return getOne('users', id);
}

export async function createUser(input: { email: string; name: string; role: Role; title?: string; password: string }): Promise<User> {
  const { hash, salt } = await hashPassword(input.password);
  const user: User = {
    id: uid('user'),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role,
    title: input.title,
    passwordHash: hash,
    salt,
    active: true,
    createdAt: now(),
  };
  await put('users', user);
  return user;
}

export async function updateUser(user: User): Promise<void> {
  await put('users', user);
}

export async function setUserPassword(userId: string, password: string): Promise<void> {
  const user = await getOne('users', userId);
  if (!user) return;
  const { hash, salt } = await hashPassword(password);
  user.passwordHash = hash;
  user.salt = salt;
  await put('users', user);
}

// Requesting a reset: no mail backend is configured in demo mode.
export const PASSWORD_RESET_GUIDANCE =
  'Password resets require an email or identity provider integration, which is not configured in this demonstration. In a deployed environment an administrator would trigger a reset link through the configured identity provider. Demo accounts use the documented demonstration passwords on the sign-in screen.';
