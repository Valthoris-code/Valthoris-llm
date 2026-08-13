/**
 * AuthContext — shared authentication state for the entire application.
 *
 * Wrap the component tree with <AuthProvider> once (in main.tsx).
 * Consume the context anywhere with useAuthContext() or the
 * backward-compatible useAuth() re-export in hooks/useAuth.ts.
 *
 * Session persistence is handled by @dfinity/auth-client, which stores
 * the delegation chain in IndexedDB automatically. On page load the
 * provider calls client.isAuthenticated() to restore the session — no
 * manual localStorage management is required.
 *
 * Identity model (single source of truth):
 *   The Internet Identity principal is the canonical Valthoris user id. The
 *   browser never opens a Supabase Auth session, so `auth.uid()` is NULL for
 *   every request the app makes and the ICP principal must never be treated as
 *   a Supabase `auth.users.id`. All per-user data written from the browser is
 *   therefore stored in the canisters, which authenticate that same principal.
 *   Supabase tables are written by backend services holding the service-role
 *   key. See services/profileService.ts for the full rationale.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { Identity } from '@dfinity/agent';
import { getAuthClient, login as doLogin, logout as doLogout } from '../services/auth';
import type { User } from '../models/User';
import { ensureUser } from '../services/roleService';

// ─── Context value shape ────────────────────────────────────────────────────

export interface AuthContextValue {
  /** Whether the current session is authenticated. */
  isAuthenticated: boolean;
  /** Internet Identity principal text, or null when anonymous. */
  principal: string | null;
  /** Resolved user object (principal + role), or null when anonymous. */
  user: User | null;
  /**
   * The Internet Identity delegation identity, or null when anonymous.
   * Exposed so that canister actors can be bound to the identity in the same
   * render in which `isAuthenticated` becomes true (no async re-binding race).
   */
  identity: Identity | null;
  /** True while the auth state is being resolved (e.g. on first load). */
  loading: boolean;
  /**
   * Real error raised while resolving the session against the backend
   * canister, or null. Surfaced so a backend failure is visible instead of
   * looking like "the sign-in simply did not work".
   */
  error: string | null;
  /** Opens the Internet Identity login popup. */
  login: () => Promise<void>;
  /** Clears the current session. */
  logout: () => Promise<void>;
}

// ─── Context creation ───────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Provides authentication state to all descendant components.
 * Must be rendered above <BrowserRouter> so that protected routes
 * can access the context before any navigation occurs.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [principal, setPrincipal]             = useState<string | null>(null);
  const [user, setUser]                       = useState<User | null>(null);
  const [identity, setIdentity]               = useState<Identity | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);

  /**
   * Reads the current auth state from the AuthClient singleton and
   * updates all state slices atomically.
   */
  const refresh = useCallback(async () => {
    const client = await getAuthClient();
    const authed = await client.isAuthenticated();
    if (authed) {
      const id = client.getIdentity();
      const p = id.getPrincipal().toText();
      try {
        const managed = await ensureUser();
        setIdentity(id);
        setPrincipal(p);
        setUser({ principal: p, role: managed.role });
        setIsAuthenticated(true);
        setError(null);
      } catch (err) {
        // The delegation is valid but the backend canister did not answer (for
        // example while it is being upgraded). Dropping the session here made
        // the whole application look broken — the user could not even reach the
        // pages that do not need the canister. The session is therefore kept
        // with the least-privileged role, and the real failure is surfaced so
        // it is visible instead of silent. This grants nothing: every
        // privileged operation is authorised by the canister from `msg.caller`,
        // never from this value.
        const message = err instanceof Error ? err.message : String(err);
        console.error('[AuthContext] Failed to resolve backend role:', err);
        setIdentity(id);
        setPrincipal(p);
        setUser({ principal: p, role: 'member' });
        setIsAuthenticated(true);
        setError(`Backend canister did not answer: ${message}`);
      }
    } else {
      setIdentity(null);
      setPrincipal(null);
      setUser(null);
      setIsAuthenticated(false);
      setError(null);
    }
    setLoading(false);
  }, []);

  // Restore session on mount (AuthClient reads from IndexedDB).
  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await doLogin();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    setLoading(true);
    await doLogout();
    setError(null);
    setIsAuthenticated(false);
    setIdentity(null);
    setPrincipal(null);
    setUser(null);
    setLoading(false);
  }, []);

  const value: AuthContextValue = {
    isAuthenticated,
    principal,
    user,
    identity,
    loading,
    error,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Consumer hook ──────────────────────────────────────────────────────────

/**
 * Returns the AuthContextValue.
 * Throws if called outside of an <AuthProvider>.
 */
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthContext must be used inside <AuthProvider>');
  }
  return ctx;
}
