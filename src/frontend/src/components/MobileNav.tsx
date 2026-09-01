import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useT } from '../i18n/useI18n';

/**
 * The bottom bar of the installed app.
 *
 * Space here is scarce, and the saved conversations are the feature a user
 * comes back for: "Conversas" takes the slot "Local Seguro" used to have, and
 * "Local Seguro" stays one tap away in the "Mais" menu.
 */
const MOBILE_ITEMS: { to: string; labelKey: string; icon: string; end?: boolean }[] = [
  { to: '/assistant',             labelKey: 'nav.assistant',     icon: '🤖', end: true },
  { to: '/scanner',               labelKey: 'nav.scanner',       icon: '🔍' },
  { to: '/radar',                 labelKey: 'nav.radar',         icon: '🗺' },
  { to: '/assistant/conversas',   labelKey: 'nav.conversations', icon: '💬' },
  { to: '/profile',               labelKey: 'nav.profile',       icon: '👤' },
];

interface Props {
  onMenuOpen: () => void;
}

export default function MobileNav({ onMenuOpen }: Props) {
  const { isAuthenticated } = useAuth();
  const t = useT();

  return (
    <nav className="mobile-nav" aria-label="Primary navigation">
      {MOBILE_ITEMS.map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end ?? false}
          className={({ isActive }) =>
            `mobile-nav-item${isActive ? ' mobile-nav-item-active' : ''}`
          }
        >
          <span aria-hidden="true" className="mobile-nav-icon">{item.icon}</span>
          <span className="mobile-nav-label">{t(item.labelKey)}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className="mobile-nav-item mobile-nav-menu-btn"
        onClick={onMenuOpen}
        aria-label="Open navigation menu"
      >
        <span aria-hidden="true" className="mobile-nav-icon">☰</span>
        <span className="mobile-nav-label">{t('nav.more') || 'More'}</span>
      </button>
    </nav>
  );
}
