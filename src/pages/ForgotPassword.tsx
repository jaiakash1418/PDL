import { useNavigate } from 'react-router-dom';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { Button, Card } from '../components/ui';
import { PASSWORD_RESET_GUIDANCE } from '../services/auth';

export function ForgotPassword() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'var(--workspace)' }}>
      <Card style={{ maxWidth: 480, width: '100%' }}>
        <div className="card__body stack">
          <div className="row gap-12">
            <span className="stat-card__icon" style={{ margin: 0 }}><KeyRound size={18} /></span>
            <div>
              <h2>Reset your password</h2>
              <p className="small muted">Password recovery guidance for the demonstration environment.</p>
            </div>
          </div>

          <div className="banner warn">
            <div>
              <div className="strong">No email provider is configured</div>
              <p className="mt-4">{PASSWORD_RESET_GUIDANCE}</p>
            </div>
          </div>

          <div className="banner info">
            <div>
              <div className="strong">How to enable real resets</div>
              <p className="mt-4">
                Configure an identity provider (for example Supabase Auth, Clerk or your organisation SSO) and set
                <span className="mono"> VITE_* </span>environment variables. STRATAVEX will then redirect reset requests to the
                provider's secure hosted flow. Secrets must never be placed in frontend code or committed to source control.
              </p>
            </div>
          </div>

          <p className="small muted">
            For the demonstration, use one of the documented demonstration passwords shown on the sign-in screen, or use
            "Explore Demo" to enter with a role directly.
          </p>

          <Button variant="navy" icon={<ArrowLeft size={16} />} onClick={() => navigate('/login')}>Back to sign in</Button>
        </div>
      </Card>
    </div>
  );
}
