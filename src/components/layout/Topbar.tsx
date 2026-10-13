import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, User as UserIcon, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { useStore } from '../../state/store';
import { ROLE_LABELS } from '../../lib/types';
import { Avatar, Badge } from '../ui';
import { Dropdown } from '../overlays';
import { getPageInfo } from './nav';
import { relativeTime } from '../../lib/util';

export function Topbar({ collapsed, onToggleCollapse, onOpenMobile }: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}) {
  const session = useStore((s) => s.session)!;
  const settings = useStore((s) => s.settings);
  const notifications = useStore((s) => s.notifications);
  const readAll = useStore((s) => s.readAllNotifications);
  const setSettings = useStore((s) => s.setSettings);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const logout = useStore((s) => s.logout);
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [mobileQuery, setMobileQuery] = useState(false);

  const info = useMemo(() => getPageInfo(location.pathname), [location.pathname]);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => { setMobileQuery(false); }, [location.pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    navigate(`/app/documents?q=${encodeURIComponent(search.trim())}`);
    setSearch('');
  };

  return (
    <header className="topbar">
      <button className="icon-btn mobile-only" onClick={onOpenMobile} aria-label="Open menu"><Menu size={19} /></button>
      <button className="icon-btn desktop-only" onClick={onToggleCollapse} aria-label="Collapse sidebar">
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <div className="topbar__title">
        <h1>{info.title}</h1>
        <div className="breadcrumb">
          {info.crumbs.map((c, i) => (
            <span key={i} className="row gap-6">
              {i > 0 && <span>/</span>}
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="grow" />

      <form className="global-search desktop-only" onSubmit={submitSearch}>
        <Search size={15} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents, reports, content…"
          aria-label="Global search"
        />
      </form>

      <button className="icon-btn mobile-only" onClick={() => setMobileQuery((v) => !v)} aria-label="Search"><Search size={18} /></button>

      <Dropdown
        trigger={
          <button className="btn btn-sm" style={{ maxWidth: 220 }}>
            <span className="truncate">{settings?.subsidiary ?? 'Workspace'}</span>
            <ChevronDown size={14} />
          </button>
        }
      >
        <div className="dropdown__label">Organisational scope</div>
        {(settings?.subsidiaries ?? []).map((s) => (
          <button key={s} className="dropdown__item" onClick={() => setSettings({ subsidiary: s })}>
            {s === settings?.subsidiary ? <Badge tone="teal">Active</Badge> : <span style={{ width: 44 }} />}
            <span className="grow truncate">{s}</span>
          </button>
        ))}
        <div className="dropdown__sep" />
        <div className="dropdown__label" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--ink-400)' }}>
          Demonstration scope selector. Filters default report and insight scope.
        </div>
      </Dropdown>

      <Dropdown
        trigger={
          <button className="icon-btn" aria-label="Notifications">
            <Bell size={18} />
            {unread > 0 && <span className="dot" />}
          </button>
        }
      >
        <div className="dropdown__label row-between">
          <span>Notifications</span>
          {unread > 0 && <button className="btn-link small" onClick={readAll}>Mark all read</button>}
        </div>
        {notifications.length === 0 && <div className="small muted" style={{ padding: '8px 10px' }}>No notifications.</div>}
        {notifications.slice(0, 8).map((n) => (
          <Link key={n.id} to={n.link ?? '/app/overview'} className="dropdown__item" style={{ alignItems: 'flex-start' }}>
            <span className="grow">
              <span className="row" style={{ gap: 6 }}>
                {!n.read && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--teal-500)', display: 'inline-block' }} />}
                <span className="small strong" style={{ color: 'var(--ink-900)' }}>{n.title}</span>
              </span>
              <span className="xsmall muted" style={{ display: 'block', marginTop: 2 }}>{n.body}</span>
              <span className="xsmall dim">{relativeTime(n.at)}</span>
            </span>
          </Link>
        ))}
      </Dropdown>

      <Dropdown
        trigger={
          <button className="btn btn-ghost btn-sm" style={{ gap: 8 }} aria-label="User menu">
            <Avatar name={session.name} size="sm" />
            <span className="col desktop-only" style={{ gap: 0, alignItems: 'flex-start' }}>
              <span className="small strong">{session.name}</span>
              <span className="xsmall muted">{ROLE_LABELS[session.role]}</span>
            </span>
            <ChevronDown size={14} />
          </button>
        }
      >
        <div className="dropdown__label">{session.email}</div>
        <div className="row gap-8" style={{ padding: '4px 10px 8px' }}>
          <Badge tone="teal">{ROLE_LABELS[session.role]}</Badge>
          <Badge tone="neutral">Demo session</Badge>
        </div>
        <div className="dropdown__sep" />
        <button className="dropdown__item" onClick={() => navigate('/app/settings')}><UserIcon size={15} /> Profile & preferences</button>
        <button className="dropdown__item" onClick={() => navigate('/app/settings')}><SettingsIcon size={15} /> Settings</button>
        <button className="dropdown__item" onClick={() => toggleTheme()}>
          {settings?.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />} Switch to {settings?.theme === 'dark' ? 'light' : 'dark'} theme
        </button>
        <div className="dropdown__sep" />
        <button className="dropdown__item" onClick={() => logout()}><LogOut size={15} /> Sign out</button>
      </Dropdown>

      {mobileQuery && (
        <form className="global-search" style={{ position: 'absolute', top: 'var(--topbar-h)', left: 0, right: 0, maxWidth: 'none', padding: 12, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex' }} onSubmit={submitSearch}>
          <Search size={15} />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents…" aria-label="Search" />
        </form>
      )}
    </header>
  );
}
