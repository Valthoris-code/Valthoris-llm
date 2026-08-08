-- Fraud pipeline base tables
--
-- Creates the core fraud-detection tables consumed by the Valthoris
-- fraud-worker and ICP-ingest services.  All tables use Row Level Security;
-- the service-role key (used by backend workers) bypasses RLS by default.
--
-- Table dependency order:
--   1. fraud_events          — source events to analyse
--   2. fraud_pipelines       — pipeline registry (reference data)
--   3. fraud_workflow_runs   — execution log per (event, pipeline, mode)
--   4. fraud_decisions       — AI verdict per (event, pipeline, mode)
--   5. fraud_decision_justifications — human-readable reasoning per decision
--
-- Unique constraints required by FraudDecisionWriter UPSERT operations are
-- added by migration 20260803000000_add_fraud_pipeline_constraints.sql.

-- ─── Helper: updated_at trigger function ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─── 1. fraud_events ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fraud_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ICP principal (text) or Supabase user UUID; NULL for anonymous/system events
  user_id     TEXT,
  -- 'sms' | 'url' | 'email' | 'file' | 'wallet_address' | 'icp_report' | 'unknown'
  event_type  TEXT        NOT NULL,
  -- Raw content / structured payload submitted for analysis
  payload     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fraud_events ENABLE ROW LEVEL SECURITY;

-- Service-role workers insert events on behalf of users
CREATE POLICY "fraud_events_service_role_all"
  ON public.fraud_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read events that belong to them
CREATE POLICY "fraud_events_select_own"
  ON public.fraud_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

-- ─── 2. fraud_pipelines ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fraud_pipelines (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fraud_pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fraud_pipelines_service_role_all"
  ON public.fraud_pipelines
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can browse active pipelines (read-only reference data)
CREATE POLICY "fraud_pipelines_select_active"
  ON public.fraud_pipelines
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Seed the default pipeline used by the worker
INSERT INTO public.fraud_pipelines (name, description, is_active)
VALUES ('default-pipeline-v1', 'Default Valthoris fraud detection pipeline', true)
ON CONFLICT (name) DO NOTHING;

-- ─── 3. fraud_workflow_runs ──────────────────────────────────────────────────
-- Unique constraint (event_id, pipeline_id, mode) added in 20260803000000.

CREATE TABLE IF NOT EXISTS public.fraud_workflow_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID        NOT NULL REFERENCES public.fraud_events(id) ON DELETE CASCADE,
  pipeline_id   UUID        NOT NULL REFERENCES public.fraud_pipelines(id) ON DELETE CASCADE,
  -- 'auto' | 'manual'
  mode          TEXT        NOT NULL CHECK (mode IN ('auto', 'manual')),
  -- 'pending' | 'running' | 'completed' | 'failed'
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fraud_workflow_runs_event_id_idx
  ON public.fraud_workflow_runs (event_id);

CREATE OR REPLACE TRIGGER fraud_workflow_runs_updated_at
  BEFORE UPDATE ON public.fraud_workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fraud_workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fraud_workflow_runs_service_role_all"
  ON public.fraud_workflow_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "fraud_workflow_runs_select_own"
  ON public.fraud_workflow_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fraud_events e
      WHERE e.id = event_id
        AND e.user_id = auth.uid()::text
    )
  );

-- ─── 4. fraud_decisions ──────────────────────────────────────────────────────
-- Unique constraint (event_id, pipeline_id, mode) added in 20260803000000.

CREATE TABLE IF NOT EXISTS public.fraud_decisions (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID    NOT NULL REFERENCES public.fraud_events(id) ON DELETE CASCADE,
  pipeline_id         UUID    NOT NULL REFERENCES public.fraud_pipelines(id) ON DELETE CASCADE,
  -- 'auto' | 'manual'
  mode                TEXT    NOT NULL CHECK (mode IN ('auto', 'manual')),
  -- 'fraud' | 'suspicious' | 'legitimate' | 'unknown'
  verdict             TEXT    NOT NULL
                              CHECK (verdict IN ('fraud', 'suspicious', 'legitimate', 'unknown')),
  -- 0–100
  confidence_score    INT     NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  ai_provider         TEXT,
  ai_response_summary TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fraud_decisions_event_id_idx
  ON public.fraud_decisions (event_id);

CREATE OR REPLACE TRIGGER fraud_decisions_updated_at
  BEFORE UPDATE ON public.fraud_decisions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fraud_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fraud_decisions_service_role_all"
  ON public.fraud_decisions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "fraud_decisions_select_own"
  ON public.fraud_decisions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.fraud_events e
      WHERE e.id = event_id
        AND e.user_id = auth.uid()::text
    )
  );

-- ─── 5. fraud_decision_justifications ────────────────────────────────────────
-- Unique constraint (decision_id) added in 20260803000000.

CREATE TABLE IF NOT EXISTS public.fraud_decision_justifications (
  id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id        UUID    NOT NULL REFERENCES public.fraud_decisions(id) ON DELETE CASCADE,
  justification      TEXT    NOT NULL,
  risk_signals       TEXT[]  NOT NULL DEFAULT '{}',
  recommended_action TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fraud_decision_justifications_decision_id_idx
  ON public.fraud_decision_justifications (decision_id);

ALTER TABLE public.fraud_decision_justifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fraud_decision_justifications_service_role_all"
  ON public.fraud_decision_justifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "fraud_decision_justifications_select_own"
  ON public.fraud_decision_justifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.fraud_decisions d
      JOIN public.fraud_events e ON e.id = d.event_id
      WHERE d.id = decision_id
        AND e.user_id = auth.uid()::text
    )
  );
