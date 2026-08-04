import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useT } from '../i18n/useI18n';
import LanguageSelector from './LanguageSelector';

interface Props {
  onMenuToggle: () => void;
}

export default function TopToolbar({ onMenuToggle }: Props) {
  const { isAuthenticated, principal, loading, login, logout, user } = useAuth();
  const navigate = useNavigate();
  const t = useT();

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
      padding: '0 1rem',
      gap: '0.75rem',
      position: 'sticky',
      top: 0,
      zIndex: 150,
      flexShrink: 0,
      minWidth: 0,
    }}>
      {/* Sidebar toggle — desktop only, hidden on mobile via CSS */}
      <button
        type="button"
        onClick={onMenuToggle}
        aria-label={t('toolbar.menu')}
        className="toolbar-menu-btn"
      >
        ☰
      </button>

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
        <span className="toolbar-brand-text">VALTHORIS</span>
      </NavLink>

      <span className="badge-beta toolbar-beta" style={{ flexShrink: 0 }}>BETA PRIVATE</span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search hint — desktop only */}
      <div className="toolbar-search" style={{
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
        🔍 <span>{t('toolbar.quickScan')}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', opacity: 0.5 }}>⌘K</span>
      </div>

      {/* Language */}
      <LanguageSelector compact />

      {/* Auth area */}
      <div style={{ flexShrink: 0, minWidth: 0 }}>
        {loading ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>…</span>
        ) : isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
              <span className="toolbar-principal" style={{ fontFamily: 'monospace' }}>{principal?.slice(0, 8)}…</span>
              {user?.role === 'administrator' && (
                <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>Admin</span>
              )}
            </NavLink>
            <button className="btn-secondary toolbar-signout" style={{ fontSize: '0.82rem', padding: '0.3rem 0.8rem' }} onClick={logout}>
              {t('toolbar.signOut')}
            </button>
          </div>
        ) : (
          <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.3rem 0.9rem' }} onClick={handleLogin}>
            🔐 {t('toolbar.signIn')}
          </button>
        )}
      </div>
    </header>
  );
}
