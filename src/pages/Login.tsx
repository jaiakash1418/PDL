import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, FileSearch, Fingerprint, Lock, Mail, ShieldCheck, Workflow } from 'lucide-react';
import { useStore } from '../state/store';
import { DEMO_ACCOUNTS } from '../services/auth';
import { Button, Field } from '../components/ui';
import { ROLE_LABELS, type Role } from '../lib/types';

export function Login() {
  const navigate = useNavigate();
  const login = useStore((s) => s.login);
  const demoAccess = useStore((s) => s.demoAccess);
  const session = useStore((s) => s.session);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<Role | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  if (session) navigate('/app/overview', { replace: true });

  const validate = () => {
    const fe: { email?: string; password?: string } = {};
    if (!email.trim()) fe.email = 'Work email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fe.email = 'Enter a valid email address.';
    if (!password) fe.password = 'Password is required.';
    else if (password.length < 6) fe.password = 'Passwords are at least 6 characters.';
    setFieldErrors(fe);
    return Object.keys(fe).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setLoading(true);
    const res = await login(email.trim(), password, remember);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'Sign in failed.');
      return;
    }
    navigate('/app/overview', { replace: true });
  };

  const fillDemo = (acc: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setFieldErrors({});
    setError('');
  };

  const explore = async (role: Role) => {
    setDemoLoading(role);
    try {
      await demoAccess(role);
      navigate('/app/overview', { replace: true });
    } finally {
      setDemoLoading(null);
    }
  };

  return (
    <div className="login">
      <div className="login__brand">
        <StratumArt />
        <div className="brandline">
          <img src="/stratavex.svg" alt="" />
          <div className="col" style={{ gap: 0 }}>
            <span className="name">STRATAVEX</span>
            <span className="tag">From Geological Records to Verified Intelligence</span>
          </div>
        </div>

        <div className="col gap-20">
          <h2>From complex records to confident decisions.</h2>
          <p className="lead">
            STRATAVEX indexes geological, production, safety and administrative documents, then answers questions with
            traceable citations. When evidence is missing or conflicting, it says so rather than inventing an answer.
          </p>
          <div className="login__benefits">
            <Benefit icon={<FileSearch size={17} />} title="Traceable Intelligence" text="Every answer links back to a document, section and page." />
            <Benefit icon={<ShieldCheck size={17} />} title="Verified Reporting" text="Reports built only from cited records, with source coverage shown." />
            <Benefit icon={<Workflow size={17} />} title="Auditable Workflows" text="A hash-chained activity log records every important action." />
          </div>
        </div>

        <p className="xsmall" style={{ color: '#6b7a92' }}>
          Academic demonstration prototype with synthetic data. Not an official CMPDI or Coal India Limited system.
        </p>
      </div>

      <div className="login__form-side">
        <div className="login__card stack">
          <div className="col gap-4">
            <h2 style={{ fontSize: 26 }}>Welcome back</h2>
            <p className="muted">Sign in to your STRATAVEX workspace.</p>
          </div>

          {error && <div className="banner error">{error}</div>}

          <form className="stack" onSubmit={onSubmit} noValidate>
            <Field label="Work email" error={fieldErrors.email} required>
              <div className="input-affix">
                <Mail size={16} className="lead" />
                <input
                  className={`input${fieldErrors.email ? ' error' : ''}`}
                  type="email"
                  autoComplete="username"
                  placeholder="you@organisation.gov"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </Field>

            <Field label="Password" error={fieldErrors.password} required>
              <div className="input-affix">
                <Lock size={16} className="lead" />
                <input
                  className={`input${fieldErrors.password ? ' error' : ''}`}
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: 40 }}
                />
                <button type="button" className="trail" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <div className="row-between">
              <label className="checkbox">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Remember me
              </label>
              <a href="/forgot-password" onClick={(e) => { e.preventDefault(); navigate('/forgot-password'); }}>Forgot password?</a>
            </div>

            <Button type="submit" variant="primary" size="lg" full loading={loading}>
              {!loading && <Fingerprint size={17} />} Sign In
            </Button>
          </form>

          <div className="hr-text">or</div>

          <div className="demo-note">
            <div className="row gap-6 strong"><ShieldCheck size={14} /> Explore Demo</div>
            <p className="mt-4">Enter the workspace instantly with a demonstration role. No registration. Data is synthetic and stored only in this browser.</p>
            <div className="row gap-8 wrap" style={{ marginTop: 10 }}>
              {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                <Button key={role} size="sm" variant={role === 'analyst' ? 'navy' : 'default'} loading={demoLoading === role} onClick={() => explore(role)}>
                  {ROLE_LABELS[role]}
                </Button>
              ))}
            </div>
          </div>

          <div className="demo-note" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
            <div className="strong small row gap-6"><Lock size={13} /> Provisioned demonstration accounts</div>
            <div className="demo-accounts">
              {DEMO_ACCOUNTS.map((acc) => (
                <button key={acc.email} type="button" className="demo-account" onClick={() => fillDemo(acc)}>
                  <span className="col who" style={{ alignItems: 'flex-start' }}>
                    <span className="strong">{acc.label}</span>
                    <span className="cred">{acc.email}</span>
                  </span>
                  <span className="cred">{acc.password}</span>
                </button>
              ))}
            </div>
            <p className="xsmall muted mt-8">
              Demo credentials only. In production, sign-in would use the organisation identity provider; browser-only
              authentication is not a secure multi-user backend.
            </p>
          </div>

          <div className="center">
            <a className="small" href="/app/help" onClick={(e) => { e.preventDefault(); explore('analyst'); }}>
              Continue as Analyst to explore the workspace <ArrowRight size={13} style={{ verticalAlign: '-2px' }} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Benefit({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="login__benefit">
      <span className="ic">{icon}</span>
      <div>
        <h4>{title}</h4>
        <p>{text}</p>
      </div>
    </div>
  );
}

function StratumArt() {
  return (
    <svg className="strata-art" viewBox="0 0 520 420" aria-hidden="true">
      <defs>
        <linearGradient id="gp" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#2dd4bf" stopOpacity="0.9" />
          <stop offset="1" stopColor="#0d9488" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <path
          key={i}
          d={`M-20 ${60 + i * 46} C 120 ${20 + i * 46}, 260 ${110 + i * 46}, 540 ${40 + i * 46}`}
          stroke={i % 2 === 0 ? 'url(#gp)' : '#1e2d4a'}
          strokeWidth={i % 2 === 0 ? 3 : 2}
          fill="none"
          strokeLinecap="round"
        />
      ))}
      {[
        [80, 150], [220, 90], [360, 200], [150, 300], [430, 280], [300, 350],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 4 : 3} fill="#2dd4bf" opacity="0.6" />
      ))}
    </svg>
  );
}
