-- Tighten profiles RLS: replace the overly-broad FOR ALL policy with
-- explicit INSERT and UPDATE policies.
--
-- The original "profiles_upsert_own" policy used FOR ALL, which unintentionally
-- grants DELETE access to authenticated users on their own profile row.
-- Profile deletion by end-users is not intended; profiles should persist for
-- audit and referential integrity purposes.
--
-- This migration is idempotent:
--   • Drops the old FOR ALL policy if it exists.
--   • Creates the two replacement policies only if they do not already exist.
--   • Does NOT touch data.

-- Drop the overly-broad policy if it still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname  = 'profiles'
      AND p.polname  = 'profiles_upsert_own'
  ) THEN
    EXECUTE $policy$ DROP POLICY "profiles_upsert_own" ON public.profiles $policy$;
  END IF;
END $$;

-- INSERT: authenticated users may create their own profile row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname  = 'profiles'
      AND p.polname  = 'profiles_insert_own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_insert_own"
        ON public.profiles
        FOR INSERT
        TO authenticated
        WITH CHECK (principal = current_setting('request.jwt.claims', true)::json->>'sub')
    $policy$;
  END IF;
END $$;

-- UPDATE: authenticated users may update their own profile row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname  = 'profiles'
      AND p.polname  = 'profiles_update_own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "profiles_update_own"
        ON public.profiles
        FOR UPDATE
        TO authenticated
        USING      (principal = current_setting('request.jwt.claims', true)::json->>'sub')
        WITH CHECK (principal = current_setting('request.jwt.claims', true)::json->>'sub')
    $policy$;
  END IF;
END $$;
