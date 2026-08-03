import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const MOBILE_ITEMS = [
  { to: '/assistant',  label: 'AI',        icon: '🤖' },
  { to: '/dashboard',  label: 'Dashboard', icon: '📊', auth: true },
  { to: '/scanner',    label: 'Scanner',   icon: '🔍' },
  { to: '/community',  label: 'Reports',   icon: '🚨' },
  { to: '/radar',      label: 'Radar',     icon: '🗺' },
];

export default function MobileNav() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  return (
    <nav style={{
      display: 'none',
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 60,
      background: 'var(--bg-secondary)',
      borderTop: '1px solid var(--border)',
      zIndex: 300,
    }} className="mobile-nav">
      {MOBILE_ITEMS.filter(i => !i.auth || isAuthenticated).map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            fontSize: '0.65rem',
            color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
            textDecoration: 'none',
            padding: '0.4rem 0',
          })}
        >
          <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
