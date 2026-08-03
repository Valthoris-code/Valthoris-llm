-- Fraud pipeline constraints migration (idempotent, UPSERT-compatible)

DO $$
BEGIN
  -- fraud_workflow_runs UPSERT conflict target:
  -- (event_id, pipeline_id, mode)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'fraud_workflow_runs_event_id_pipeline_id_mode_key'
      AND c.conrelid = 'public.fraud_workflow_runs'::regclass
  ) THEN
    ALTER TABLE public.fraud_workflow_runs
      ADD CONSTRAINT fraud_workflow_runs_event_id_pipeline_id_mode_key
      UNIQUE (event_id, pipeline_id, mode);
  END IF;

  -- fraud_decisions UPSERT conflict target:
  -- (event_id, pipeline_id, mode)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'fraud_decisions_event_id_pipeline_id_mode_key'
      AND c.conrelid = 'public.fraud_decisions'::regclass
  ) THEN
    ALTER TABLE public.fraud_decisions
      ADD CONSTRAINT fraud_decisions_event_id_pipeline_id_mode_key
      UNIQUE (event_id, pipeline_id, mode);
  END IF;

  -- fraud_decision_justifications UPSERT conflict target:
  -- (decision_id)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conname = 'fraud_decision_justifications_decision_id_key'
      AND c.conrelid = 'public.fraud_decision_justifications'::regclass
  ) THEN
    ALTER TABLE public.fraud_decision_justifications
      ADD CONSTRAINT fraud_decision_justifications_decision_id_key
      UNIQUE (decision_id);
  END IF;
END $$;
