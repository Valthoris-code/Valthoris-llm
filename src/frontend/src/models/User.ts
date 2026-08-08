/**
 * User model and role system for Valthoris.
 *
 * Roles follow a simple hierarchy: member < moderator < administrator.
 * Roles are resolved from the backend canister and must not be trusted from
 * mutable browser storage.
 */

export type UserRole = 'member' | 'moderator' | 'administrator';

/** Numeric rank used for minimum-role comparisons. */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  member:        0,
  moderator:     1,
  administrator: 2,
};

/** Returns true if `userRole` is at least as privileged as `requiredRole`. */
export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/** Core identity object kept in AuthContext. */
export interface User {
  /** Internet Identity principal text representation. */
  principal: string;
  /** Assigned role — defaults to "member" after login. */
  role: UserRole;
}
