import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { HelpCircle, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { useStore } from '../../state/store';
import { ROLE_LABELS } from '../../lib/types';
import { Avatar } from '../ui';
import { navById, visibleNav } from './nav';

export function Sidebar({ collapsed, mobileOpen, onNavigate, badges }: {
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
  badges: Record<string, number>;
}) {
  const session = useStore((s) => s.session)!;
  const logout = useStore((s) => s.logout);
  const items = visibleNav(session.role);

  const groups: Array<'Workspace' | 'Evidence' | 'Governance'> = ['Workspace', 'Evidence', 'Governance'];

  return (
    <aside className={clsx('sidebar', mobileOpen && 'open')}>
      <div className="sidebar__brand">
        <img src="/stratavex.svg" alt="STRATAVEX logo" />
        <div className="col" style={{ gap: 0 }}>
          <span className="name">STRATAVEX</span>
          <span className="tag">VERIFIED INTELLIGENCE</span>
        </div>
      </div>

      <nav className="sidebar__scroll" aria-label="Primary">
        {groups.map((g) => {
          const groupItems = items.filter((i) => i.group === g);
          if (groupItems.length === 0) return null;
          return (
            <div key={g}>
              <div className="sidebar__group-label">{g}</div>
              {groupItems.map((item) => (
                <NavLink key={item.id} to={item.path} className={({ isActive }) => clsx('nav-item', isActive && 'active')} onClick={onNavigate} title={item.label}>
                  {item.icon}
                  <span className="label">{item.label}</span>
                  {badges[item.id] ? <span className="count">{badges[item.id]}</span> : null}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sidebar__foot">
        <NavLink to="/app/help" className="nav-item" onClick={onNavigate} title="Help">
          <HelpCircle size={17} />
          <span className="label">Help & About</span>
        </NavLink>
        <NavLink to="/app/settings" className={({ isActive }) => clsx('nav-item', isActive && 'active')} onClick={onNavigate} title="Settings">
          <SettingsIcon size={17} />
          <span className="label">Settings</span>
        </NavLink>
        <div className="sidebar__user" onClick={() => logout()} title="Sign out">
          <Avatar name={session.name} size="sm" />
          <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
            <span className="sidebar__foottext strong" style={{ color: '#e6edf5', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</span>
            <span className="sidebar__foottext" style={{ color: '#7c8aa0', fontSize: 12.5 }}>{ROLE_LABELS[session.role]}</span>
          </div>
          <LogOut size={16} className="sidebar__foottext" style={{ color: '#7c8aa0' }} />
        </div>
      </div>
    </aside>
  );
}

export { navById };
