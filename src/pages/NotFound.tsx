import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFound() {
  return (
    <div className="error-page">
      <div className="error-page__card">
        <span className="error-page__icon"><Compass size={30} /></span>
        <h1>404</h1>
        <h2>This page does not exist</h2>
        <p className="muted">The page you are looking for could not be found. It may have been moved or the address may be incorrect.</p>
        <div className="row gap-8 center">
          <Link className="btn btn-primary" to="/">Go to sign-in</Link>
          <Link className="btn" to="/app/overview">Go to overview</Link>
        </div>
      </div>
    </div>
  );
}
