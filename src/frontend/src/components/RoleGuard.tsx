/**
 * RoleGuard — inline role-based access control component.
 *
 * Renders `children` only when the authenticated user meets or exceeds
 * `requiredRole`. Renders `fallback` (default: nothing) otherwise.
 *
 * Usage:
 *   <RoleGuard requiredRole="moderator" fallback={<p>Access denied.</p>}>
 *     <ModeratorPanel />
 *   </RoleGuard>
 */

import React from 'react';
import type { ReactNode } from 'react';
import { useAuthContext } from '../auth/AuthContext';
import type { UserRole } from '../models/User';
import { hasMinimumRole } from '../models/User';

interface RoleGuardProps {
  /** Minimum role required to render children. */
  requiredRole: UserRole;
  /** Element rendered when the user does not meet the role threshold. */
  fallback?: ReactNode;
  children: ReactNode;
}

export default function RoleGuard({
  requiredRole,
  fallback = null,
  children,
}: RoleGuardProps) {
  const { isAuthenticated, user } = useAuthContext();

  if (!isAuthenticated || !user) return <>{fallback}</>;
  if (!hasMinimumRole(user.role, requiredRole)) return <>{fallback}</>;

  return <>{children}</>;
}
