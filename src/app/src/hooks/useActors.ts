import { useState, useEffect } from 'react';
import { createActors, getAnonActors } from '../services/actors';
import type { Actors } from '../services/actors';
import { getIdentity } from '../services/auth';
import { useAuth } from './useAuth';

/**
 * Returns typed actor instances bound to the current user identity.
 * Falls back to anonymous actors for unauthenticated reads.
 */
export function useActors(): Actors {
  const { isAuthenticated } = useAuth();
  const [actors, setActors] = useState<Actors>(() => getAnonActors());

  useEffect(() => {
    if (!isAuthenticated) {
      setActors(getAnonActors());
      return;
    }
    // AuthClient is already initialised when isAuthenticated becomes true.
    getIdentity().then(identity => {
      setActors(createActors(identity));
    }).catch(() => {
      setActors(getAnonActors());
    });
  }, [isAuthenticated]);

  return actors;
}
