import {
  LayoutDashboard, FileStack, UploadCloud, Sparkles, FileText, ShieldCheck,
  Copy, GitCompareArrows, LineChart, ScrollText, Settings as SettingsIcon, ClipboardCheck,
} from 'lucide-react';
import type { Role } from '../../lib/types';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  roles?: Role[];
  group: 'Workspace' | 'Evidence' | 'Governance';
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', path: '/app/overview', icon: <LayoutDashboard size={17} />, group: 'Workspace' },
  { id: 'documents', label: 'Document Repository', path: '/app/documents', icon: <FileStack size={17} />, group: 'Workspace' },
  { id: 'upload', label: 'Upload & Processing', path: '/app/upload', icon: <UploadCloud size={17} />, roles: ['administrator', 'analyst'], group: 'Workspace' },
  { id: 'query', label: 'AI Query Workspace', path: '/app/query', icon: <Sparkles size={17} />, group: 'Workspace' },
  { id: 'reports', label: 'Report Builder', path: '/app/reports', icon: <FileText size={17} />, group: 'Workspace' },
  { id: 'tasks', label: 'My Tasks', path: '/app/tasks', icon: <ClipboardCheck size={17} />, group: 'Workspace' },
  { id: 'validation', label: 'Data Validation', path: '/app/validation', icon: <ShieldCheck size={17} />, group: 'Evidence' },
  { id: 'duplicates', label: 'Duplicate Detection', path: '/app/duplicates', icon: <Copy size={17} />, group: 'Evidence' },
  { id: 'conflicts', label: 'Conflict Review', path: '/app/conflicts', icon: <GitCompareArrows size={17} />, group: 'Evidence' },
  { id: 'insights', label: 'Historical Insights', path: '/app/insights', icon: <LineChart size={17} />, group: 'Evidence' },
  { id: 'audit', label: 'Audit Trail', path: '/app/audit', icon: <ScrollText size={17} />, roles: ['administrator', 'reviewer'], group: 'Governance' },
  { id: 'settings', label: 'Settings', path: '/app/settings', icon: <SettingsIcon size={17} />, group: 'Governance' },
];

export function visibleNav(role: Role): NavItem[] {
  return NAV_ITEMS.filter((n) => !n.roles || n.roles.includes(role));
}

export function navById(id: string): NavItem | undefined {
  return NAV_ITEMS.find((n) => n.id === id);
}

export interface PageInfo {
  title: string;
  crumbs: { label: string; to?: string }[];
}

export function getPageInfo(pathname: string): PageInfo {
  const map: { match: (p: string) => boolean; info: PageInfo }[] = [
    { match: (p) => p === '/app/overview', info: { title: 'Overview', crumbs: [{ label: 'Workspace' }, { label: 'Overview' }] } },
    { match: (p) => p === '/app/documents', info: { title: 'Document Repository', crumbs: [{ label: 'Workspace' }, { label: 'Documents' }] } },
    { match: (p) => p.startsWith('/app/documents/'), info: { title: 'Document Detail', crumbs: [{ label: 'Workspace' }, { label: 'Documents', to: '/app/documents' }, { label: 'Detail' }] } },
    { match: (p) => p === '/app/upload', info: { title: 'Upload & Processing', crumbs: [{ label: 'Workspace' }, { label: 'Upload' }] } },
    { match: (p) => p === '/app/query', info: { title: 'AI Query Workspace', crumbs: [{ label: 'Workspace' }, { label: 'Query' }] } },
    { match: (p) => p === '/app/tasks', info: { title: 'My Tasks', crumbs: [{ label: 'Workspace' }, { label: 'My Tasks' }] } },
    { match: (p) => p === '/app/reports', info: { title: 'Report Builder', crumbs: [{ label: 'Workspace' }, { label: 'Reports' }] } },
    { match: (p) => p.startsWith('/app/reports/'), info: { title: 'Report', crumbs: [{ label: 'Workspace' }, { label: 'Reports', to: '/app/reports' }, { label: 'Detail' }] } },
    { match: (p) => p === '/app/validation', info: { title: 'Data Validation', crumbs: [{ label: 'Evidence' }, { label: 'Validation' }] } },
    { match: (p) => p === '/app/duplicates', info: { title: 'Duplicate Detection', crumbs: [{ label: 'Evidence' }, { label: 'Duplicates' }] } },
    { match: (p) => p === '/app/conflicts', info: { title: 'Conflict Review', crumbs: [{ label: 'Evidence' }, { label: 'Conflicts' }] } },
    { match: (p) => p === '/app/insights', info: { title: 'Historical Insights', crumbs: [{ label: 'Evidence' }, { label: 'Insights' }] } },
    { match: (p) => p === '/app/audit', info: { title: 'Audit Trail', crumbs: [{ label: 'Governance' }, { label: 'Audit Trail' }] } },
    { match: (p) => p === '/app/settings', info: { title: 'Settings', crumbs: [{ label: 'Governance' }, { label: 'Settings' }] } },
  ];
  for (const m of map) if (m.match(pathname)) return m.info;
  return { title: 'STRATAVEX', crumbs: [{ label: 'Workspace' }] };
}
