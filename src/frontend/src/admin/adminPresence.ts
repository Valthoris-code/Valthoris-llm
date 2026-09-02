/**
 * Is the person using this browser a *verified* administrator right now?
 *
 * The answer is only ever used to decide whether the "Administração" entry
 * appears in the ordinary application's navigation. It is never an access
 * decision: `/admin` re-checks everything through `admin-api`, which in turn
 * re-checks against `governance.admins` and the RLS policies.
 *
 * It is deliberately *not* derived from the Internet Identity principal, from
 * an e-mail, or from anything the browser can decide by itself: those are the
 * checks that end up hardcoded in a bundle everybody can read. The entry only
 * appears once a real Supabase administrative session exists and the backend
 * has confirmed it — exactly the session `admin-icp-bridge` issues.
 */

import { useEffect, useState } from 'react';
import { fetchAdminSession } from './adminApi';
import { getAdminSupabase, isAdminBackendConfigured } from './adminClient';

export function useIsVerifiedAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isAdminBackendConfigured) return;
    let cancelled = false;

    const check = async () => {
      try {
        const supabase = getAdminSupabase();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          if (!cancelled) setIsAdmin(false);
          return;
        }
        await fetchAdminSession();
        if (!cancelled) setIsAdmin(true);
      } catch {
        // Not an administrator, not at AAL2 yet, or the backend is unreachable.
        // In every case the entry stays hidden and nothing is explained.
        if (!cancelled) setIsAdmin(false);
      }
    };

    void check();
    const { data: subscription } = getAdminSupabase().auth.onAuthStateChange(() => {
      void check();
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return isAdmin;
}
