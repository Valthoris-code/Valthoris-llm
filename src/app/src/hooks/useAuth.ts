import { useState, useEffect, useCallback } from 'react';
import { getAuthClient, login as doLogin, logout as doLogout } from '../services/auth';

export interface AuthState {
  isAuthenticated: boolean;
  principal: string | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [principal, setPrincipal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const client = await getAuthClient();
    const authed = await client.isAuthenticated();
    setIsAuthenticated(authed);
    if (authed) {
      setPrincipal(client.getIdentity().getPrincipal().toText());
    } else {
      setPrincipal(null);
    }
    setLoading(false);
  }, []);

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
    setLoading(false);
  }, []);

  return { isAuthenticated, principal, loading, login, logout };
}
