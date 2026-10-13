import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from './lib/types';
import { useStore } from './state/store';
import { AppLayout } from './components/layout/AppLayout';
import { LoadingBlock } from './components/ui';
import { Login } from './pages/Login';
import { ForgotPassword } from './pages/ForgotPassword';
import { Overview } from './pages/Overview';
import { Documents } from './pages/Documents';
import { DocumentDetail } from './pages/DocumentDetail';
import { Upload } from './pages/Upload';
import { Query } from './pages/Query';
import { Reports } from './pages/Reports';
import { ReportDetail } from './pages/ReportDetail';
import { Tasks } from './pages/Tasks';
import { Validation } from './pages/Validation';
import { Duplicates } from './pages/Duplicates';
import { Conflicts } from './pages/Conflicts';
import { Insights } from './pages/Insights';
import { Audit } from './pages/Audit';
import { Settings } from './pages/Settings';
import { Help } from './pages/Help';
import { NotFound } from './pages/NotFound';

function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const session = useStore((s) => s.session);
  if (!session) return <Navigate to="/login" replace />;
  if (!roles.includes(session.role)) {
    return (
      <div className="card">
        <div className="card__body">
          <h2>Access restricted</h2>
          <p className="muted mt-8">
            Your role ({session.role}) does not have permission to view this area. This restriction is enforced by the
            application, not only by hiding navigation.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function Boot({ children }: { children: React.ReactNode }) {
  const ready = useStore((s) => s.ready);
  const bootError = useStore((s) => s.bootError);
  const boot = useStore((s) => s.boot);
  if (!ready) {
    boot();
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><LoadingBlock label="Starting STRATAVEX…" /></div>;
  }
  if (bootError) {
    return (
      <div className="error-page">
        <div className="error-page__card">
          <h2>Workspace failed to initialise</h2>
          <p className="muted">{bootError}</p>
          <div className="row gap-8 center">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload application</button>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const session = useStore((s) => s.session);
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Boot>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/app/overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/:id" element={<DocumentDetail />} />
          <Route path="upload" element={<RequireRole roles={['administrator', 'analyst']}><Upload /></RequireRole>} />
          <Route path="query" element={<Query />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:id" element={<ReportDetail />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="validation" element={<Validation />} />
          <Route path="duplicates" element={<Duplicates />} />
          <Route path="conflicts" element={<Conflicts />} />
          <Route path="insights" element={<Insights />} />
          <Route path="audit" element={<RequireRole roles={['administrator', 'reviewer']}><Audit /></RequireRole>} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Boot>
  );
}

function RootRedirect() {
  const session = useStore((s) => s.session);
  return <Navigate to={session ? '/app/overview' : '/login'} replace />;
}
