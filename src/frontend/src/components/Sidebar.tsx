import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useIsVerifiedAdmin } from '../admin/adminPresence';
import { useT } from '../i18n/useI18n';
import { hasMinimumRole } from '../models/User';
import type { UserRole } from '../models/User';

interface NavItem {
  to: string;
  /** i18n key resolved at render time, with `label` as the fallback. */
  labelKey?: string;
  label: string;
  icon: string;
  public?: boolean;
  minRole?: string;
  comingSoon?: boolean;
  children?: Omit<NavItem, 'children'>[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/assistant',           label: 'AI Assistant',         labelKey: 'nav.assistant',     icon: '🤖', public: true  },
  { to: '/dashboard',           label: 'Dashboard',            labelKey: 'nav.dashboard',     icon: '📊' },
  { to: '/scanner',             label: 'Scanner',              labelKey: 'nav.scanner',       icon: '🔍', public: true  },
  {
    to: '/lookup',              label: 'Lookup',               labelKey: 'nav.lookup',        icon: '🔎', public: true,
    children: [
      { to: '/lookup/phone',    label: 'Phone',    icon: '📞', public: true },
      { to: '/lookup/email',    label: 'Email',    icon: '✉️', public: true },
      { to: '/lookup/iban',     label: 'IBAN',     icon: '🏦', public: true },
      { to: '/lookup/crypto',   label: 'Crypto Wallet', icon: '₿', public: true },
      { to: '/lookup/url',      label: 'URL',      icon: '🌐', public: true },
      { to: '/lookup/qr',       label: 'QR Code',  icon: '📷', public: true },
      { to: '/lookup/domain',   label: 'Domain',   icon: '🖥', public: true },
      { to: '/lookup/username', label: 'Username', icon: '👤', public: true },
    ],
  },
  { to: '/radar',               label: 'Radar Global',         labelKey: 'nav.radar',         icon: '🗺', public: true  },
  { to: '/community',           label: 'Community Reports',    labelKey: 'nav.community',     icon: '🚨', public: true  },
  { to: '/crypto-intelligence', label: 'Crypto Intelligence',  labelKey: 'nav.crypto',        icon: '₿',  public: true  },
  { to: '/safe-location',       label: 'Safe Location',        labelKey: 'nav.safeLocation',  icon: '📍' },
  { to: '/rooms',               label: 'Safe Rooms',           labelKey: 'nav.safeRooms',     icon: '🛰', public: true  },
  { to: '/threat-intelligence', label: 'Threat Intelligence',  labelKey: 'nav.threat',        icon: '🛡', public: true  },
  { to: '/notifications',       label: 'Notifications',        labelKey: 'nav.notifications', icon: '🔔' },
  { to: '/downloads',           label: 'Downloads',            labelKey: 'nav.downloads',     icon: '⬇️', public: true  },
  { to: '/legal',               label: 'Legal Framework',      labelKey: 'nav.legal',         icon: '⚖️', public: true  },
  { to: '/contact',             label: 'Contact',              labelKey: 'nav.contact',       icon: '✉️', public: true  },
  { to: '/settings',            label: 'Settings',             labelKey: 'nav.settings',      icon: '⚙️' },
  { to: '/help',                label: 'Help',                 labelKey: 'nav.help',          icon: '❓', public: true  },
  // Administration is rendered only for principals the backend canister
  // resolved as administrators. Visibility is convenience, not security:
  // the canister re-checks every privileged call.
  { to: '/operations',          label: 'Administration',       labelKey: 'nav.admin',         icon: '🛡', minRole: 'administrator' },
];

/**
 * The Administration & Governance Center. It is appended only when a real,
 * server-verified Supabase administrative session exists (see
 * admin/adminPresence.ts) — never from a principal or an e-mail held in the
 * browser.
 */
const GOVERNANCE_ITEM = {
  to: '/admin',
  label: 'Administração',
  icon: '🛡',
};

const COMING_SOON: NavItem[] = [
  { to: '#autoshield',     label: 'AutoShield',          icon: '🔰', comingSoon: true },
  { to: '#android',        label: 'Android Protection',  icon: '🤖', comingSoon: true },
  { to: '#extension',      label: 'Browser Extension',   icon: '🧩', comingSoon: true },
  { to: '#enterprise',     label: 'Enterprise Dashboard', icon: '🏢', comingSoon: true },
  { to: '#realtime',       label: 'Realtime Detection',  icon: '⚡', comingSoon: true },
  { to: '#marketplace',    label: 'Marketplace API',     icon: '🛒', comingSoon: true },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: Props) {
  const { isAuthenticated, user } = useAuth();
  const isVerifiedAdmin = useIsVerifiedAdmin();
  const t = useT();
  const labelOf = (item: { label: string; labelKey?: string }) =>
    item.labelKey ? t(item.labelKey) : item.label;
  const location = useLocation();
  const [expandedGroup, setExpandedGroup] = useState<string | null>('/lookup');

  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.public && !isAuthenticated) return false;
    if (item.minRole) {
      if (!user || !hasMinimumRole(user.role, item.minRole as UserRole)) return false;
    }
    return true;
  }).concat(isVerifiedAdmin ? [GOVERNANCE_ITEM] : []);

  return (
    <aside
      className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}
      style={{
        width: collapsed ? 56 : 240,
        minWidth: collapsed ? 56 : 240,
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease, min-width 0.2s ease',
        overflow: 'hidden',
        zIndex: 90,
      }}
    >
      {/* Toggle button */}
      <button
        onClick={onToggle}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          padding: '0.75rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-end',
          borderBottom: '1px solid var(--border)',
          fontSize: '1rem',
        }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '▶' : '◀'}
      </button>

      {/* Nav items */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0.5rem 0' }}>
        {visibleItems.map(item => {
          const hasChildren = item.children && item.children.length > 0;
          const isGroupActive = hasChildren && item.children!.some(c => location.pathname.startsWith(c.to));
          const isExpanded = expandedGroup === item.to;

          if (hasChildren) {
            const visibleChildren = item.children!.filter(c => c.public || isAuthenticated);
            return (
              <div key={item.to}>
                <button
                  onClick={() => setExpandedGroup(isExpanded ? null : item.to)}
                  style={{
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    padding: collapsed ? '0.55rem 0' : '0.55rem 1rem',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    color: isGroupActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.88rem',
                    fontWeight: isGroupActive ? 700 : 400,
                    transition: 'color 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ fontSize: '1.05rem', flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span style={{ flex: 1, textAlign: 'left' }}>{labelOf(item)}</span>
                      <span style={{ fontSize: '0.65rem' }}>{isExpanded ? '▲' : '▼'}</span>
                    </>
                  )}
                </button>
                {!collapsed && isExpanded && (
                  <div style={{ paddingLeft: '1.5rem' }}>
                    {visibleChildren.map(child => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        style={({ isActive }) => ({
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.4rem 0.75rem',
                          borderRadius: 6,
                          fontSize: '0.83rem',
                          color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
                          background: isActive ? 'rgba(0,212,255,0.08)' : 'none',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                        })}
                      >
                        <span style={{ fontSize: '0.9rem' }}>{child.icon}</span>
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/assistant'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                padding: collapsed ? '0.55rem 0' : '0.55rem 1rem',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 0,
                fontSize: '0.88rem',
                fontWeight: isActive ? 700 : 400,
                color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)',
                background: isActive ? 'rgba(0,212,255,0.08)' : 'none',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                borderLeft: isActive && !collapsed ? '3px solid var(--accent-cyan)' : '3px solid transparent',
                transition: 'color 0.15s, background 0.15s',
              })}
              title={collapsed ? labelOf(item) : undefined}
            >
              <span style={{ fontSize: '1.05rem', flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && labelOf(item)}
            </NavLink>
          );
        })}

        {/* Coming Soon section */}
        {!collapsed && (
          <div style={{ marginTop: '1rem', padding: '0 1rem' }}>
            <div style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              marginBottom: '0.4rem',
              paddingBottom: '0.4rem',
              borderBottom: '1px solid var(--border)',
            }}>
              {t('nav.comingSoon')}
            </div>
            <NavLink
              to="/coming-soon"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                color: 'var(--accent-cyan)',
                textDecoration: 'none',
                marginBottom: '0.4rem',
              }}
            >
              View roadmap →
            </NavLink>
            {COMING_SOON.map(item => (
              <div
                key={item.to}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.45rem 0',
                  fontSize: '0.83rem',
                  color: 'var(--text-muted)',
                  opacity: 0.6,
                  cursor: 'default',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                <span>{item.label}</span>
                <span className="badge-coming-soon" style={{ marginLeft: 'auto', fontSize: '0.62rem' }}>Soon</span>
              </div>
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}
