import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Global error boundary — catches any unhandled React render error
 * and shows a styled fallback instead of a blank white page.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log for debugging without crashing the fallback UI
    console.error('[VALTHORIS] Render error caught by ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: '#041426',
            color: '#e8f4fd',
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡</div>
          <h1
            style={{
              margin: 0,
              color: '#00d4ff',
              fontSize: '1.6rem',
              letterSpacing: '0.08em',
            }}
          >
            VALTHORIS
          </h1>
          <p style={{ color: '#7a9bbf', margin: '0.5rem 0 2rem', fontSize: '0.9rem' }}>
            AI Cybersecurity Platform
          </p>
          <div
            style={{
              background: 'rgba(255,51,102,0.10)',
              border: '1px solid #ff3366',
              borderRadius: 8,
              padding: '1.25rem 2rem',
              maxWidth: 480,
              marginBottom: '1.5rem',
            }}
          >
            <p style={{ margin: '0 0 0.5rem', fontWeight: 700, color: '#ff3366' }}>
              ⚠ Something went wrong
            </p>
            <p style={{ margin: 0, fontSize: '0.83rem', color: '#7a9bbf' }}>
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
          </div>
          <button
            onClick={() => window.location.assign('/')}
            style={{
              background: '#00d4ff',
              color: '#041426',
              border: 'none',
              borderRadius: 8,
              padding: '0.6rem 1.75rem',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            ↺ Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
