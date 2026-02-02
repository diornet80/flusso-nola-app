
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif'
        }}>
          <div style={{
            maxWidth: '28rem',
            width: '100%',
            backgroundColor: '#1e293b',
            border: '1px solid #ef4444',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f87171', marginBottom: '0.5rem' }}>Si è verificato un errore</h1>
            <p style={{ color: '#cbd5e1', marginBottom: '1rem', fontSize: '0.875rem' }}>Qualcosa non ha funzionato nel caricamento dell'applicazione.</p>
            <pre style={{
              backgroundColor: 'rgba(0,0,0,0.3)',
              padding: '0.75rem',
              borderRadius: '0.25rem',
              fontSize: '0.75rem',
              color: '#fca5a5',
              overflow: 'auto',
              maxHeight: '10rem',
              marginBottom: '1rem'
            }}>
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                width: '100%',
                padding: '0.5rem 1rem',
                backgroundColor: '#4f46e5',
                color: 'white',
                borderRadius: '0.25rem',
                border: 'none',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Ricarica Pagina
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
