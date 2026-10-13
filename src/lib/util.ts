import type { ProcessingStatus, IssueSeverity, ReportStatus, ConflictStatus, DuplicateStatus } from './types';

export function uid(prefix = ''): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return (prefix ? prefix + '_' : '') + c.randomUUID();
  const rand = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return (prefix ? prefix + '_' : '') + rand;
}

export function now(): number {
  return Date.now();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtDateTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

export function fmtTime(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function relativeTime(ts?: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(ts);
}

// Reporting period helpers: canonical form "YYYY-MM".
export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return period;
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function periodSortKey(period: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return 0;
  return Number(m[1]) * 100 + Number(m[2]);
}

export function fmtBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtNumber(n: number, digits = 0): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ext(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : '';
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

export function download(filename: string, data: Blob | string, type = 'text/plain'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function statusTone(status: ProcessingStatus): string {
  switch (status) {
    case 'Indexed': return 'success';
    case 'Processing': return 'processing';
    case 'Uploaded': return 'info';
    case 'Partially Processed': return 'warning';
    case 'Failed': return 'error';
  }
}

export function severityTone(sev: IssueSeverity): string {
  switch (sev) {
    case 'critical': return 'error';
    case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'info';
    case 'info': return 'neutral';
  }
}

export function reportTone(status: ReportStatus): string {
  switch (status) {
    case 'Approved': return 'success';
    case 'Pending Review': return 'warning';
    case 'Rejected': return 'error';
    case 'Draft': return 'neutral';
  }
}

export function conflictTone(status: ConflictStatus): string {
  return status === 'Resolved' ? 'success' : 'error';
}

export function dupTone(status: DuplicateStatus): string {
  switch (status) {
    case 'Confirmed Duplicate': return 'error';
    case 'Not Duplicate': return 'success';
    case 'Dismissed': return 'neutral';
    case 'Pending': return 'warning';
  }
}

export function stableStringify(value: unknown): string {
  const seen = new WeakSet();
  const walk = (v: any): any => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return '[circular]';
      seen.add(v);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, any> = {};
      Object.keys(v).sort().forEach((k) => (out[k] = walk(v[k])));
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}
