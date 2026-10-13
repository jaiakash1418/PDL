import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useStore } from '../../state/store';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { issueStats } from '../../services/validation';
import { duplicateStats } from '../../services/duplicates';
import { conflictStats } from '../../services/conflicts';
import { taskStats } from '../../services/tasks';
import { LoadingBlock } from '../ui';
import { Toaster } from '../overlays';

export function AppLayout() {
  const session = useStore((s) => s.session);
  const ready = useStore((s) => s.ready);
  const dataVersion = useStore((s) => s.dataVersion);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const location = useLocation();

  useEffect(() => {
    let active = true;
    (async () => {
      const [v, d, c, t] = await Promise.all([issueStats(), duplicateStats(), conflictStats(), taskStats()]);
      if (!active) return;
      setBadges({
        validation: v.open,
        duplicates: d.pending,
        conflicts: c.unresolved,
        tasks: t.open,
      });
    })();
    return () => { active = false; };
  }, [dataVersion, location.pathname]);

  if (!ready) {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><LoadingBlock label="Preparing workspace…" /></div>;
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;

  return (
    <div className={collapsed ? 'app-shell collapsed' : 'app-shell'}>
      <a className="skip-link" href="#main">Skip to content</a>
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} badges={badges} />
      <div className="main-col">
        <Topbar collapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} onOpenMobile={() => setMobileOpen(true)} />
        <main className="content" id="main" tabIndex={-1}>
          <div className="content-inner">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
