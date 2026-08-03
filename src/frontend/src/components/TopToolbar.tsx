import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface Props {
  onMenuToggle: () => void;
}

export default function TopToolbar({ onMenuToggle }: Props) {
  const { isAuthenticated, principal, loading, login, logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    await login();
    navigate('/dashboard');
  };

  return (
    <header style={{
      height: 56,
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 1.25rem',
      gap: '1rem',
      position: 'sticky',
      top: 0,
      zIndex: 150,
      flexShrink: 0,
    }}>
      {/* Brand */}
      <NavLink
        to="/assistant"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          textDecoration: 'none',
          color: 'var(--accent-cyan)',
          fontWeight: 800,
          fontSize: '1.05rem',
          letterSpacing: '0.08em',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '1.3rem' }}>🛡</span>
        <span>VALTHORIS</span>
      </NavLink>

      <span className="badge-beta" style={{ flexShrink: 0 }}>BETA PRIVATE</span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search hint */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '0.3rem 0.9rem',
        fontSize: '0.82rem',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        minWidth: 180,
      }}>
        🔍 <span>Quick scan…</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.5 }}>⌘K</span>
      </div>

      {/* Auth area */}
      <div style={{ flexShrink: 0 }}>
        {loading ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>…</span>
        ) : isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <NavLink
              to="/profile"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                textDecoration: 'none',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '0.3rem 0.6rem',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
              }}
              title={principal ?? ''}
            >
              <span>👤</span>
              <span style={{ fontFamily: 'monospace' }}>{principal?.slice(0, 8)}…</span>
              {user?.role === 'administrator' && (
                <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>Admin</span>
              )}
            </NavLink>
            <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '0.3rem 0.8rem' }} onClick={logout}>
              Sign Out
            </button>
          </div>
        ) : (
          <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.3rem 0.9rem' }} onClick={handleLogin}>
            🔐 Sign In
          </button>
        )}
      </div>
    </header>
  );
}
