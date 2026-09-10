import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from './Home';
import '../app/globals.css';
import './native.css';
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() { return this.state.error ? <main style={{ padding: 24, color: '#edf2e5' }}><h1>Onda non riesce ad aprirsi</h1><p>{this.state.error}</p><button onClick={() => location.reload()}>Riprova</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><Home /></ErrorBoundary>);
