import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useT } from '../i18n/useI18n';

interface DrawerItem {
  to: string;
  label: string;
  labelKey?: string;
  icon: string;
  public?: boolean;
  minRole?: string;
}

const DRAWER_ITEMS: DrawerItem[] = [
  { to: '/assistant',           label: 'AI Assistant',        labelKey: 'nav.assistant',    icon: '🤖', public: true },
  { to: '/dashboard',           label: 'Dashboard',           labelKey: 'nav.dashboard',    icon: '📊' },
  { to: '/scanner',             label: 'Scanner',             labelKey: 'nav.scanner',      icon: '🔍', public: true },
  { to: '/lookup',              label: 'Lookup',              labelKey: 'nav.lookup',       icon: '🔎', public: true },
  { to: '/radar',               label: 'Radar Global',        labelKey: 'nav.radar',        icon: '🗺', public: true },
  { to: '/safe-location',       label: 'Safe Location',       labelKey: 'nav.safeLocation', icon: '📍' },
  { to: '/community',           label: 'Community Reports',   labelKey: 'nav.community',    icon: '🚨', public: true },
  { to: '/crypto-intelligence', label: 'Crypto Intelligence', labelKey: 'nav.crypto',       icon: '₿',  public: true },
  { to: '/threat-intelligence', label: 'Threat Intelligence', labelKey: 'nav.threat',       icon: '🛡', public: true },
  { to: '/notifications',       label: 'Notifications',       labelKey: 'nav.notifications',icon: '🔔' },
  { to: '/downloads',           label: 'Downloads',           labelKey: 'nav.downloads',    icon: '⬇️', public: true },
  { to: '/profile',             label: 'Profile',             labelKey: 'nav.profile',      icon: '👤' },
  { to: '/settings',            label: 'Settings',            labelKey: 'nav.settings',     icon: '⚙️' },
  { to: '/legal',               label: 'Legal Framework',     labelKey: 'nav.legal',        icon: '⚖️', public: true },
  { to: '/help',                label: 'Help',                labelKey: 'nav.help',         icon: '❓', public: true },
  { to: '/contact',             label: 'Contact',             labelKey: 'nav.contact',      icon: '✉️', public: true },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MobileDrawer({ open, onClose }: Props) {
  const { isAuthenticated, user } = useAuth();
  const t = useT();

  const labelOf = (item: DrawerItem) => item.labelKey ? t(item.labelKey) : item.label;

  const visibleItems = DRAWER_ITEMS.filter(item => {
    if (!item.public && !isAuthenticated) return false;
    if (item.minRole && user?.role !== item.minRole) return false;
    return true;
  });

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="mobile-drawer-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside className="mobile-drawer" aria-label="Navigation menu" role="dialog" aria-modal="true">
        <div className="mobile-drawer-header">
          <span className="mobile-drawer-brand">
            <span style={{ fontSize: '1.3rem' }}>🛡</span>
            <span>VALTHORIS</span>
          </span>
          <button
            type="button"
            className="mobile-drawer-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="mobile-drawer-nav">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `mobile-drawer-item${isActive ? ' mobile-drawer-item-active' : ''}`
              }
              onClick={onClose}
            >
              <span className="mobile-drawer-icon" aria-hidden="true">{item.icon}</span>
              <span>{labelOf(item)}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
