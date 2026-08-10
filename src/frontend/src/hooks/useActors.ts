import { useMemo } from 'react';
import { createActors, getAnonActors } from '../services/actors';
import type { Actors } from '../services/actors';
import { useAuth } from './useAuth';

function safeGetAnonActors(): Actors {
  try {
    return getAnonActors();
  } catch (e) {
    console.error('[VALTHORIS] Failed to create anon actors:', e);
    // Return a lazy proxy — calls will fail gracefully with a rejected promise
    return new Proxy({} as Actors, {
      get: () => () => Promise.reject(new Error('Actor initialization failed')),
    });
  }
}

/**
 * Returns typed actor instances bound to the current user identity.
 * Falls back to anonymous actors for unauthenticated reads.
 *
 * The identity is resolved by AuthContext before `isAuthenticated` flips to
 * true, so the identity-bound actors are available in the very same render.
 * Consumers must still gate their first canister call on `useActors.ready`
 * (or on `!loading` from useAuth) to avoid calling with the anonymous agent
 * while the session is being restored.
 */
export function useActors(): Actors {
  const { isAuthenticated, identity } = useAuth();

  return useMemo(() => {
    if (!isAuthenticated || !identity) return safeGetAnonActors();
    try {
      return createActors(identity);
    } catch (e) {
      console.error('[VALTHORIS] Failed to create identity actors:', e);
      return safeGetAnonActors();
    }
  }, [isAuthenticated, identity]);
}

/**
 * Same as `useActors`, plus a `ready` flag that is only true once the auth
 * state has been resolved (and, when authenticated, the identity is bound).
 */
export function useActorsReady(): { actors: Actors; ready: boolean } {
  const { loading, isAuthenticated, identity } = useAuth();
  const actors = useActors();
  return {
    actors,
    ready: !loading && (!isAuthenticated || identity !== null),
  };
}
