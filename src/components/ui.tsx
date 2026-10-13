import React from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, Check, Copy, Inbox, X } from 'lucide-react';
import { useState } from 'react';

export type Tone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'processing' | 'teal';

export function Badge({ tone = 'neutral', children, dot, outline }: { tone?: Tone | string; children: React.ReactNode; dot?: boolean; outline?: boolean }) {
  return (
    <span className={clsx('badge', outline ? 'badge-outline' : `badge-${tone}`)}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function Spinner({ size = 'sm', className }: { size?: 'sm' | 'lg'; className?: string }) {
  return <span className={clsx('spinner', size === 'lg' && 'lg', className)} aria-label="Loading" />;
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spin-overlay">
      <Spinner size="lg" />
      <span className="muted">{label}</span>
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone?: 'proc' }) {
  return (
    <div className={clsx('progress', tone === 'proc' && 'proc')} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={30} />}
      <h4>{title}</h4>
      {description && <p className="small muted" style={{ maxWidth: 460 }}>{description}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle size={28} />}
      title="Could not load this view"
      description={message ?? 'An unexpected error occurred while loading data from browser storage.'}
      action={onRetry ? <Button size="sm" onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}

export function AsyncGate({ loading, error, onRetry, label = 'Loading…', children }: {
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  if (error) return <div className="card"><div className="card__body"><LoadError message={error} onRetry={onRetry} /></div></div>;
  if (loading) return <div className="spin-overlay"><Spinner size="lg" /> {label}</div>;
  return <>{children}</>;
}

export function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={clsx('card', className)} style={style}>{children}</div>;
}

export function CardHead({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="card__head">
      <div className="col">
        <h3>{title}</h3>
        {sub && <span className="small muted">{sub}</span>}
      </div>
      {right}
    </div>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'navy' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  full?: boolean;
};

export function Button({ variant = 'default', size = 'md', loading, icon, full, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx('btn', variant !== 'default' && `btn-${variant}`, size !== 'md' && `btn-${size}`, full && 'btn-full', className)}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, required }: { label?: string; hint?: string; error?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="field">
      {label && <label>{label}{required && <span style={{ color: 'var(--error)' }}> *</span>}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="error-text"><X size={12} />{error}</span>}
    </div>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length === 1 ? parts[0].slice(0, 2) : (parts[0][0] + parts[parts.length - 1][0]);
  return <span className={clsx('avatar', size !== 'md' && size)}>{initials.toUpperCase()}</span>;
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)} role="tab" aria-selected={o.value === value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} className={clsx('tab', t.id === value && 'active')} onClick={() => onChange(t.id)} role="tab" aria-selected={t.id === value}>
          {t.label}{typeof t.count === 'number' && <span className="small muted"> ({t.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', onCopied }: { text: string; label?: string; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    onCopied?.();
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <Button size="sm" variant="ghost" icon={done ? <Check size={14} /> : <Copy size={14} />} onClick={copy}>
      {done ? 'Copied' : label}
    </Button>
  );
}

export function KeyValue({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="col" style={{ gap: 2 }}>
      <span className="xsmall uppercase muted" style={{ fontWeight: 600 }}>{label}</span>
      <span className={clsx('small', mono && 'mono')} style={{ color: 'var(--ink-900)' }}>{children}</span>
    </div>
  );
}
