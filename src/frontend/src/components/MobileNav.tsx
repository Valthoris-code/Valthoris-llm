import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useT } from '../i18n/useI18n';

const MOBILE_ITEMS = [
  { to: '/assistant',  labelKey: 'nav.assistant',    icon: '🤖' },
  { to: '/dashboard',  labelKey: 'nav.dashboard',    icon: '📊', auth: true },
  { to: '/scanner',    labelKey: 'nav.scanner',      icon: '🔍' },
  { to: '/community',  labelKey: 'nav.community',    icon: '🚨' },
  { to: '/safe-location', labelKey: 'nav.safeLocation', icon: '📍', auth: true },
  { to: '/radar',      labelKey: 'nav.radar',        icon: '🗺' },
];

export default function MobileNav() {
  const { isAuthenticated } = useAuth();
  const t = useT();

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
    }} className="mobile-nav" aria-label="Primary">
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
          <span aria-hidden="true" style={{ fontSize: '1.2rem' }}>{item.icon}</span>
          {t(item.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}
