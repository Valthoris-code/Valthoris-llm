-- Valthoris Command Center — `public.fraud_reports`
--
-- The table behind the "Denúncias" and "Mapa de Denúncias" sections of the
-- Command Center. It holds the reports submitted through Valthoris itself and
-- nothing else: no external feed, no other project, no seeded example row. A
-- section with no rows shows an empty state, never an invented number.
--
-- Conventions followed here are the ones the existing `public` tables already
-- use (see 20260801000000_create_fraud_pipeline_tables.sql):
--   * RLS is enabled and `service_role` gets a single ALL policy;
--   * an authenticated user may read the rows they submitted themselves;
--   * an administrator resolved by `governance.is_admin()` may read everything
--     for which they hold `reports.read`.
--
-- Geolocation is optional by design: a report only carries coordinates when the
-- submitter provided them, and the map shows exactly those rows.
--
-- Nothing existing is modified or dropped; the migration is idempotent.

CREATE TABLE IF NOT EXISTS public.fraud_reports (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The Supabase Auth account that submitted it, when there was one. A report
  -- filed from the administration on someone's behalf legitimately has none.
  reporter_user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  category                TEXT        NOT NULL,
  target_type             TEXT        NOT NULL,
  target_value            TEXT        NOT NULL,
  -- Lower-cased, trimmed form used for grouping and for the threat-intelligence
  -- aggregation. Maintained by a trigger so it can never drift from the value.
  target_value_normalized TEXT        NOT NULL,

  description             TEXT,
  status                  TEXT        NOT NULL DEFAULT 'NEW',
  severity                TEXT        NOT NULL DEFAULT 'UNKNOWN',
  -- Where the row came from ('admin-center', 'app', …). Never a third party.
  source                  TEXT        NOT NULL DEFAULT 'admin-center',

  country                 TEXT,
  city                    TEXT,
  latitude                DOUBLE PRECISION,
  longitude               DOUBLE PRECISION,

  evidence                JSONB       NOT NULL DEFAULT '{}'::jsonb,
  metadata                JSONB       NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT fraud_reports_category_valid CHECK (category IN (
    'PHISHING', 'SMISHING', 'PHONE_SCAM', 'MALWARE', 'BANK_FRAUD',
    'CRYPTO_FRAUD', 'ROMANCE_SCAM', 'FRAUDULENT_URL', 'MALICIOUS_IP',
    'SUSPICIOUS_DOMAIN', 'SUSPICIOUS_IBAN', 'IMPERSONATION', 'OTHER'
  )),
  CONSTRAINT fraud_reports_target_type_valid CHECK (target_type IN (
    'PHONE', 'EMAIL', 'URL', 'DOMAIN', 'IP', 'CRYPTO', 'IBAN', 'OTHER'
  )),
  CONSTRAINT fraud_reports_status_valid CHECK (status IN (
    'NEW', 'TRIAGE', 'CONFIRMED', 'REJECTED'
  )),
  CONSTRAINT fraud_reports_severity_valid CHECK (severity IN (
    'UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  )),
  CONSTRAINT fraud_reports_target_value_length CHECK (
    length(target_value) BETWEEN 1 AND 512
  ),
  CONSTRAINT fraud_reports_description_length CHECK (
    description IS NULL OR length(description) <= 4000
  ),
  -- Coordinates are either both present and inside the real range, or absent.
  CONSTRAINT fraud_reports_coordinates_valid CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (
      latitude  BETWEEN -90  AND 90
      AND longitude BETWEEN -180 AND 180
    )
  )
);

CREATE INDEX IF NOT EXISTS fraud_reports_created_at_idx
  ON public.fraud_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS fraud_reports_category_idx
  ON public.fraud_reports (category, created_at DESC);
CREATE INDEX IF NOT EXISTS fraud_reports_status_idx
  ON public.fraud_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS fraud_reports_target_idx
  ON public.fraud_reports (target_type, target_value_normalized);
CREATE INDEX IF NOT EXISTS fraud_reports_reporter_idx
  ON public.fraud_reports (reporter_user_id, created_at DESC);
-- The map only ever reads located rows, so it only ever needs this partial index.
CREATE INDEX IF NOT EXISTS fraud_reports_located_idx
  ON public.fraud_reports (created_at DESC)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Normalisation and `updated_at` are enforced in the database, so they hold for
-- every writer including the service role used by the Edge Function.
CREATE OR REPLACE FUNCTION public.fraud_reports_normalize()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.target_value            := btrim(NEW.target_value);
  NEW.target_value_normalized := lower(btrim(NEW.target_value));
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fraud_reports_normalize_trg ON public.fraud_reports;
CREATE TRIGGER fraud_reports_normalize_trg
  BEFORE INSERT OR UPDATE ON public.fraud_reports
  FOR EACH ROW EXECUTE FUNCTION public.fraud_reports_normalize();

ALTER TABLE public.fraud_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fraud_reports_service_role_all" ON public.fraud_reports;
CREATE POLICY "fraud_reports_service_role_all"
  ON public.fraud_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "fraud_reports_select_own" ON public.fraud_reports;
CREATE POLICY "fraud_reports_select_own"
  ON public.fraud_reports
  FOR SELECT
  TO authenticated
  USING (reporter_user_id = auth.uid());

-- Administrators read the whole table, but only with the matching permission.
-- The helper is created by 20260901000000; on a database where the governance
-- schema is not there yet the policy is simply skipped and added on replay.
DO $$
BEGIN
  IF to_regprocedure('governance.is_admin()') IS NOT NULL
     AND to_regprocedure('governance.has_permission(text)') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "fraud_reports_admin_read" ON public.fraud_reports';
    EXECUTE $policy$
      CREATE POLICY "fraud_reports_admin_read"
        ON public.fraud_reports
        FOR SELECT
        TO authenticated
        USING (governance.is_admin() AND governance.has_permission('reports.read'))
    $policy$;
  END IF;
END $$;

REVOKE ALL ON public.fraud_reports FROM anon;
GRANT SELECT ON public.fraud_reports TO authenticated;
GRANT ALL    ON public.fraud_reports TO service_role;

COMMENT ON TABLE public.fraud_reports IS
  'Fraud reports submitted inside Valthoris. Read by the Command Center sections '
  '"Denúncias" and "Mapa de Denúncias". No external or third-party data.';
