/**
 * useAuth — convenience hook that delegates to AuthContext.
 *
 * This hook is a thin wrapper around useAuthContext() so that all
 * existing components continue to work without any changes.
 * The AuthState type is intentionally kept compatible with the previous
 * standalone hook signature (it gains the optional `user` field).
 */

import { useAuthContext } from '../auth/AuthContext';
import type { AuthContextValue } from '../auth/AuthContext';

/** @deprecated Use AuthContextValue from auth/AuthContext directly. */
export type AuthState = AuthContextValue;

export function useAuth(): AuthContextValue {
  return useAuthContext();
}
