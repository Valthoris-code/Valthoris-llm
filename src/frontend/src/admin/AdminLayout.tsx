/**
 * AdminLayout — the shell of the administration, deliberately independent from
 * the normal Valthoris layout (its own sidebar, its own top bar, its own
 * stylesheet). Nothing from the ordinary application is rendered here and the
 * ordinary application never renders anything from here.
 *
 * Only sections the signed-in administrator actually holds a permission for are
 * listed. This is a convenience, not a control: the backend refuses the data
 * regardless of what the navigation shows.
 */

import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthContext';
import { ADMIN_NAV } from './adminNav';

export default function AdminLayout() {
  const { admin, signOut, can } = useAdminAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="vadmin">
      <div className="vadmin-shell">
        <aside className="vadmin-sidebar">
          <div className="vadmin-brand">
            <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>🛡</span>
            <span>
              <div className="vadmin-brand-title">VALTHORIS</div>
              <div className="vadmin-brand-sub">Administration &amp; Governance</div>
            </span>
          </div>

          <nav aria-label="Administration">
            {ADMIN_NAV.map(group => {
              const items = group.items.filter(item => can(item.permission));
              if (items.length === 0) return null;
              return (
                <div key={group.title}>
                  <div className="vadmin-group-title">{group.title}</div>
                  {items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/admin'}
                      className={({ isActive }) =>
                        'vadmin-nav-item' + (isActive ? ' active' : '')
                      }
                    >
                      <span aria-hidden="true">{item.icon}</span>
                      <span>{item.label}</span>
                      {item.phase > 1 && (
                        <span className="vadmin-nav-phase" title="Planned delivery phase">
                          F{item.phase}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="vadmin-main">
          <header className="vadmin-topbar">
            <div className="vadmin-identity">
              <span aria-hidden="true">👤</span>
              <span>
                <strong>{admin?.displayName}</strong>{' '}
                <span style={{ color: 'var(--vadmin-muted)' }}>{admin?.email}</span>
              </span>
              {admin?.isRoot && <span className="vadmin-badge root">ROOT</span>}
              <span className="vadmin-badge ok" title="Session verified at AAL2">
                MFA · AAL2
              </span>
            </div>
            <button type="button" className="vadmin-btn-ghost" onClick={handleSignOut}>
              Terminar sessão
            </button>
          </header>

          <main className="vadmin-content">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
