import { useState, useEffect } from 'react';
import { createActors, getAnonActors } from '../services/actors';
import type { Actors } from '../services/actors';
import { getIdentity } from '../services/auth';
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
 */
export function useActors(): Actors {
  const { isAuthenticated } = useAuth();
  const [actors, setActors] = useState<Actors>(() => safeGetAnonActors());

  useEffect(() => {
    if (!isAuthenticated) {
      setActors(safeGetAnonActors());
      return;
    }
    // AuthClient is already initialised when isAuthenticated becomes true.
    getIdentity().then(identity => {
      setActors(createActors(identity));
    }).catch(() => {
      setActors(safeGetAnonActors());
    });
  }, [isAuthenticated]);

  return actors;
}
