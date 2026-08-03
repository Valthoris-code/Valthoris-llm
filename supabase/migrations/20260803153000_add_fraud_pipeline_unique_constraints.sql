-- Add UNIQUE constraints to fraud pipeline tables
-- Idempotent: safe to run multiple times

CREATE UNIQUE INDEX IF NOT EXISTS uq_fraud_workflow_runs_run_id
  ON public.fraud_workflow_runs (run_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fraud_decisions_run_id
  ON public.fraud_decisions (run_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fraud_decision_justifications_decision_id_rule_id
  ON public.fraud_decision_justifications (decision_id, rule_id);
