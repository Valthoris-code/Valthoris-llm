import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Layout.css';

const NAV_LINKS = [
  { to: '/',            label: 'Home',         icon: '🏠', public: true  },
  { to: '/dashboard',   label: 'Dashboard',    icon: '📊', public: false },
  { to: '/scanner',     label: 'Scanner',      icon: '🔍', public: true  },
  { to: '/reports',     label: 'Denúncias',    icon: '🚨', public: true  },
  { to: '/safe-location', label: 'Local Seguro', icon: '📍', public: false },
  { to: '/profile',     label: 'Perfil',       icon: '👤', public: false },
];

export default function Layout() {
  const { isAuthenticated, principal, loading, login, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    await login();
    navigate('/dashboard');
  };

  return (
    <div className="layout">
      <header className="navbar">
        <NavLink to="/" className="navbar-brand">
          <span className="brand-icon">🛡</span>
          <span className="brand-text">VALTHORIS</span>
        </NavLink>

        <nav className="navbar-links">
          {NAV_LINKS
            .filter(l => l.public || isAuthenticated)
            .map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {l.icon} {l.label}
              </NavLink>
            ))}
        </nav>

        <div className="navbar-auth">
          {loading ? (
            <span className="text-muted">...</span>
          ) : isAuthenticated ? (
            <div className="auth-info">
              <span className="principal-badge" title={principal ?? ''}>
                {principal?.slice(0, 10)}…
              </span>
              <button className="btn-secondary" onClick={logout}>Sair</button>
            </div>
          ) : (
            <button className="btn-primary" onClick={handleLogin}>
              🔐 Entrar com Internet Identity
            </button>
          )}
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <footer className="footer">
        <p>
          VALTHORIS &copy; 2024 — Plataforma de Cibersegurança na{' '}
          <a href="https://internetcomputer.org" target="_blank" rel="noreferrer">
            Internet Computer
          </a>
        </p>
      </footer>
    </div>
  );
}
