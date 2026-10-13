import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('STRATAVEX render error:', error, info);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-page">
        <div className="error-page__card">
          <span className="error-page__icon"><AlertTriangle size={30} /></span>
          <h2>Something went wrong</h2>
          <p className="muted">
            The workspace hit an unexpected error while rendering. Your stored documents and reports have not been
            affected. You can retry, or reload the application.
          </p>
          <pre className="code-block" style={{ textAlign: 'left', width: '100%' }}>{this.state.error.message}</pre>
          <div className="row gap-8 center">
            <button className="btn btn-primary" onClick={this.reset}>Try again</button>
            <button className="btn" onClick={() => window.location.reload()}>Reload application</button>
          </div>
        </div>
      </div>
    );
  }
}
