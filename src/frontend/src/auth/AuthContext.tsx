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
 * Architecture note for future Supabase integration:
 *   After the Internet Identity login resolves, insert a call to a
 *   `profileService.syncWithSupabase(principal)` here (inside refresh())
 *   before setting `loading = false`. The service will upsert the profile
 *   to Supabase and return the merged Profile object.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
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
  /** True while the auth state is being resolved (e.g. on first load). */
  loading: boolean;
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
  const [loading, setLoading]                 = useState(true);

  /**
   * Reads the current auth state from the AuthClient singleton and
   * updates all state slices atomically.
   *
   * Supabase sync hook: after resolving `authed === true`, call
   * `profileService.syncWithSupabase(p)` and merge the returned Profile.
   */
  const refresh = useCallback(async () => {
    const client = await getAuthClient();
    const authed = await client.isAuthenticated();
    if (authed) {
      const p = client.getIdentity().getPrincipal().toText();
      try {
        const managed = await ensureUser();
        setPrincipal(p);
        setUser({ principal: p, role: managed.role });
        setIsAuthenticated(true);
      } catch (err) {
        console.error('[AuthContext] Failed to resolve backend role:', err);
        setPrincipal(null);
        setUser(null);
        setIsAuthenticated(false);
      }
    } else {
      setPrincipal(null);
      setUser(null);
      setIsAuthenticated(false);
    }
    setLoading(false);
  }, []);

  // Restore session on mount (AuthClient reads from IndexedDB).
  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async () => {
    setLoading(true);
    await doLogin();
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    setLoading(true);
    await doLogout();
    setIsAuthenticated(false);
    setPrincipal(null);
    setUser(null);
    setLoading(false);
  }, []);

  const value: AuthContextValue = {
    isAuthenticated,
    principal,
    user,
    loading,
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
