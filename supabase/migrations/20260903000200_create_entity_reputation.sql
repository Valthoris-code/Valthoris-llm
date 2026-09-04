-- Valthoris Command Center — `public.entity_reputation` (+ history)
--
-- The table behind the "Reputação de Entidades" section: one score per entity
-- (phone, e-mail, domain, IP, crypto address, IBAN, …) and an append-only
-- history of every change to that score, so a number can always be explained.
--
-- The score is Valthoris' own: it is computed from this project's data only.
-- Nothing is imported from an external reputation provider.
--
-- Nothing existing is modified or dropped; the migration is idempotent.

CREATE TABLE IF NOT EXISTS public.entity_reputation (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  entity_type             TEXT        NOT NULL,
  entity_value            TEXT        NOT NULL,
  entity_value_normalized TEXT        NOT NULL,

  -- 0 = certainly hostile, 100 = nothing known against it.
  score                   INTEGER     NOT NULL DEFAULT 50,
  level                   TEXT        NOT NULL DEFAULT 'UNKNOWN',
  -- What the score was built from, as counted inside Valthoris.
  signals                 JSONB       NOT NULL DEFAULT '{}'::jsonb,
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT entity_reputation_type_valid CHECK (entity_type IN (
    'PHONE', 'EMAIL', 'URL', 'DOMAIN', 'IP', 'CRYPTO', 'IBAN', 'OTHER'
  )),
  CONSTRAINT entity_reputation_score_valid CHECK (score BETWEEN 0 AND 100),
  CONSTRAINT entity_reputation_level_valid CHECK (level IN (
    'UNKNOWN', 'TRUSTED', 'NEUTRAL', 'SUSPICIOUS', 'DANGEROUS'
  )),
  CONSTRAINT entity_reputation_value_length CHECK (
    length(entity_value) BETWEEN 1 AND 512
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_reputation_unique_idx
  ON public.entity_reputation (entity_type, entity_value_normalized);
CREATE INDEX IF NOT EXISTS entity_reputation_score_idx
  ON public.entity_reputation (score ASC, updated_at DESC);
CREATE INDEX IF NOT EXISTS entity_reputation_type_idx
  ON public.entity_reputation (entity_type, updated_at DESC);

-- Append-only history. No UPDATE or DELETE policy exists, exactly like the
-- governance audit trail, so a score change can never be rewritten.
CREATE TABLE IF NOT EXISTS public.entity_reputation_history (
  id                 BIGSERIAL   PRIMARY KEY,
  reputation_id      UUID        NOT NULL
                                 REFERENCES public.entity_reputation(id) ON DELETE CASCADE,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_score     INTEGER,
  new_score          INTEGER     NOT NULL,
  previous_level     TEXT,
  new_level          TEXT        NOT NULL,
  reason             TEXT,
  actor_admin_email  TEXT,
  signals            JSONB       NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT entity_reputation_history_score_valid CHECK (
    new_score BETWEEN 0 AND 100
    AND (previous_score IS NULL OR previous_score BETWEEN 0 AND 100)
  )
);

CREATE INDEX IF NOT EXISTS entity_reputation_history_entity_idx
  ON public.entity_reputation_history (reputation_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.entity_reputation_normalize()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.entity_value            := btrim(NEW.entity_value);
  NEW.entity_value_normalized := lower(btrim(NEW.entity_value));
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS entity_reputation_normalize_trg ON public.entity_reputation;
CREATE TRIGGER entity_reputation_normalize_trg
  BEFORE INSERT OR UPDATE ON public.entity_reputation
  FOR EACH ROW EXECUTE FUNCTION public.entity_reputation_normalize();

ALTER TABLE public.entity_reputation         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_reputation_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_reputation_service_role_all" ON public.entity_reputation;
CREATE POLICY "entity_reputation_service_role_all"
  ON public.entity_reputation
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "entity_reputation_history_service_role_all"
  ON public.entity_reputation_history;
CREATE POLICY "entity_reputation_history_service_role_all"
  ON public.entity_reputation_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
DECLARE
  t TEXT;
BEGIN
  IF to_regprocedure('governance.is_admin()') IS NULL
     OR to_regprocedure('governance.has_permission(text)') IS NULL THEN
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['entity_reputation', 'entity_reputation_history'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      || 'USING (governance.is_admin() AND governance.has_permission(''reputation.read''))',
      t || '_admin_read', t);
  END LOOP;
END $$;

REVOKE ALL ON public.entity_reputation         FROM anon, authenticated;
REVOKE ALL ON public.entity_reputation_history FROM anon, authenticated;
GRANT SELECT ON public.entity_reputation         TO authenticated;
GRANT SELECT ON public.entity_reputation_history TO authenticated;
GRANT ALL    ON public.entity_reputation         TO service_role;
GRANT ALL    ON public.entity_reputation_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.entity_reputation_history_id_seq TO service_role;

COMMENT ON TABLE public.entity_reputation IS
  'Valthoris reputation score per entity, computed from this project''s own data.';
COMMENT ON TABLE public.entity_reputation_history IS
  'Append-only history of every reputation score change.';
