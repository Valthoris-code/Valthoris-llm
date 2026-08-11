import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

type AuthView = 'login' | 'register' | 'recovery';

export default function AuthPage() {
  const { login, loading, error: authError } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<AuthView>('login');
  const [error, setError] = useState('');

  const handleIICLogin = async () => {
    setError('');
    try {
      await login();
      navigate('/dashboard');
    } catch (e) {
      // A cancelled or failed Internet Identity flow must never look like a
      // successful sign-in.
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      padding: '2rem',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🛡</div>
          <h1 style={{ margin: 0, color: 'var(--accent-cyan)', fontSize: '1.5rem', letterSpacing: '0.08em' }}>VALTHORIS</h1>
          <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>AI Cybersecurity Platform</p>
        </div>

        <div className="card glass">
          {view === 'login' && (
            <>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Sign In</h2>
              {(error || authError) && (
                <div className="alert-error mb-2" role="alert">⚠ {error || authError}</div>
              )}
              <button
                className="btn-primary"
                style={{ width: '100%', padding: '0.65rem', marginBottom: '1.25rem' }}
                onClick={handleIICLogin}
                disabled={loading}
              >
                {loading ? '⏳ Connecting…' : '🔐 Sign in with Internet Identity'}
              </button>
              <div className="divider" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                <p style={{ margin: '0 0 0.5rem' }}>
                  VALTHORIS has no password: Internet Identity is the only authentication authority.
                </p>
                <button onClick={() => setView('recovery')} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.82rem' }}>
                  Lost access to your identity?
                </button>
              </div>
              <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                No account?{' '}
                <button onClick={() => setView('register')} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.82rem' }}>
                  Join waiting list
                </button>
              </div>
            </>
          )}

          {view === 'register' && (
            <>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Create Account</h2>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                VALTHORIS is currently in <strong>Beta Private</strong>. Register to join the waiting list for access.
              </p>
              <button
                className="btn-primary"
                style={{ width: '100%', padding: '0.6rem', marginBottom: '0.75rem' }}
                onClick={() => navigate('/waiting-list')}
              >
                🛡 Join Waiting List
              </button>
              <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Already registered?{' '}
                <button onClick={() => setView('login')} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.82rem' }}>
                  Sign In
                </button>
              </div>
            </>
          )}

          {view === 'recovery' && (
            <>
              <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Identity recovery</h2>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                VALTHORIS never stores a password and cannot reset your account. Your
                account is your Internet Identity anchor, and recovery is handled entirely
                by Internet Identity using the recovery phrase or recovery device you
                configured there.
              </p>
              <a
                className="btn-primary"
                href="https://identity.ic0.app"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', textAlign: 'center', padding: '0.55rem', textDecoration: 'none' }}
              >
                🔐 Open Internet Identity recovery
              </a>
              <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.82rem' }}>
                <button onClick={() => setView('login')} style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.82rem' }}>
                  ← Back to Sign In
                </button>
              </div>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
          Protected by Internet Computer. No central servers. No tracking.
        </p>
      </div>
    </div>
  );
}
