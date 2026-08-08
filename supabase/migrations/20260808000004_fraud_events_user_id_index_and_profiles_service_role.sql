-- Non-destructive index and RLS fixes
--
-- 1. Add an index on fraud_events.user_id to support the existing RLS policy
--    "fraud_events_select_own" which filters by user_id = auth.uid()::text.
--    Without this index every authenticated SELECT on fraud_workflow_runs and
--    fraud_decisions (whose "select_own" policies do an EXISTS subquery on
--    fraud_events.user_id) requires a full sequential scan.
--
-- 2. Add a service_role policy to the profiles table so that backend services
--    running with the Supabase service-role key can manage profiles on behalf
--    of ICP-authenticated users.  The existing "authenticated" policies that
--    enforce per-principal access are preserved unchanged; this change only
--    adds backend write capability and does NOT introduce anonymous write access.

-- ─── 1. fraud_events — index on user_id ─────────────────────────────────────

CREATE INDEX IF NOT EXISTS fraud_events_user_id_idx
  ON public.fraud_events (user_id);

-- ─── 2. profiles — service_role policy ───────────────────────────────────────
--
-- Guard the policy creation so that re-running this migration on a database
-- that already has the policy does not raise an error.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname  = 'profiles'
      AND p.polname  = 'profiles_service_role_all'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_service_role_all"
        ON public.profiles
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)
    $policy$;
  END IF;
END $$;
