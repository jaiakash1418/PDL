import React, { useEffect, useId, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useStore } from '../state/store';
import { Button } from './ui';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, sub, children, footer, width }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'wide' | 'xwide';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    window.setTimeout(() => first?.focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const focusables = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusables.length === 0) { e.preventDefault(); return; }
        const f = focusables[0];
        const l = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === f) { e.preventDefault(); l.focus(); }
        else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={clsx('modal', width)} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal__head">
          <div className="col">
            <h2 id={titleId}>{title}</h2>
            {sub && <span className="small muted mt-4">{sub}</span>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, children }: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      {message && <p className="muted">{message}</p>}
      {children}
    </Modal>
  );
}

export function Dropdown({ trigger, children, align = 'right' }: { trigger: React.ReactNode; children: React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  return (
    <div className="dropdown" ref={ref} onKeyDown={(e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        ref.current?.querySelector<HTMLElement>('button')?.focus();
      }
    }}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && <div className="dropdown__menu" style={align === 'left' ? { left: 0, right: 'auto' } : undefined} onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

const ICONS = {
  info: <Info size={17} color="var(--info)" />,
  success: <CheckCircle2 size={17} color="var(--success)" />,
  warning: <AlertTriangle size={17} color="var(--warning)" />,
  error: <XCircle size={17} color="var(--error)" />,
};

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const remove = useStore((s) => s.removeToast);
  const enabled = useStore((s) => s.settings?.notifications.toasts ?? true);
  if (!enabled) return null;
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={clsx('toast', t.level)}>
          {ICONS[t.level]}
          <div className="grow">
            {t.title && <div className="strong small">{t.title}</div>}
            <div className="small" style={{ color: 'var(--ink-700)' }}>{t.message}</div>
          </div>
          <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => remove(t.id)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
