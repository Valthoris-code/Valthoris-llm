/**
 * ProtectedRoute — route guard that requires authentication.
 *
 * Usage in App.tsx:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="dashboard" element={<Dashboard />} />
 *   </Route>
 *
 * While auth state is loading a spinner is shown.
 * Unauthenticated visitors are redirected to `redirectTo` (default: "/").
 * If a `requiredRole` is supplied, users whose role is below the threshold
 * are also redirected.
 */

import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthContext } from '../auth/AuthContext';
import type { UserRole } from '../models/User';
import { hasMinimumRole } from '../models/User';

interface ProtectedRouteProps {
  /** Minimum role required to access the route. Defaults to "member". */
  requiredRole?: UserRole;
  /** Path to redirect unauthorised visitors. Defaults to "/". */
  redirectTo?: string;
}

export default function ProtectedRoute({
  requiredRole = 'member',
  redirectTo   = '/',
}: ProtectedRouteProps) {
  const { isAuthenticated, user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="page">
        <div className="spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  if (!user || !hasMinimumRole(user.role, requiredRole)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <Outlet />;
}
