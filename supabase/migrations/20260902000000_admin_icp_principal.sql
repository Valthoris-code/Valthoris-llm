-- ═════════════════════════════════════════════════════════════════════════════
-- Valthoris — Administration: binding an Internet Identity principal to an
-- administrator, so that a real Supabase Auth session can be issued for it.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ───
-- Valthoris signs users in with Internet Identity, never with Supabase Auth.
-- `auth.users` is therefore empty for everybody, `auth.uid()` is NULL on every
-- request the browser makes, and every administrative check that depends on it
-- (`governance.require_admin_aal2()`, `governance.current_admin_id()`, the
-- access-token hook) can never recognise anyone. That is not an MFA problem:
-- there is simply no Supabase session at all.
--
-- The `admin-icp-bridge` Edge Function closes that gap. It verifies the
-- Internet Identity *delegation chain* cryptographically on the server, maps
-- the resulting principal to an administrator through the column added here,
-- and only then issues a real Supabase session. This migration provides the
-- storage and the single read the function is allowed to perform.
--
-- WHAT IT DOES NOT DO
-- ───────────────────
-- Holding a principal is never, by itself, authorisation: the principal string
-- is public (it is printed on screen in the application) and would be trivially
-- forged if it were trusted as sent. It only ever *selects* a row whose
-- delegation has already been proven valid by the function.
--
-- Idempotent: safe to replay on a database that already has it.

-- ─── 1. The column ───────────────────────────────────────────────────────────

ALTER TABLE governance.admins
  ADD COLUMN IF NOT EXISTS icp_principal TEXT;

-- One principal may only ever designate one administrator. A partial unique
-- index (instead of a UNIQUE constraint) keeps the many NULLs allowed.
CREATE UNIQUE INDEX IF NOT EXISTS admins_icp_principal_key
  ON governance.admins (icp_principal)
  WHERE icp_principal IS NOT NULL;

-- A principal is a textual Principal ("xxxxx-…-cai"): reject anything else, so
-- an empty string or a stray e-mail can never match a verified principal.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admins_icp_principal_format'
      AND conrelid = 'governance.admins'::regclass
  ) THEN
    ALTER TABLE governance.admins
      ADD CONSTRAINT admins_icp_principal_format
      CHECK (icp_principal IS NULL OR icp_principal ~ '^[a-z0-9]{5}(-[a-z0-9]{3,5}){4,11}$');
  END IF;
END $$;

-- ─── 2. The principal that is already known ──────────────────────────────────
--
-- Hermínio Coragem's Internet Identity principal, established from his own
-- signed-in session. The second ROOT is filled in the same way the first time
-- he signs in (see `public.governance_claim_admin_principal` below), which is
-- why nothing is hardcoded for him.
UPDATE governance.admins
   SET icp_principal = 'rvwuy-hzmu3-nmf3b-2sdig-lblcl-4ccmr-3uind-oe3tm-7ljre-o5xny-nae',
       updated_at    = now()
 WHERE email = 'coragem77@gmail.com'
   AND icp_principal IS DISTINCT FROM 'rvwuy-hzmu3-nmf3b-2sdig-lblcl-4ccmr-3uind-oe3tm-7ljre-o5xny-nae'
   AND NOT EXISTS (
     SELECT 1 FROM governance.admins other
      WHERE other.icp_principal = 'rvwuy-hzmu3-nmf3b-2sdig-lblcl-4ccmr-3uind-oe3tm-7ljre-o5xny-nae'
        AND other.email <> 'coragem77@gmail.com'
   );

-- ─── 3. Resolve an administrator from a *verified* principal ─────────────────
--
-- Called by `admin-icp-bridge` with the service role, and only after the
-- delegation chain that produced the principal has been verified against the
-- Internet Computer root key. Returns the e-mail needed to mint the Supabase
-- session, never anything else.
CREATE OR REPLACE FUNCTION public.governance_admin_by_principal(
  p_principal TEXT
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  SELECT to_jsonb(x) FROM (
    SELECT a.id, a.email, a.display_name, a.is_root, a.status, a.mfa_required
    FROM governance.admins a
    WHERE a.icp_principal IS NOT NULL
      AND p_principal IS NOT NULL
      AND a.icp_principal = p_principal
      AND a.status = 'ACTIVE'
    LIMIT 1
  ) x;
$$;

-- ─── 4. Claim a principal for an administrator ───────────────────────────────
--
-- The second ROOT account has no principal yet, and asking somebody to copy an
-- identifier out of a screen and into the database by hand is exactly the kind
-- of manual step this project removes. Instead, an administrator who has
-- already proven who they are *by another means* (a verified Supabase session
-- reaching `admin-api`) binds their own principal once, and only once:
--
--   * the row must not already have a principal — an existing binding is never
--     silently replaced, so a stolen session cannot take over an account;
--   * the principal must not belong to another administrator;
--   * the caller is the service role, from the Edge Function only.
--
-- Returns TRUE when the binding happened, FALSE when it was refused. Both
-- outcomes are audited by the caller.
CREATE OR REPLACE FUNCTION public.governance_claim_admin_principal(
  p_admin_id  UUID,
  p_principal TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF p_admin_id IS NULL OR p_principal IS NULL OR length(p_principal) = 0 THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM governance.admins
     WHERE icp_principal = p_principal AND id <> p_admin_id
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE governance.admins
     SET icp_principal = p_principal,
         updated_at    = now()
   WHERE id = p_admin_id
     AND status = 'ACTIVE'
     AND icp_principal IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- ─── 5. Grants ───────────────────────────────────────────────────────────────
--
-- Same rule as every other `public.governance_*` wrapper: reachable by the
-- service role alone, never by `anon` or `authenticated`.
DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.governance_admin_by_principal(TEXT)',
    'public.governance_claim_admin_principal(UUID, TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
