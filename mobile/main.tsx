import React from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import './native.css';
import './mobile-player.css';

const Home = React.lazy(() => import('./Home'));

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error
        ? error.name + ': ' + error.message
        : String(error),
    };
  }

  render() {
    if (this.state.error !== null) {
      return (
        <main role="alert" style={{ padding: 24, color: '#edf2e5' }}>
          <h1>Onda non riesce ad aprirsi</h1>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {this.state.error}
          </p>
          <button type="button" className="button primary" onClick={() => location.reload()}>
            Riprova
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <React.Suspense fallback={
      <main role="status" style={{ padding: 24, color: '#edf2e5' }}>
        Avvio di Onda…
      </main>
    }>
      <Home />
    </React.Suspense>
  </ErrorBoundary>,
);
