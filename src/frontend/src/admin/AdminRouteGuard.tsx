/**
 * AdminRouteGuard — the frontend half of the two-layer protection.
 *
 * It renders the administration only for a session that Supabase Auth verified,
 * that reached AAL2, and that the `admin-api` Edge Function recognised as an
 * administrator. Anything else is sent to /admin/login, which itself reveals
 * nothing.
 *
 * This guard exists so the administration is invisible, not so it is secure:
 * the data lives behind the Edge Function and behind RLS, both of which refuse
 * a non-administrator no matter what this component decides.
 */

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthContext';

export default function AdminRouteGuard() {
  const { stage } = useAdminAuth();
  const location = useLocation();

  if (stage === 'loading') {
    return (
      <div className="vadmin">
        <div className="vadmin-login">
          <div role="status" aria-live="polite" style={{ color: 'var(--vadmin-muted)' }}>
            A verificar sessão…
          </div>
        </div>
      </div>
    );
  }

  if (stage !== 'authorized') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/**
 * PermissionGuard — refuses a route the administrator holds no permission for.
 * The backend refuses it too; this only avoids rendering an empty screen.
 */
export function PermissionGuard({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  const { can } = useAdminAuth();
  if (!can(permission)) {
    return (
      <div className="vadmin-card">
        <h1 className="vadmin-page-title">Sem permissão</h1>
        <p className="vadmin-page-sub">
          A sua função administrativa não inclui esta área.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
