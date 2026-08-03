-- Migration: Add fraud pipeline constraints
-- Valthoris AutoShield — fraud pipeline database schema

-- ── Enum types ────────────────────────────────────────────────────────────────

CREATE TYPE public.fraud_category AS ENUM (
  'phishing',
  'smishing',
  'scam',
  'malware',
  'spam',
  'fraud',
  'impersonation',
  'crypto_fraud',
  'other'
);

CREATE TYPE public.fraud_status AS ENUM (
  'pending',
  'confirmed',
  'rejected',
  'investigating'
);

-- ── fraud_pipeline_events ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fraud_pipeline_events (
  id             UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter       TEXT               NOT NULL,
  category       public.fraud_category NOT NULL,
  target         TEXT               NOT NULL CHECK (char_length(target) >= 3),
  description    TEXT               NOT NULL CHECK (char_length(description) >= 10),
  evidence       TEXT,
  status         public.fraud_status NOT NULL DEFAULT 'pending',
  confirm_votes  INTEGER            NOT NULL DEFAULT 0 CHECK (confirm_votes >= 0),
  reject_votes   INTEGER            NOT NULL DEFAULT 0 CHECK (reject_votes >= 0),
  risk_score     INTEGER            NOT NULL DEFAULT 50
                                    CHECK (risk_score BETWEEN 0 AND 100),
  icp_report_id  TEXT               UNIQUE,
  created_at     TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ        NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fraud_pipeline_events_target
  ON public.fraud_pipeline_events (target);

CREATE INDEX IF NOT EXISTS idx_fraud_pipeline_events_status
  ON public.fraud_pipeline_events (status);

CREATE INDEX IF NOT EXISTS idx_fraud_pipeline_events_reporter
  ON public.fraud_pipeline_events (reporter);

CREATE INDEX IF NOT EXISTS idx_fraud_pipeline_events_category
  ON public.fraud_pipeline_events (category);

-- ── Auto-update trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fraud_pipeline_events_updated_at
  BEFORE UPDATE ON public.fraud_pipeline_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.fraud_pipeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read fraud events"
  ON public.fraud_pipeline_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can submit fraud reports"
  ON public.fraud_pipeline_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
