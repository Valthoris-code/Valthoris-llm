-- ═════════════════════════════════════════════════════════════════════════════
-- Valthoris — Administration & Governance Center: automatic Auth binding
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 20260901000000 created the governance schema and left two things that had to
-- be done by hand afterwards. Both are removed here, because a security
-- boundary that depends on somebody remembering to click in a dashboard is not
-- a security boundary.
--
--   1. The Auth Hook could not actually run. `custom_access_token_admin_hook`
--      is executed by the `supabase_auth_admin` role, which was granted EXECUTE
--      on the function but never USAGE on the schema that contains it, so every
--      token mint would have failed with "permission denied for schema
--      governance" — and, because the hook runs inside the login path, that
--      breaks sign-in for *every* user of the project, not only administrators.
--
--   2. `governance.admins.user_id` was only filled in on the administrator's
--      first successful sign-in through `public.governance_bind_admin_user`.
--      Until then the row was matched by email alone. The trigger below binds
--      the account the moment it exists in `auth.users`, so the ROOT rows are
--      correct before anybody signs in.
--
-- Everything is idempotent: the file can be replayed on a database that
-- already has it.

-- ─── 1. Let the Auth server reach the hook ───────────────────────────────────

GRANT USAGE ON SCHEMA governance TO supabase_auth_admin;

-- The hook reads `governance.admins`; it is SECURITY DEFINER, so the table
-- grant is not required, but being explicit keeps the intent readable and
-- survives a future change of the function's volatility/ownership.
GRANT SELECT ON governance.admins TO supabase_auth_admin;

-- ─── 2. Bind auth.users → governance.admins automatically ────────────────────
--
-- Matching is by lowercased email, which is exactly how the ROOT rows are
-- seeded. This never *creates* an administrator: an account whose email is not
-- already in `governance.admins` is ignored, so signing up with any address is
-- not a way into the administration.

CREATE OR REPLACE FUNCTION governance.bind_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Release the identifier from any other administrator row first: an email
  -- may only ever be bound to one account, and an account to one row.
  UPDATE governance.admins
     SET user_id = NULL
   WHERE user_id = NEW.id
     AND email IS DISTINCT FROM lower(NEW.email);

  UPDATE governance.admins
     SET user_id = NEW.id
   WHERE email = lower(NEW.email)
     AND user_id IS DISTINCT FROM NEW.id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION governance.bind_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bind_governance_admin ON auth.users;
CREATE TRIGGER bind_governance_admin
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION governance.bind_auth_user();

-- ─── 3. Backfill accounts that already exist ─────────────────────────────────
--
-- Covers the case where the ROOT accounts were created before this migration
-- ran, in either order.

UPDATE governance.admins a
   SET user_id = u.id
  FROM auth.users u
 WHERE lower(u.email) = a.email
   AND a.user_id IS DISTINCT FROM u.id;
