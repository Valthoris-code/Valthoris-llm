-- Valthoris Administration & Governance Center — PHASE 1 (Foundation)
--
-- Creates the `governance` schema that backs the private administration area
-- served at /admin. Nothing here touches the normal Valthoris application:
-- the public schema, the fraud pipeline, Safe Rooms, the news cache and the
-- ICP canisters are left exactly as they are.
--
-- Security model
-- --------------
--   * The administration is a Supabase Auth area (e-mail + password + TOTP
--     MFA). The normal application keeps authenticating with Internet
--     Identity and never opens a Supabase session, so an ordinary visitor has
--     no JWT at all and cannot reach anything below.
--   * Two ROOT administrators are fixed by this migration and cannot be
--     created, renamed, demoted, suspended or deleted through SQL issued by
--     the application (see the guard triggers at the end):
--         Hermínio Coragem — coragem77@gmail.com
--         Tiago Ferro      — tiagoferroregistos@gmail.com
--   * Authorization is *never* decided by the browser. Every table has RLS,
--     the helper functions below resolve the caller from the JWT only, and an
--     administrator is only recognised when the session reached AAL2 (MFA).
--   * `anon` gets no privilege whatsoever on this schema, so a leaked anon key
--     is worthless here.
--
-- Everything is idempotent: the migration checks for pre-existing objects
-- before creating them and can be replayed safely.

-- ─── 0. Reconcile a divergent `governance` schema ────────────────────────────
--
-- This project received, out of band, a *different* draft of the administration
-- schema: `governance.audit_logs` exists there with `admin_id/timestamp/entity`
-- instead of the `actor_admin_id/occurred_at/target_type` model below, and the
-- other tables differ in the same way. Because every statement here is written
-- with `IF NOT EXISTS`, those tables were kept as they were and the first index
-- on a column that only this design has (`occurred_at`) failed — which is why
-- this migration never reached the ledger, why the migrations that follow it
-- were never applied, and why `Provision Supabase` has been red on `main`.
--
-- The repository is the single source of truth for this schema, so the foreign
-- draft is set aside rather than patched column by column: it is renamed into
-- an archive schema (nothing is destroyed — the rows stay readable to the
-- database owner for forensics) and the administration is rebuilt below exactly
-- as described. This is safe: the administration has never been able to issue a
-- session on this project, so the draft holds no administrative history.
--
-- The block is inert on a database that already carries *this* design, and on
-- an empty one.
DO $$
DECLARE
  v_archive TEXT;
  v_fn      RECORD;
BEGIN
  IF to_regclass('governance.audit_logs') IS NULL
     OR EXISTS (
       SELECT 1 FROM pg_attribute
        WHERE attrelid = 'governance.audit_logs'::regclass
          AND attname  = 'occurred_at'
          AND NOT attisdropped
     )
  THEN
    RETURN;
  END IF;

  v_archive := 'governance_archived_' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS');
  RAISE NOTICE 'A divergent governance schema was found; archiving it as %.', v_archive;

  -- The wrappers in `public` were compiled against the draft and are recreated
  -- in full further down, so they are dropped whatever their signature is.
  FOR v_fn IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname LIKE 'governance\_%'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', v_fn.signature);
  END LOOP;

  -- Triggers the draft installed on `auth.users` keep running against the
  -- archived tables once the schema is renamed, which would silently maintain
  -- data nobody reads. They are removed; 20260901010000 installs this design's
  -- own binding trigger.
  FOR v_fn IN
    SELECT t.tgname
      FROM pg_trigger t
      JOIN pg_proc p       ON p.oid = t.tgfoid
      JOIN pg_namespace n  ON n.oid = p.pronamespace
     WHERE t.tgrelid = 'auth.users'::regclass
       AND NOT t.tgisinternal
       AND n.nspname = 'governance'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', v_fn.tgname);
  END LOOP;

  EXECUTE format('ALTER SCHEMA governance RENAME TO %I', v_archive);
  -- The archive is for the database owner alone: no API role may reach it.
  EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC, anon, authenticated, service_role', v_archive);
END $$;

CREATE SCHEMA IF NOT EXISTS governance;

-- `anon` must never see the administration. `authenticated` may only *use* the
-- schema; RLS decides what it can actually read.
REVOKE ALL ON SCHEMA governance FROM PUBLIC;
GRANT USAGE ON SCHEMA governance TO authenticated, service_role;

-- ─── Roles ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS governance.roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable machine key: ROOT, SECURITY_ADMIN, DATA_ADMIN, …
  key         TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  description TEXT,
  -- ROOT is implicit-all: it is never enumerated permission by permission.
  is_root     BOOLEAN     NOT NULL DEFAULT false,
  is_system   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Permissions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS governance.permissions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Namespaced verb: '<domain>.<action>', e.g. 'users.read'.
  key         TEXT        NOT NULL UNIQUE,
  domain      TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS governance.role_permissions (
  role_id       UUID NOT NULL REFERENCES governance.roles(id)       ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES governance.permissions(id) ON DELETE CASCADE,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS role_permissions_permission_idx
  ON governance.role_permissions (permission_id);

-- ─── Administrators ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS governance.admins (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Filled the first time the administrator signs in; the Supabase Auth user
  -- may legitimately be created after this row exists.
  user_id      UUID        UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email        TEXT        NOT NULL UNIQUE,
  display_name TEXT        NOT NULL,
  is_root      BOOLEAN     NOT NULL DEFAULT false,
  status       TEXT        NOT NULL DEFAULT 'ACTIVE',
  mfa_required BOOLEAN     NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admins_status_valid CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  CONSTRAINT admins_email_lowercase CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS admins_email_idx ON governance.admins (email);

CREATE TABLE IF NOT EXISTS governance.admin_roles (
  admin_id    UUID NOT NULL REFERENCES governance.admins(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES governance.roles(id)  ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES governance.admins(id) ON DELETE SET NULL,
  PRIMARY KEY (admin_id, role_id)
);

CREATE INDEX IF NOT EXISTS admin_roles_role_idx ON governance.admin_roles (role_id);

-- ─── Audit log ───────────────────────────────────────────────────────────────
--
-- WHO / WHEN / WHAT / WHY / PERMISSION / EVIDENCE / RESULT. Append-only: no
-- UPDATE or DELETE policy exists and those privileges are revoked, so not even
-- a ROOT session can rewrite history through the API.

CREATE TABLE IF NOT EXISTS governance.audit_logs (
  id             BIGSERIAL   PRIMARY KEY,
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_admin_id UUID        REFERENCES governance.admins(id) ON DELETE SET NULL,
  actor_email    TEXT,
  action         TEXT        NOT NULL,
  target_type    TEXT,
  target_id      TEXT,
  permission     TEXT,
  result         TEXT        NOT NULL DEFAULT 'SUCCESS',
  reason         TEXT,
  evidence       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  request_id     TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  metadata       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT audit_logs_result_valid CHECK (result IN ('SUCCESS', 'DENIED', 'FAILURE'))
);

CREATE INDEX IF NOT EXISTS audit_logs_occurred_at_idx ON governance.audit_logs (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx       ON governance.audit_logs (actor_admin_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx      ON governance.audit_logs (action, occurred_at DESC);

-- ─── Error log ───────────────────────────────────────────────────────────────
--
-- Technical detail never reaches the browser: the UI shows a generic message
-- and the real cause is stored here, readable only inside the administration.

CREATE TABLE IF NOT EXISTS governance.error_logs (
  id           BIGSERIAL   PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id   TEXT,
  source       TEXT        NOT NULL,
  severity     TEXT        NOT NULL DEFAULT 'ERROR',
  message      TEXT        NOT NULL,
  detail       TEXT,
  actor_email  TEXT,
  context      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT error_logs_severity_valid CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL'))
);

CREATE INDEX IF NOT EXISTS error_logs_occurred_at_idx ON governance.error_logs (occurred_at DESC);

-- ─── Seed: roles ─────────────────────────────────────────────────────────────

INSERT INTO governance.roles (key, name, description, is_root) VALUES
  ('ROOT',           'Root',           'Full, unrestricted administrative access.',                 true),
  ('SECURITY_ADMIN', 'Security Admin', 'Security, AutoShield, incidents and threat intelligence.',  false),
  ('DATA_ADMIN',     'Data Admin',     'Datasets, indicators, imports and data governance.',        false),
  ('SUPPORT_ADMIN',  'Support Admin',  'Users, support and accounts.',                              false),
  ('BILLING_ADMIN',  'Billing Admin',  'Plans, subscriptions, payments and invoices.',              false),
  ('AUDITOR',        'Auditor',        'Read-only access to audit, reports and compliance.',        false)
ON CONFLICT (key) DO NOTHING;

-- ─── Seed: permissions ───────────────────────────────────────────────────────

INSERT INTO governance.permissions (key, domain, description) VALUES
  ('admin.access',          'admin',      'Open the administration area.'),
  ('dashboard.read',        'dashboard',  'Read the administrative dashboard.'),
  ('admins.read',           'admins',     'List administrators.'),
  ('admins.write',          'admins',     'Create or modify non-root administrators.'),
  ('roles.read',            'roles',      'Read roles and permissions.'),
  ('roles.write',           'roles',      'Assign roles and permissions.'),
  ('audit.read',            'audit',      'Read the audit log.'),
  ('errors.read',           'errors',     'Read the technical error log.'),
  ('users.read',            'users',      'Read platform users.'),
  ('users.write',           'users',      'Modify platform users.'),
  ('plans.read',            'plans',      'Read plans and quotas.'),
  ('plans.write',           'plans',      'Change plans and quotas.'),
  ('billing.read',          'billing',    'Read subscriptions, payments and invoices.'),
  ('billing.write',         'billing',    'Operate billing.'),
  ('security.read',         'security',   'Read security posture and events.'),
  ('security.write',        'security',   'Operate security controls.'),
  ('threat_intel.read',     'threat',     'Read threat intelligence.'),
  ('threat_intel.write',    'threat',     'Curate threat intelligence.'),
  ('ingestion.read',        'ingestion',  'Read data ingestion jobs.'),
  ('ingestion.write',       'ingestion',  'Run data ingestion jobs.'),
  ('incidents.read',        'incidents',  'Read incidents.'),
  ('incidents.write',       'incidents',  'Operate incidents.'),
  ('reports.read',          'reports',    'Read reports and user submissions.'),
  ('reports.write',         'reports',    'Triage reports and user submissions.'),
  ('compliance.read',       'compliance', 'Read compliance records.'),
  ('compliance.write',      'compliance', 'Operate compliance records.'),
  ('support.read',          'support',    'Read support tickets.'),
  ('support.write',         'support',    'Operate support tickets.'),
  ('api_center.read',       'api',        'Read API integration status.'),
  ('system_health.read',    'system',     'Read system health.'),
  ('feature_flags.read',    'features',   'Read feature flags.'),
  ('feature_flags.write',   'features',   'Change feature flags.'),
  ('business.read',         'business',   'Read business metrics.')
ON CONFLICT (key) DO NOTHING;

-- ─── Seed: role → permission mapping ─────────────────────────────────────────
--
-- ROOT is deliberately absent: `governance.has_permission()` short-circuits for
-- root roles, so ROOT never depends on this table staying complete.

INSERT INTO governance.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM governance.roles r
JOIN governance.permissions p ON p.key = ANY (
  CASE r.key
    WHEN 'SECURITY_ADMIN' THEN ARRAY[
      'admin.access','dashboard.read','security.read','security.write',
      'incidents.read','incidents.write','threat_intel.read','threat_intel.write',
      'reports.read','reports.write','system_health.read','audit.read']
    WHEN 'DATA_ADMIN' THEN ARRAY[
      'admin.access','dashboard.read','ingestion.read','ingestion.write',
      'threat_intel.read','threat_intel.write','compliance.read','system_health.read']
    WHEN 'SUPPORT_ADMIN' THEN ARRAY[
      'admin.access','dashboard.read','users.read','users.write',
      'support.read','support.write','reports.read']
    WHEN 'BILLING_ADMIN' THEN ARRAY[
      'admin.access','dashboard.read','plans.read','plans.write',
      'billing.read','billing.write','users.read','business.read']
    WHEN 'AUDITOR' THEN ARRAY[
      'admin.access','dashboard.read','audit.read','errors.read',
      'reports.read','compliance.read','system_health.read','business.read']
    ELSE ARRAY[]::TEXT[]
  END
)
ON CONFLICT DO NOTHING;

-- ─── Seed: the two fixed ROOT administrators ─────────────────────────────────
--
-- The e-mail addresses are the specification. They are matched against the
-- verified e-mail of the Supabase Auth session, never against anything the
-- browser sends.

INSERT INTO governance.admins (email, display_name, is_root, status, mfa_required) VALUES
  ('coragem77@gmail.com',           'Hermínio Coragem', true, 'ACTIVE', true),
  ('tiagoferroregistos@gmail.com',  'Tiago Ferro',      true, 'ACTIVE', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO governance.admin_roles (admin_id, role_id)
SELECT a.id, r.id
FROM governance.admins a
CROSS JOIN governance.roles r
WHERE a.is_root AND r.key = 'ROOT'
ON CONFLICT DO NOTHING;

-- ─── Helper functions ────────────────────────────────────────────────────────
--
-- The two below only read the request's JWT claims, so they touch no table and
-- deliberately stay SECURITY INVOKER: they need no privilege of their own.
-- The ones that follow do read `governance` tables, and are STABLE SECURITY
-- DEFINER with a pinned search_path so they can be used inside RLS policies
-- without recursing into those same policies.

-- The assurance level of the current session ('aal1' before MFA, 'aal2' after).
CREATE OR REPLACE FUNCTION governance.current_aal()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal';
$$;

-- Verified e-mail of the current session, lower-cased. NULL when anonymous.
CREATE OR REPLACE FUNCTION governance.current_email()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT lower(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email');
$$;

-- The administrator row matching the current session, or NULL.
-- MFA is mandatory: a session that has not reached AAL2 is not an admin.
CREATE OR REPLACE FUNCTION governance.current_admin_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  SELECT a.id
  FROM governance.admins a
  WHERE a.status = 'ACTIVE'
    AND (
      (auth.uid() IS NOT NULL AND a.user_id = auth.uid())
      OR (governance.current_email() IS NOT NULL AND a.email = governance.current_email())
    )
    AND (a.mfa_required IS NOT TRUE OR governance.current_aal() = 'aal2')
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION governance.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  SELECT governance.current_admin_id() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION governance.is_root()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM governance.admins a
    WHERE a.id = governance.current_admin_id() AND a.is_root
  );
$$;

-- RBAC decision point. ROOT short-circuits to true; every other role is
-- resolved through role_permissions — permissions are never hardcoded in the
-- frontend.
CREATE OR REPLACE FUNCTION governance.has_permission(permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM governance.admin_roles ar
    JOIN governance.roles r ON r.id = ar.role_id
    LEFT JOIN governance.role_permissions rp ON rp.role_id = r.id
    LEFT JOIN governance.permissions p ON p.id = rp.permission_id
    WHERE ar.admin_id = governance.current_admin_id()
      AND (r.is_root OR p.key = permission_key)
  );
$$;

-- The permission keys of one administrator, used by the admin API to build the
-- session payload the UI renders its navigation from.
CREATE OR REPLACE FUNCTION governance.admin_permissions(target_admin_id UUID)
RETURNS TABLE (permission_key TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  SELECT DISTINCT p.key
  FROM governance.admin_roles ar
  JOIN governance.roles r ON r.id = ar.role_id
  JOIN governance.role_permissions rp ON rp.role_id = r.id
  JOIN governance.permissions p ON p.id = rp.permission_id
  WHERE ar.admin_id = target_admin_id
  UNION
  SELECT p.key
  FROM governance.permissions p
  WHERE EXISTS (
    SELECT 1 FROM governance.admin_roles ar
    JOIN governance.roles r ON r.id = ar.role_id
    WHERE ar.admin_id = target_admin_id AND r.is_root
  );
$$;

-- ─── Auth Hook: administrative JWT claims ────────────────────────────────────
--
-- Adds `is_admin` and `admin_id` to the access token so the API can take a
-- cheap first decision. It carries no secret and it is *not* the authorization:
-- every request is still re-checked against `governance.admins`.
--
-- Activation is a manual step in the Supabase Dashboard
-- (Authentication → Hooks → Customize Access Token). See docs/ADMIN_CENTER.md.

CREATE OR REPLACE FUNCTION governance.custom_access_token_admin_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
DECLARE
  claims     JSONB;
  admin_row  governance.admins%ROWTYPE;
  user_email TEXT;
BEGIN
  claims := COALESCE(event -> 'claims', '{}'::jsonb);

  SELECT lower(u.email) INTO user_email
  FROM auth.users u
  WHERE u.id = (event ->> 'user_id')::uuid;

  SELECT * INTO admin_row
  FROM governance.admins a
  WHERE a.status = 'ACTIVE'
    AND (a.user_id = (event ->> 'user_id')::uuid OR a.email = user_email)
  LIMIT 1;

  IF admin_row.id IS NOT NULL THEN
    claims := jsonb_set(claims, '{is_admin}', 'true'::jsonb, true);
    claims := jsonb_set(claims, '{admin_id}', to_jsonb(admin_row.id::text), true);
  ELSE
    claims := jsonb_set(claims, '{is_admin}', 'false'::jsonb, true);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims, true);
END;
$$;

GRANT EXECUTE ON FUNCTION governance.custom_access_token_admin_hook(JSONB) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION governance.custom_access_token_admin_hook(JSONB) FROM authenticated, anon, PUBLIC;

-- ─── Audit helper ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION governance.log_audit(
  p_action      TEXT,
  p_target_type TEXT    DEFAULT NULL,
  p_target_id   TEXT    DEFAULT NULL,
  p_permission  TEXT    DEFAULT NULL,
  p_result      TEXT    DEFAULT 'SUCCESS',
  p_reason      TEXT    DEFAULT NULL,
  p_evidence    JSONB   DEFAULT '{}'::jsonb,
  p_request_id  TEXT    DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
DECLARE
  new_id BIGINT;
BEGIN
  INSERT INTO governance.audit_logs (
    actor_admin_id, actor_email, action, target_type, target_id,
    permission, result, reason, evidence, request_id
  ) VALUES (
    governance.current_admin_id(), governance.current_email(), p_action,
    p_target_type, p_target_id, p_permission, p_result, p_reason,
    COALESCE(p_evidence, '{}'::jsonb), p_request_id
  )
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- ─── ROOT protection ─────────────────────────────────────────────────────────
--
-- The two ROOT accounts are permanent. No administrative mechanism may change
-- their e-mail, demote them, suspend them, delete them, or mint a third ROOT.
-- The guard lives in the database, so it also holds for the service role used
-- by the Edge Functions.

CREATE OR REPLACE FUNCTION governance.protect_root_admins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_root THEN
      RAISE EXCEPTION 'ROOT administrators are permanent and cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_root AND NOT EXISTS (
      -- Only the two seeded addresses may ever carry the ROOT flag.
      SELECT 1 WHERE lower(NEW.email) IN ('coragem77@gmail.com', 'tiagoferroregistos@gmail.com')
    ) THEN
      RAISE EXCEPTION 'A third ROOT administrator cannot be created';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.is_root THEN
    IF NEW.email <> OLD.email THEN
      RAISE EXCEPTION 'The e-mail of a ROOT administrator cannot be changed';
    END IF;
    IF NEW.is_root IS DISTINCT FROM OLD.is_root THEN
      RAISE EXCEPTION 'A ROOT administrator cannot be demoted';
    END IF;
    IF NEW.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'A ROOT administrator cannot be suspended';
    END IF;
    IF NEW.mfa_required IS NOT TRUE THEN
      RAISE EXCEPTION 'MFA is mandatory for ROOT administrators';
    END IF;
  ELSIF NEW.is_root THEN
    RAISE EXCEPTION 'ROOT cannot be granted to an existing administrator';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admins_protect_root ON governance.admins;
CREATE TRIGGER admins_protect_root
  BEFORE INSERT OR UPDATE OR DELETE ON governance.admins
  FOR EACH ROW EXECUTE FUNCTION governance.protect_root_admins();

-- The ROOT ↔ ROOT-role link is equally permanent.
CREATE OR REPLACE FUNCTION governance.protect_root_admin_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM governance.admins a
    JOIN governance.roles r ON r.id = OLD.role_id
    WHERE a.id = OLD.admin_id AND a.is_root AND r.is_root
  ) THEN
    RAISE EXCEPTION 'The ROOT role cannot be removed from a ROOT administrator';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS admin_roles_protect_root ON governance.admin_roles;
CREATE TRIGGER admin_roles_protect_root
  BEFORE DELETE ON governance.admin_roles
  FOR EACH ROW EXECUTE FUNCTION governance.protect_root_admin_roles();

-- ─── Row Level Security ──────────────────────────────────────────────────────
--
-- Read access requires an authenticated administrator with an AAL2 session.
-- Every write goes through the `admin-api` Edge Function with the service role,
-- which re-checks RBAC and writes the audit trail — the browser never writes
-- here directly.

ALTER TABLE governance.roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.admins           ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.admin_roles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.error_logs       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles', 'permissions', 'role_permissions', 'admins', 'admin_roles',
    'audit_logs', 'error_logs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON governance.%I', t || '_admin_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON governance.%I FOR SELECT TO authenticated USING (governance.is_admin())',
      t || '_admin_read', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON governance.%I', t || '_service_role_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON governance.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service_role_all', t);
  END LOOP;
END $$;

-- Reading the audit and error logs additionally requires the matching
-- permission, so a future SUPPORT_ADMIN cannot browse the audit trail.
DROP POLICY IF EXISTS audit_logs_admin_read ON governance.audit_logs;
CREATE POLICY audit_logs_admin_read
  ON governance.audit_logs FOR SELECT TO authenticated
  USING (governance.is_admin() AND governance.has_permission('audit.read'));

DROP POLICY IF EXISTS error_logs_admin_read ON governance.error_logs;
CREATE POLICY error_logs_admin_read
  ON governance.error_logs FOR SELECT TO authenticated
  USING (governance.is_admin() AND governance.has_permission('errors.read'));

-- Privileges: `authenticated` may only read (and RLS still applies); `anon`
-- gets nothing at all. The audit trail is append-only for everyone but the
-- service role.
REVOKE ALL ON ALL TABLES IN SCHEMA governance FROM anon, authenticated, PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA governance TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA governance TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA governance TO service_role;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA governance FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION governance.is_admin()               TO authenticated;
GRANT EXECUTE ON FUNCTION governance.is_root()                TO authenticated;
GRANT EXECUTE ON FUNCTION governance.has_permission(TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION governance.current_admin_id()       TO authenticated;
GRANT EXECUTE ON FUNCTION governance.current_email()          TO authenticated;
GRANT EXECUTE ON FUNCTION governance.current_aal()            TO authenticated;
GRANT EXECUTE ON FUNCTION governance.admin_permissions(UUID)  TO service_role;
GRANT EXECUTE ON FUNCTION governance.log_audit(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;

-- The administration schema is not exposed through PostgREST unless it is
-- listed in the project's "Exposed schemas" setting. It is intentionally left
-- unexposed: the browser reaches it exclusively through the `admin-api` Edge
-- Function. See docs/ADMIN_CENTER.md for the (optional) manual step.

-- ─── Service-role RPCs (the only door into `governance`) ─────────────────────
--
-- The `governance` schema is not exposed through PostgREST, so the `admin-api`
-- Edge Function reaches it through these SECURITY DEFINER wrappers in `public`.
-- They are executable by the service role only; `anon` and `authenticated` have
-- EXECUTE revoked, so possessing the anon key (or any user JWT) is useless.
--
-- They perform no authorization by themselves: the Edge Function authenticates
-- the caller against Supabase Auth, resolves the administrator identity and
-- checks RBAC before calling them. Keeping them dumb keeps the decision in one
-- auditable place.

CREATE OR REPLACE FUNCTION public.governance_resolve_admin(
  p_user_id UUID,
  p_email   TEXT
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  SELECT to_jsonb(x) FROM (
    SELECT
      a.id, a.user_id, a.email, a.display_name, a.is_root, a.status,
      a.mfa_required, a.last_seen_at,
      COALESCE((
        SELECT jsonb_agg(r.key ORDER BY r.key)
        FROM governance.admin_roles ar
        JOIN governance.roles r ON r.id = ar.role_id
        WHERE ar.admin_id = a.id
      ), '[]'::jsonb) AS roles,
      COALESCE((
        SELECT jsonb_agg(p.permission_key ORDER BY p.permission_key)
        FROM governance.admin_permissions(a.id) p
      ), '[]'::jsonb) AS permissions
    FROM governance.admins a
    WHERE a.status = 'ACTIVE'
      AND (
        (p_user_id IS NOT NULL AND a.user_id = p_user_id)
        OR (p_email IS NOT NULL AND a.email = lower(p_email))
      )
    LIMIT 1
  ) x;
$$;

-- Binds the Supabase Auth user to the seeded administrator row on first sign-in.
-- Never moves a row to a different user once it is bound.
CREATE OR REPLACE FUNCTION public.governance_bind_admin_user(
  p_admin_id UUID,
  p_user_id  UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  UPDATE governance.admins
  SET user_id = p_user_id, last_seen_at = now()
  WHERE id = p_admin_id AND (user_id IS NULL OR user_id = p_user_id);
$$;

CREATE OR REPLACE FUNCTION public.governance_list_admins()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.is_root DESC, x.display_name), '[]'::jsonb)
  FROM (
    SELECT
      a.id, a.email, a.display_name, a.is_root, a.status,
      a.mfa_required, a.last_seen_at, a.created_at,
      (a.user_id IS NOT NULL) AS account_linked,
      COALESCE((
        SELECT jsonb_agg(r.key ORDER BY r.key)
        FROM governance.admin_roles ar
        JOIN governance.roles r ON r.id = ar.role_id
        WHERE ar.admin_id = a.id
      ), '[]'::jsonb) AS roles
    FROM governance.admins a
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.governance_list_roles()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.is_root DESC, x.key), '[]'::jsonb)
  FROM (
    SELECT
      r.id, r.key, r.name, r.description, r.is_root,
      COALESCE((
        SELECT jsonb_agg(p.key ORDER BY p.key)
        FROM governance.role_permissions rp
        JOIN governance.permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = r.id
      ), '[]'::jsonb) AS permissions,
      (SELECT count(*) FROM governance.admin_roles ar WHERE ar.role_id = r.id) AS admin_count
    FROM governance.roles r
  ) x;
$$;

CREATE OR REPLACE FUNCTION public.governance_list_audit_logs(
  p_limit  INT  DEFAULT 50,
  p_offset INT  DEFAULT 0,
  p_search TEXT DEFAULT NULL,
  p_result TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  -- The page and its total are produced by a single traversal: `count(*) OVER ()`
  -- is evaluated before LIMIT, so it still counts the whole filtered set while
  -- letting the planner stop reading once the page is full. Materialising a
  -- `filtered` CTE instead would force the entire audit log into a tuplestore
  -- on every call, which gets steadily worse as the log grows.
  WITH page AS (
    SELECT l.id, l.occurred_at, l.actor_email, l.action, l.target_type,
           l.target_id, l.permission, l.result, l.reason, l.evidence,
           l.request_id,
           count(*) OVER () AS total_count
    FROM governance.audit_logs l
    WHERE (p_result IS NULL OR l.result = p_result)
      AND (
        p_search IS NULL OR p_search = ''
        OR l.action ILIKE '%' || p_search || '%'
        OR l.actor_email ILIKE '%' || p_search || '%'
        OR COALESCE(l.target_type, '') ILIKE '%' || p_search || '%'
        OR COALESCE(l.target_id, '') ILIKE '%' || p_search || '%'
      )
    ORDER BY l.occurred_at DESC
    LIMIT greatest(1, least(COALESCE(p_limit, 50), 200))
    OFFSET greatest(0, COALESCE(p_offset, 0))
  )
  SELECT jsonb_build_object(
    'total', COALESCE(
      (SELECT p.total_count FROM page p LIMIT 1),
      -- An offset past the end yields no row, and therefore no window value;
      -- only then is a separate count worth paying for.
      (SELECT count(*)
         FROM governance.audit_logs l
        WHERE (p_result IS NULL OR l.result = p_result)
          AND (
            p_search IS NULL OR p_search = ''
            OR l.action ILIKE '%' || p_search || '%'
            OR l.actor_email ILIKE '%' || p_search || '%'
            OR COALESCE(l.target_type, '') ILIKE '%' || p_search || '%'
            OR COALESCE(l.target_id, '') ILIKE '%' || p_search || '%'
          ))
    ),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) - 'total_count' ORDER BY p.occurred_at DESC)
      FROM page p
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.governance_write_audit(
  p_actor_admin_id UUID,
  p_actor_email    TEXT,
  p_action         TEXT,
  p_target_type    TEXT,
  p_target_id      TEXT,
  p_permission     TEXT,
  p_result         TEXT,
  p_reason         TEXT,
  p_evidence       JSONB,
  p_request_id     TEXT,
  p_ip_address     TEXT,
  p_user_agent     TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  INSERT INTO governance.audit_logs (
    actor_admin_id, actor_email, action, target_type, target_id, permission,
    result, reason, evidence, request_id, ip_address, user_agent
  ) VALUES (
    p_actor_admin_id, lower(p_actor_email), p_action, p_target_type, p_target_id,
    p_permission, COALESCE(p_result, 'SUCCESS'), p_reason,
    COALESCE(p_evidence, '{}'::jsonb), p_request_id, p_ip_address, p_user_agent
  );
$$;

CREATE OR REPLACE FUNCTION public.governance_write_error(
  p_request_id  TEXT,
  p_source      TEXT,
  p_severity    TEXT,
  p_message     TEXT,
  p_detail      TEXT,
  p_actor_email TEXT,
  p_context     JSONB
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
  INSERT INTO governance.error_logs (
    request_id, source, severity, message, detail, actor_email, context
  ) VALUES (
    p_request_id, p_source, COALESCE(p_severity, 'ERROR'), p_message, p_detail,
    lower(p_actor_email), COALESCE(p_context, '{}'::jsonb)
  );
$$;

-- Aggregated dashboard counters. Only counts are returned — no personal data.
-- Tables that do not exist yet in this project simply report NULL, which the UI
-- renders as "not available" instead of inventing a number.
CREATE OR REPLACE FUNCTION public.governance_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = governance, public, pg_temp
AS $$
DECLARE
  -- Deliberately not named `result`: `audit_logs.result` is a column and the
  -- reference inside the query below would be ambiguous.
  payload      JSONB;
  users_total  BIGINT;
  users_new    BIGINT;
BEGIN
  SELECT count(*) INTO users_total FROM auth.users;
  SELECT count(*) INTO users_new   FROM auth.users WHERE created_at > now() - INTERVAL '7 days';

  payload := jsonb_build_object(
    'generatedAt', now(),
    'users', jsonb_build_object('total', users_total, 'new7d', users_new),
    'administration', jsonb_build_object(
      'admins',      (SELECT count(*) FROM governance.admins),
      'root',        (SELECT count(*) FROM governance.admins WHERE is_root),
      'mfaRequired', (SELECT count(*) FROM governance.admins WHERE mfa_required),
      'roles',       (SELECT count(*) FROM governance.roles)
    ),
    'audit', jsonb_build_object(
      'total',   (SELECT count(*) FROM governance.audit_logs),
      'last24h', (SELECT count(*) FROM governance.audit_logs WHERE occurred_at > now() - INTERVAL '24 hours'),
      'denied7d',(SELECT count(*) FROM governance.audit_logs WHERE result = 'DENIED' AND occurred_at > now() - INTERVAL '7 days')
    ),
    'errors', jsonb_build_object(
      'total',   (SELECT count(*) FROM governance.error_logs),
      'last24h', (SELECT count(*) FROM governance.error_logs WHERE occurred_at > now() - INTERVAL '24 hours')
    )
  );

  RETURN payload;
END;
$$;

DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.governance_resolve_admin(UUID, TEXT)',
    'public.governance_bind_admin_user(UUID, UUID)',
    'public.governance_list_admins()',
    'public.governance_list_roles()',
    'public.governance_list_audit_logs(INT, INT, TEXT, TEXT)',
    'public.governance_write_audit(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT)',
    'public.governance_write_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB)',
    'public.governance_dashboard()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
